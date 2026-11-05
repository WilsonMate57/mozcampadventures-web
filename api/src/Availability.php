<?php
/**
 * MOZ CAMP ADVENTURES — api/src/Availability.php
 * Disponibilidade dos pacotes: estado de cada data e sessão, validação no momento da reserva
 * e gestão no painel. Fuso de referência: Africa/Maputo (o da aplicação).
 *
 *  - Sem regra, o pacote está aberto «sob confirmação» e sem limite.
 *  - Ocupam capacidade: confirmada, concluida e pedido dentro da retenção (hold_expires_at).
 *    Cancelar liberta logo, porque a contagem olha sempre para o estado actual da reserva.
 *  - Concorrência: dentro da transacção da reserva, um bloqueio por pacote e data
 *    (pg_advisory_xact_lock) faz os pedidos simultâneos contarem as vagas um de cada vez.
 */

declare(strict_types=1);

final class Availability
{
    private const ACTIVE = "(b.status IN ('confirmada', 'concluida') OR (b.status = 'pedido' AND (b.hold_expires_at IS NULL OR b.hold_expires_at > now())))";
    private const LIMITED_RATIO = 0.25;
    private const MAX_RANGE_DAYS = 100;

    public static function holdHours(): int
    {
        return max(1, (int) (setting('availability')['hold_hours'] ?? 48));
    }

    private static function rule(string $item): array
    {
        $s = db()->prepare('SELECT * FROM availability_rules WHERE item_id = ?');
        $s->execute([$item]);
        $r = $s->fetch();
        if (!$r) return ['item_id' => $item, 'configured' => false, 'mode' => 'request', 'weekdays' => [0, 1, 2, 3, 4, 5, 6], 'capacity' => null, 'unit' => 'people', 'sessions' => [], 'min_notice_hours' => 0, 'max_advance_days' => null];
        return ['configured' => true, 'weekdays' => array_map('intval', Auth::parseArray($r['weekdays'])), 'sessions' => Auth::parseArray($r['sessions']),
            'capacity' => $r['capacity'] === null ? null : (int) $r['capacity'], 'min_notice_hours' => (int) $r['min_notice_hours'], 'max_advance_days' => $r['max_advance_days'] === null ? null : (int) $r['max_advance_days']] + $r;
    }

    private static function dateOf(mixed $v, string $code = 'invalid_date'): DateTimeImmutable
    {
        $d = is_string($v) ? DateTimeImmutable::createFromFormat('!Y-m-d', $v) : false;
        if (!$d || $d->format('Y-m-d') !== $v) throw new ApiError(422, $code);
        return $d;
    }

    /**
     * Estado de cada data do intervalo.
     * @param bool $public aplica antecedência mínima e máxima (o painel vê todas as datas)
     * @return array<string, array{status:string, capacity:?int, used:int, left:?int, reason:?string, sessions:list<array>}>
     */
    public static function days(string $item, DateTimeImmutable $from, DateTimeImmutable $to, bool $public = true, ?int $excludeBooking = null): array
    {
        $rule = self::rule($item);
        $f = $from->format('Y-m-d');
        $t = $to->format('Y-m-d');
        $slots = [];
        $s = db()->prepare('SELECT day, session, status, capacity, note FROM availability_slots WHERE item_id = ? AND day BETWEEN ? AND ?');
        $s->execute([$item, $f, $t]);
        foreach ($s->fetchAll() as $r) $slots[$r['day']][$r['session']] = $r;
        $blocks = db()->prepare('SELECT date_from, date_to, reason FROM availability_blocks WHERE (item_id = ? OR item_id IS NULL) AND date_from <= ? AND date_to >= ?');
        $blocks->execute([$item, $t, $f]);
        $blocks = $blocks->fetchAll();
        $used = [];
        $u = db()->prepare('SELECT s.day, s.session, count(*) AS bookings, sum(s.people) AS people FROM booking_slots s JOIN bookings b ON b.id = s.booking_id
            WHERE s.item_id = ? AND s.day BETWEEN ? AND ? AND ' . self::ACTIVE . ' AND b.id <> ? GROUP BY s.day, s.session');
        $u->execute([$item, $f, $t, $excludeBooking ?? 0]);
        foreach ($u->fetchAll() as $r) $used[$r['day']][$r['session']] = $rule['unit'] === 'units' ? (int) $r['bookings'] : (int) $r['people'];

        $now = new DateTimeImmutable('now');
        $earliest = $now->modify('+' . $rule['min_notice_hours'] . ' hours');
        $latest = $rule['max_advance_days'] !== null ? (new DateTimeImmutable('today'))->modify('+' . $rule['max_advance_days'] . ' days') : null;
        $today = $now->format('Y-m-d');
        $out = [];
        for ($d = $from; $d <= $to; $d = $d->modify('+1 day')) {
            $key = $d->format('Y-m-d');
            $daySlot = $slots[$key][''] ?? null;
            $block = null;
            foreach ($blocks as $b) if ($b['date_from'] <= $key && $b['date_to'] >= $key) $block = $b['reason'];
            $names = array_values(array_unique([...$rule['sessions'], ...array_filter(array_keys($slots[$key] ?? []), static fn ($x) => $x !== '')]));
            sort($names);
            $weekdayOpen = $rule['mode'] === 'request' || in_array((int) $d->format('w'), $rule['weekdays'], true) || ($daySlot['status'] ?? null) === 'open';
            $late = $public && ($key < $today || $key < $earliest->format('Y-m-d') || ($latest && $d > $latest));

            /* Reservas fora das sessões actuais (feitas antes de haver sessões, ou numa sessão retirada) contam contra todas: nunca há vagas a mais */
            $list = $names ?: [''];
            $orphans = array_sum(array_diff_key($used[$key] ?? [], array_flip($list)));
            $sessions = [];
            foreach ($list as $name) {
                $ss = $slots[$key][$name] ?? null;
                $cap = $ss['capacity'] ?? $daySlot['capacity'] ?? $rule['capacity'];
                $cap = $cap === null ? null : (int) $cap;
                $n = ($used[$key][$name] ?? 0) + $orphans;
                $left = $cap === null ? null : max(0, $cap - $n);
                $past = $public && $name !== '' && new DateTimeImmutable("$key $name") < $earliest;
                $status = match (true) {
                    ($ss['status'] ?? null) === 'blocked' => 'blocked',
                    $past => 'closed',
                    $left === null => 'available',
                    $left === 0 => 'sold_out',
                    $left <= max(1, (int) floor($cap * self::LIMITED_RATIO)) => 'limited',
                    default => 'available',
                };
                $sessions[] = ['time' => $name, 'status' => $status, 'capacity' => $cap, 'used' => $n, 'left' => $left];
            }
            $states = array_column($sessions, 'status');
            $open = array_values(array_filter($sessions, static fn ($x) => in_array($x['status'], ['available', 'limited'], true)));
            $status = match (true) {
                $block !== null || ($daySlot['status'] ?? null) === 'blocked' => 'blocked',
                $late || !$weekdayOpen => 'closed',
                (bool) $open => in_array('available', array_column($open, 'status'), true) ? 'available' : 'limited',
                in_array('sold_out', $states, true) => 'sold_out',
                in_array('closed', $states, true) => 'closed',
                default => 'blocked',
            };
            $caps = array_column($sessions, 'capacity');
            $unlimited = in_array(null, $caps, true);
            $out[$key] = ['status' => $status, 'capacity' => $unlimited ? null : array_sum($caps), 'used' => array_sum($used[$key] ?? []),
                'left' => $unlimited ? null : array_sum(array_column($sessions, 'left')), 'reason' => $block ?? ($daySlot['note'] ?? null), 'sessions' => $names ? $sessions : [], '_all' => $sessions];
        }
        return $out;
    }

    /* ── Site público ───────────────────────────────────── */

    /** GET /api/availability?item=&from=&to= — só o que o visitante precisa (sem notas internas). */
    public static function publicView(array $q): array
    {
        rate_limit('availability', 240, 60);
        $id = (string) ($q['item'] ?? '');
        $item = Catalog::find($id, 'pt') ?? throw new ApiError(422, 'invalid_item');
        $from = self::dateOf($q['from'] ?? date('Y-m-d'));
        $to = self::dateOf($q['to'] ?? $from->modify('+61 days')->format('Y-m-d'));
        if ($to < $from || (int) $from->diff($to)->format('%a') > self::MAX_RANGE_DAYS) throw new ApiError(422, 'invalid_range');
        $rule = self::rule($id);
        $out = [];
        foreach (self::days($id, $from, $to) as $day => $v) {
            $out[$day] = ['status' => $v['status'], 'left' => $rule['unit'] === 'people' ? $v['left'] : null,
                'sessions' => array_map(static fn ($x) => ['time' => $x['time'], 'status' => $x['status'], 'left' => $rule['unit'] === 'people' ? $x['left'] : null], $v['sessions'])];
        }
        return ['item' => $id, 'unit' => $rule['unit'], 'today' => date('Y-m-d'), 'days' => $out, 'disabled' => !empty($item['disabled'])];
    }

    /* ── Reserva: validação dentro da transacção ────────── */

    private static function lockDays(string $item, array $days): void
    {
        sort($days);          // sempre pela mesma ordem, para duas reservas de várias noites não se bloquearem mutuamente
        foreach ($days as $d) db()->prepare('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))')->execute(["avail:$item:$d"]);
    }

    /**
     * Valida e reserva a capacidade. Tem de correr dentro da transacção que grava a reserva.
     * @param bool $override só no painel: regista apesar do limite ou do bloqueio
     * @return array{session:?string, days:list<string>, people:int}
     */
    public static function claim(string $item, array $q, array $in, bool $isAdmin, bool $override = false): array
    {
        $dates = $q['dates'];
        if (isset($dates['service_date'])) {
            $days = [$dates['service_date']];
        } else {
            $days = [];
            for ($d = new DateTimeImmutable($dates['checkin']); $d->format('Y-m-d') < $dates['checkout']; $d = $d->modify('+1 day')) $days[] = $d->format('Y-m-d');
        }
        self::lockDays($item, $days);
        $rule = self::rule($item);
        $state = self::days($item, new DateTimeImmutable($days[0]), new DateTimeImmutable(end($days)), !$isAdmin);
        $need = $rule['unit'] === 'units' ? 1 : (int) $q['pax'];
        $wanted = is_string($in['session'] ?? null) ? trim($in['session']) : '';
        $session = null;
        foreach ($days as $day) {
            $v = $state[$day];
            $list = $v['_all'];
            $named = array_values(array_filter($list, static fn ($x) => $x['time'] !== ''));
            if ($named) {
                if ($wanted === '' && count($named) === 1) $wanted = $named[0]['time'];
                if ($wanted === '') {
                    if ($override) { $target = $named[0]; $wanted = $target['time']; } else throw new ApiError(422, 'session_required');
                }
                $target = array_values(array_filter($named, static fn ($x) => $x['time'] === $wanted))[0] ?? null;
                if (!$target && !$override) throw new ApiError(422, 'invalid_session');
                $session = $wanted;
            } else {
                $target = $list[0];
            }
            if ($override) continue;
            if ($v['status'] === 'blocked' || ($target['status'] ?? '') === 'blocked') throw new ApiError(422, 'date_blocked', '', ['date' => $day]);
            if ($v['status'] === 'closed' || ($target['status'] ?? '') === 'closed') throw new ApiError(422, 'date_closed', '', ['date' => $day]);
            if ($target['left'] !== null && $target['left'] < $need) {
                throw new ApiError(422, $target['left'] === 0 ? 'sold_out' : 'not_enough_places', '', ['date' => $day, 'left' => $target['left']]);
            }
        }
        return ['session' => $session, 'days' => $days, 'people' => max(1, (int) $q['pax'])];
    }

    public static function attach(int $bookingId, string $item, array $claim): void
    {
        $ins = db()->prepare('INSERT INTO booking_slots (booking_id, item_id, day, session, people) VALUES (?, ?, ?, ?, ?)');
        foreach ($claim['days'] as $d) $ins->execute([$bookingId, $item, $d, $claim['session'] ?? '', $claim['people']]);
    }

    /**
     * Antes de voltar a ocupar vagas (confirmar um pedido cuja retenção expirou, reabrir um cancelado):
     * confirma que ainda há lugar. Chamar dentro da transacção da mudança de estado.
     */
    public static function recheck(array $b, bool $force): void
    {
        $s = db()->prepare('SELECT day, session FROM booking_slots WHERE booking_id = ? ORDER BY day');
        $s->execute([$b['id']]);
        $rows = $s->fetchAll();
        if (!$rows || $force) return;
        self::lockDays($b['item_id'], array_column($rows, 'day'));
        $rule = self::rule($b['item_id']);
        $need = $rule['unit'] === 'units' ? 1 : max(1, (int) $b['adults'] + (int) $b['children']);
        foreach ($rows as $r) {
            $d = new DateTimeImmutable($r['day']);
            $v = self::days($b['item_id'], $d, $d, false, (int) $b['id'])[$r['day']];
            foreach ($v['_all'] as $x) {
                if ($x['time'] === $r['session'] && $x['left'] !== null && $x['left'] < $need) {
                    throw new ApiError(409, 'sold_out', '', ['date' => $r['day'], 'left' => $x['left']]);
                }
            }
        }
    }

    /* ── Painel ─────────────────────────────────────────── */

    private static function range(array $q): array
    {
        $from = self::dateOf($q['from'] ?? date('Y-m-01'));
        $to = self::dateOf($q['to'] ?? $from->modify('last day of this month')->format('Y-m-d'));
        if ($to < $from || (int) $from->diff($to)->format('%a') > self::MAX_RANGE_DAYS) throw new ApiError(422, 'invalid_range');
        return [$from, $to];
    }

    private static function checkItem(string $id): array
    {
        return Catalog::list()[$id] ?? throw new ApiError(404, 'not_found');
    }

    /** Calendário: um pacote em detalhe, ou o resumo de todos (filtro opcional por categoria). */
    public static function calendar(array $q): array
    {
        [$from, $to] = self::range($q);
        $items = Catalog::list();
        $cats = array_values(array_unique(array_filter(array_column($items, 'category'))));
        $list = array_values(array_map(static fn ($x) => ['id' => $x['id'], 'name' => $x['name'], 'category' => $x['category'], 'kind' => $x['kind']], $items));
        $id = (string) ($q['item'] ?? '');
        if ($id !== '') {
            self::checkItem($id);
            $days = self::days($id, $from, $to, false);
            foreach ($days as &$v) { $v['sessions'] = $v['_all']; unset($v['_all']); }
            unset($v);
            return ['items' => $list, 'categories' => $cats, 'item' => $id, 'rule' => self::rule($id), 'days' => $days, 'hold_hours' => self::holdHours()];
        }
        $cat = (string) ($q['category'] ?? '');
        $sum = [];
        foreach ($items as $it) {
            if (!empty($it['disabled']) || ($cat !== '' && $it['category'] !== $cat)) continue;
            foreach (self::days($it['id'], $from, $to, false) as $day => $v) {
                $sum[$day] ??= ['available' => 0, 'limited' => 0, 'sold_out' => 0, 'blocked' => 0, 'closed' => 0, 'bookings' => 0];
                $sum[$day][$v['status']]++;
            }
        }
        $b = db()->prepare('SELECT s.day, count(DISTINCT s.booking_id) AS n FROM booking_slots s JOIN bookings b ON b.id = s.booking_id WHERE s.day BETWEEN ? AND ? AND ' . self::ACTIVE . ' GROUP BY s.day');
        $b->execute([$from->format('Y-m-d'), $to->format('Y-m-d')]);
        foreach ($b->fetchAll() as $r) if (isset($sum[$r['day']])) $sum[$r['day']]['bookings'] = (int) $r['n'];
        return ['items' => $list, 'categories' => $cats, 'item' => null, 'summary' => $sum, 'hold_hours' => self::holdHours()];
    }

    /** Uma data: sessões, vagas e reservas com participantes. */
    public static function day(array $q): array
    {
        $date = self::dateOf($q['date'] ?? null);
        $key = $date->format('Y-m-d');
        $id = (string) ($q['item'] ?? '');
        $sql = 'SELECT b.reference, b.item_name, b.customer_name, b.customer_phone, b.adults, b.children, b.status, b.hold_expires_at, s.session, ' . self::ACTIVE . ' AS holds
            FROM booking_slots s JOIN bookings b ON b.id = s.booking_id WHERE s.day = ? AND b.status <> \'cancelada\'' . ($id !== '' ? ' AND s.item_id = ?' : '') . ' ORDER BY s.session, b.id';
        $s = db()->prepare($sql);
        $s->execute($id !== '' ? [$key, $id] : [$key]);
        $out = ['date' => $key, 'bookings' => $s->fetchAll()];
        if ($id !== '') {
            self::checkItem($id);
            $v = self::days($id, $date, $date, false)[$key];
            $v['sessions'] = $v['_all'];
            unset($v['_all']);
            $slot = db()->prepare('SELECT session, status, capacity, note FROM availability_slots WHERE item_id = ? AND day = ?');
            $slot->execute([$id, $key]);
            $out += ['state' => $v, 'overrides' => $slot->fetchAll(), 'rule' => self::rule($id)];
        }
        return $out;
    }

    public static function saveRule(string $id, array $in, array $u): array
    {
        self::checkItem($id);
        $mode = ($in['mode'] ?? 'request') === 'scheduled' ? 'scheduled' : 'request';
        $days = array_values(array_unique(array_filter(array_map('intval', is_array($in['weekdays'] ?? null) ? $in['weekdays'] : []), static fn ($d) => $d >= 0 && $d <= 6)));
        sort($days);
        if ($mode === 'scheduled' && !$days) throw new ApiError(422, 'weekdays_required');
        $cap = self::intOrNull($in['capacity'] ?? null, 1, 100000, 'invalid_capacity');
        $sessions = [];
        foreach (is_array($in['sessions'] ?? null) ? $in['sessions'] : [] as $t) {
            $t = trim((string) $t);
            if ($t === '') continue;
            if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t)) throw new ApiError(422, 'invalid_session');
            $sessions[] = $t;
        }
        $sessions = array_values(array_unique($sessions));
        sort($sessions);
        $notice = self::intOrNull($in['min_notice_hours'] ?? null, 0, 8760, 'invalid_notice') ?? 0;
        $advance = self::intOrNull($in['max_advance_days'] ?? null, 1, 1095, 'invalid_advance');
        db()->prepare('INSERT INTO availability_rules (item_id, mode, weekdays, capacity, unit, sessions, min_notice_hours, max_advance_days, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, now(), ?)
            ON CONFLICT (item_id) DO UPDATE SET mode = EXCLUDED.mode, weekdays = EXCLUDED.weekdays, capacity = EXCLUDED.capacity, unit = EXCLUDED.unit, sessions = EXCLUDED.sessions,
              min_notice_hours = EXCLUDED.min_notice_hours, max_advance_days = EXCLUDED.max_advance_days, updated_at = now(), updated_by = EXCLUDED.updated_by')
            ->execute([$id, $mode, '{' . implode(',', $days ?: [0, 1, 2, 3, 4, 5, 6]) . '}', $cap, ($in['unit'] ?? '') === 'units' ? 'units' : 'people', '{' . implode(',', array_map(static fn ($s) => "\"$s\"", $sessions)) . '}', $notice, $advance, $u['name']]);
        Audit::log('availability_rule', 'availability', $id, ['mode' => $mode, 'capacity' => $cap, 'sessions' => $sessions]);
        return ['ok' => true, 'rule' => self::rule($id)];
    }

    private static function intOrNull(mixed $v, int $min, int $max, string $code): ?int
    {
        if ($v === null || $v === '') return null;
        $n = filter_var($v, FILTER_VALIDATE_INT);
        if ($n === false || $n < $min || $n > $max) throw new ApiError(422, $code);
        return $n;
    }

    /** Abrir, bloquear, mudar capacidade ou repor a regra em datas ou sessões. {item, dates[], session?, action, capacity?, note?} */
    public static function saveDates(array $in, array $u): array
    {
        $id = (string) ($in['item'] ?? '');
        self::checkItem($id);
        $action = (string) ($in['action'] ?? '');
        if (!in_array($action, ['open', 'block', 'capacity', 'reset', 'add_session', 'remove_session'], true)) throw new ApiError(422, 'invalid_action');
        $dates = array_slice(is_array($in['dates'] ?? null) ? $in['dates'] : [], 0, 370);
        if (!$dates) throw new ApiError(422, 'invalid_date');
        $session = trim((string) ($in['session'] ?? ''));
        if ($session !== '' && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $session)) throw new ApiError(422, 'invalid_session');
        if (in_array($action, ['add_session', 'remove_session'], true) && $session === '') throw new ApiError(422, 'invalid_session');
        $cap = $action === 'capacity' ? (self::intOrNull($in['capacity'] ?? null, 0, 100000, 'invalid_capacity') ?? throw new ApiError(422, 'invalid_capacity')) : null;
        $note = clean_text($in['note'] ?? '', 300) ?: null;
        $pdo = db();
        $pdo->beginTransaction();
        try {
            foreach ($dates as $d) {
                $day = self::dateOf($d)->format('Y-m-d');
                if ($action === 'reset' || $action === 'remove_session') {
                    $pdo->prepare('DELETE FROM availability_slots WHERE item_id = ? AND day = ? AND session = ?')->execute([$id, $day, $session]);
                    continue;
                }
                $status = ['open' => 'open', 'block' => 'blocked', 'add_session' => 'open'][$action] ?? null;
                $pdo->prepare('INSERT INTO availability_slots (item_id, day, session, status, capacity, note, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (item_id, day, session) DO UPDATE SET status = coalesce(EXCLUDED.status, availability_slots.status), capacity = coalesce(EXCLUDED.capacity, availability_slots.capacity), note = coalesce(EXCLUDED.note, availability_slots.note), updated_at = now(), updated_by = EXCLUDED.updated_by')
                    ->execute([$id, $day, $session, $status, $cap, $note, $u['name']]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        Audit::log('availability_dates', 'availability', $id, ['action' => $action, 'dates' => count($dates), 'session' => $session, 'capacity' => $cap]);
        return ['ok' => true];
    }

    public static function blocks(): array
    {
        return ['blocks' => db()->query('SELECT id, item_id, date_from, date_to, reason, created_by FROM availability_blocks WHERE date_to >= current_date ORDER BY date_from, id')->fetchAll()];
    }

    public static function addBlock(array $in, array $u): array
    {
        $id = (string) ($in['item'] ?? '');
        if ($id !== '') self::checkItem($id);
        $from = self::dateOf($in['from'] ?? null);
        $to = self::dateOf($in['to'] ?? null);
        if ($to < $from) throw new ApiError(422, 'invalid_range');
        $reason = clean_text($in['reason'] ?? '', 200);
        if (strlen($reason) < 3) throw new ApiError(422, 'reason_required');
        db()->prepare('INSERT INTO availability_blocks (item_id, date_from, date_to, reason, created_by) VALUES (?, ?, ?, ?, ?)')->execute([$id ?: null, $from->format('Y-m-d'), $to->format('Y-m-d'), $reason, $u['name']]);
        Audit::log('availability_block', 'availability', $id ?: 'todos', ['from' => $from->format('Y-m-d'), 'to' => $to->format('Y-m-d'), 'reason' => $reason]);
        return ['ok' => true] + self::blocks();
    }

    public static function removeBlock(int $blockId, array $u): array
    {
        $s = db()->prepare('DELETE FROM availability_blocks WHERE id = ? RETURNING item_id, date_from, date_to');
        $s->execute([$blockId]);
        $r = $s->fetch() ?: throw new ApiError(404, 'not_found');
        Audit::log('availability_unblock', 'availability', $r['item_id'] ?? 'todos', $r);
        return ['ok' => true] + self::blocks();
    }

    /** Horas que um pedido por confirmar ocupa vagas. */
    public static function saveSettings(array $in, array $u): array
    {
        $h = self::intOrNull($in['hold_hours'] ?? null, 1, 720, 'invalid_hold') ?? throw new ApiError(422, 'invalid_hold');
        db()->prepare('INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by')
            ->execute(['availability', json_encode(['hold_hours' => $h]), $u['id']]);
        Audit::log('settings_availability', 'settings', 'availability', ['hold_hours' => $h]);
        return ['ok' => true, 'hold_hours' => $h];
    }

    /** Visão geral dos próximos 30 dias: só dados reais. */
    public static function summary(): array
    {
        $from = new DateTimeImmutable('today');
        $to = $from->modify('+29 days');
        $rules = db()->query('SELECT item_id FROM availability_rules')->fetchAll(PDO::FETCH_COLUMN);
        $items = Catalog::list();
        $near = [];
        $sold = $blocked = 0;
        $left = 0;
        $active = 0;
        foreach ($items as $id => $it) {
            if (!empty($it['disabled'])) continue;
            $active++;
            foreach (self::days($id, $from, $to, false) as $day => $v) {
                if ($v['status'] === 'sold_out') $sold++;
                if ($v['status'] === 'blocked') $blocked++;
                if ($v['left'] !== null && !in_array($v['status'], ['blocked', 'closed'], true)) $left += $v['left'];
                if (in_array($v['status'], ['limited', 'sold_out'], true)) $near[] = ['item' => $id, 'name' => $it['name'], 'date' => $day, 'status' => $v['status'], 'left' => $v['left'], 'capacity' => $v['capacity']];
            }
        }
        usort($near, static fn ($a, $b) => [$a['date'], $a['name']] <=> [$b['date'], $b['name']]);
        $demand = db()->query("SELECT item_id, item_name, count(*) AS requests FROM bookings WHERE created_at > now() - interval '30 days' AND status <> 'cancelada' GROUP BY item_id, item_name ORDER BY requests DESC LIMIT 5")->fetchAll();
        return ['packages_active' => $active, 'packages_configured' => count(array_intersect($rules, array_keys($items))), 'sold_out_dates' => $sold, 'blocked_dates' => $blocked, 'places_left' => $left,
            'near_full' => array_slice($near, 0, 12), 'demand' => $demand, 'hold_hours' => self::holdHours()];
    }
}
