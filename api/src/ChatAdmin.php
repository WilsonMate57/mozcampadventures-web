<?php
/**
 * MOZ CAMP ADVENTURES — api/src/ChatAdmin.php
 * Live Chat do lado da equipa (/api/admin/chat*). Ler exige chat.view; responder e gerir exigem chat.manage.
 * Auth::require valida a sessão e, nas escritas, o CSRF e a origem.
 */

declare(strict_types=1);

final class ChatAdmin
{
    private const FILTERS = [
        'open' => "c.status = 'open'",
        'new' => "c.status = 'open' AND c.first_response_at IS NULL",
        'unassigned' => "c.status = 'open' AND c.assigned_to IS NULL",
        'active' => "c.status = 'open' AND c.assigned_to IS NOT NULL",
        'waiting' => "c.status = 'open' AND c.last_sender = 'visitor'",
        'closed' => "c.status = 'closed'",
    ];

    public static function route(string $method, string $path): mixed
    {
        $routes = [
            ['GET', '#^/chat$#', fn () => self::list(Auth::require('chat.view'), $_GET)],
            ['POST', '#^/chat/heartbeat$#', fn () => self::heartbeat(Auth::require('chat.manage'), json_input())],
            ['GET', '#^/chat/settings$#', fn () => (Auth::require('chat.view') ? Chat::settings() : null)],
            ['POST', '#^/chat/settings$#', fn () => self::saveSettings(Auth::require('settings.manage'), json_input())],
            ['GET', '#^/chat/file/(\d+)$#', fn ($m) => self::file(Auth::require('chat.view'), (int) $m[1])],
            ['GET', '#^/chat/(\d+)$#', fn ($m) => self::detail(Auth::require('chat.view'), (int) $m[1], $_GET)],
            ['POST', '#^/chat/(\d+)/messages$#', fn ($m) => self::reply(Auth::require('chat.manage'), (int) $m[1], json_input(16384))],
            ['POST', '#^/chat/(\d+)/upload$#', fn ($m) => self::upload(Auth::require('chat.manage'), (int) $m[1])],
            ['POST', '#^/chat/(\d+)/typing$#', fn ($m) => self::typing(Auth::require('chat.manage'), (int) $m[1])],
            ['POST', '#^/chat/(\d+)/assign$#', fn ($m) => self::assign(Auth::require('chat.manage'), (int) $m[1], json_input())],
            ['POST', '#^/chat/(\d+)/notes$#', fn ($m) => self::note(Auth::require('chat.manage'), (int) $m[1], json_input(8192))],
            ['POST', '#^/chat/(\d+)/close$#', fn ($m) => self::setStatus(Auth::require('chat.manage'), (int) $m[1], 'closed')],
            ['POST', '#^/chat/(\d+)/reopen$#', fn ($m) => self::setStatus(Auth::require('chat.manage'), (int) $m[1], 'open')],
            ['POST', '#^/chat/(\d+)/booking$#', fn ($m) => self::linkBooking(Auth::require('chat.manage'), (int) $m[1], json_input())],
        ];
        foreach ($routes as [$verb, $re, $fn]) {
            if ($verb === $method && preg_match($re, $path, $m) === 1) return $fn($m);
        }
        throw new ApiError(404, 'not_found');
    }

    private static function conv(int $id): array
    {
        $s = db()->prepare('SELECT * FROM chat_conversations WHERE id = ?');
        $s->execute([$id]);
        return $s->fetch() ?: throw new ApiError(404, 'not_found');
    }

    /* ── Lista e indicadores ────────────────────────────── */

    private static function list(array $u, array $q): array
    {
        $filter = array_key_exists($q['filter'] ?? '', self::FILTERS) ? $q['filter'] : 'open';
        $where = [self::FILTERS[$filter]];
        $args = [];
        $term = clean_text($q['q'] ?? '', 80);
        if ($term !== '') {
            $like = '%' . addcslashes($term, '%_\\') . '%';
            $where = ['(c.name ILIKE ? OR c.email ILIKE ? OR c.phone ILIKE ?)'];   // a pesquisa abrange todas as conversas
            array_push($args, $like, $like, $like);
        }
        $s = db()->prepare('SELECT c.id, c.status, c.name, c.email, c.phone, c.subject, c.last_message_at, c.last_sender, c.last_preview, c.assigned_to, c.offline, c.first_response_at, u.name AS assigned_name,
            (SELECT count(*) FROM chat_messages m WHERE m.conversation_id = c.id AND m.id > c.agent_read_id AND m.sender = \'visitor\') AS unread
            FROM chat_conversations c LEFT JOIN users u ON u.id = c.assigned_to WHERE ' . implode(' AND ', $where) . ' ORDER BY c.last_message_at DESC LIMIT 100');
        $s->execute($args);
        $rows = array_map(static fn ($r) => ['subject_label' => Chat::subjectLabel($r['subject']), 'unread' => (int) $r['unread']] + $r, $s->fetchAll());
        $counts = [];
        foreach (self::FILTERS as $k => $sql) $counts[] = "count(*) FILTER (WHERE $sql) AS \"$k\"";
        return ['conversations' => $rows, 'counts' => array_map('intval', db()->query('SELECT ' . implode(', ', $counts) . ' FROM chat_conversations c')->fetch()), 'stats' => self::stats(), 'agents' => self::agents(), 'me' => $u['id'], 'state' => Chat::state()];
    }

    /** Dados reais dos últimos 30 dias. O tempo de resposta exclui mensagens deixadas sem equipa disponível. */
    public static function stats(): array
    {
        $r = db()->query("SELECT count(*) FILTER (WHERE created_at > now() - interval '30 days') AS received,
            count(*) FILTER (WHERE status = 'open' AND last_sender = 'visitor') AS pending,
            count(*) FILTER (WHERE created_at > now() - interval '30 days' AND first_response_at IS NOT NULL) AS attended,
            round(avg(extract(epoch FROM first_response_at - created_at)) FILTER (WHERE created_at > now() - interval '30 days' AND NOT offline)) AS first_response
            FROM chat_conversations")->fetch();
        return ['received' => (int) $r['received'], 'pending' => (int) $r['pending'], 'attended' => (int) $r['attended'], 'first_response' => $r['first_response'] === null ? null : (int) $r['first_response']];
    }

    private static function agents(): array
    {
        return db()->query('SELECT u.id, u.name, ' . Chat::EFFECTIVE . " AS state FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN chat_agents a ON a.user_id = u.id
            WHERE u.active AND r.permissions && ARRAY['*', 'chat.manage']::text[] ORDER BY u.name")->fetchAll();
    }

    /* ── Conversa ───────────────────────────────────────── */

    private static function detail(array $u, int $id, array $q): array
    {
        $s = db()->prepare("SELECT c.*, a.name AS assigned_name, t.name AS typing_name,
            c.visitor_typing_at > now() - interval '6 seconds' AS visitor_typing, c.visitor_seen_at > now() - interval '30 seconds' AS visitor_here,
            c.agent_typing_at > now() - interval '6 seconds' AND c.agent_typing_user <> ? AS other_typing
            FROM chat_conversations c LEFT JOIN users a ON a.id = c.assigned_to LEFT JOIN users t ON t.id = c.agent_typing_user WHERE c.id = ?");
        $s->execute([$u['id'], $id]);
        $c = $s->fetch() ?: throw new ApiError(404, 'not_found');
        unset($c['token_hash'], $c['ip_hash']);
        $m = db()->prepare('SELECT id, sender, author, body, file_name, file_mime, file_size, client_id, created_at FROM chat_messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT 500');
        $m->execute([$id, max(0, (int) ($q['after'] ?? 0))]);
        $n = db()->prepare('SELECT id, author, body, created_at FROM chat_notes WHERE conversation_id = ? ORDER BY id');
        $n->execute([$id]);
        if (!empty($q['read'])) {
            db()->prepare('UPDATE chat_conversations SET agent_read_id = GREATEST(agent_read_id, (SELECT coalesce(max(id), 0) FROM chat_messages WHERE conversation_id = ?)) WHERE id = ?')->execute([$id, $id]);
        }
        $c['subject_label'] = Chat::subjectLabel((string) $c['subject']);
        $item = $c['item_id'] ? Catalog::find((string) $c['item_id'], 'pt') : null;
        return ['conversation' => $c, 'messages' => $m->fetchAll(), 'notes' => $n->fetchAll(),
            'item' => $item ? ['id' => $c['item_id'], 'name' => $item['name'] ?? '', 'location' => $item['location'] ?? null, 'price_from' => $item['price_from'] ?? null] : null,
            'booking' => $c['booking_id'] && Auth::has('bookings.view') ? self::booking((int) $c['booking_id']) : null,
            'related' => Auth::has('bookings.view') ? self::related((string) $c['email'], $c['booking_id'] ? (int) $c['booking_id'] : 0) : []];
    }

    private static function booking(int $id): ?array
    {
        $s = db()->prepare('SELECT reference, status, item_name, coalesce(service_date, checkin) AS date, adults + children AS pax, total_estimate, total_to_confirm FROM bookings WHERE id = ?');
        $s->execute([$id]);
        return $s->fetch() ?: null;
    }

    /** Outras reservas com o mesmo e-mail, para a equipa associar à conversa. */
    private static function related(string $email, int $except): array
    {
        $s = db()->prepare('SELECT reference, status, item_name, coalesce(service_date, checkin) AS date FROM bookings WHERE lower(customer_email) = ? AND id <> ? ORDER BY id DESC LIMIT 5');
        $s->execute([strtolower($email), $except]);
        return $s->fetchAll();
    }

    private static function reply(array $u, int $id, array $in): array
    {
        if (self::conv($id)['status'] === 'closed') throw new ApiError(409, 'chat_closed');
        $text = clean_text($in['body'] ?? '', Chat::MAX_TEXT);
        if ($text === '') throw new ApiError(422, 'invalid_message');
        return ['message' => Chat::add($id, 'agent', self::firstName($u), $text, Chat::clientId($in['client_id'] ?? null), null, (int) $u['id'])];
    }

    private static function upload(array $u, int $id): array
    {
        if (self::conv($id)['status'] === 'closed') throw new ApiError(409, 'chat_closed');
        $file = Chat::saveFile($id);
        return ['message' => Chat::add($id, 'agent', self::firstName($u), '', Chat::clientId($_POST['client_id'] ?? null), $file, (int) $u['id'])];
    }

    /** O visitante só vê o primeiro nome de quem o atende. */
    private static function firstName(array $u): string
    {
        return strtok((string) $u['name'], ' ') ?: 'Equipa';
    }

    private static function typing(array $u, int $id): array
    {
        db()->prepare('UPDATE chat_conversations SET agent_typing_at = now(), agent_typing_user = ? WHERE id = ?')->execute([$u['id'], $id]);
        return ['ok' => true];
    }

    /** take: assumir (só se estiver livre). user_id: atribuir a outro agente, ou null para libertar. */
    private static function assign(array $u, int $id, array $in): array
    {
        self::conv($id);
        if (!empty($in['take'])) {
            $s = db()->prepare('UPDATE chat_conversations SET assigned_to = ? WHERE id = ? AND (assigned_to IS NULL OR assigned_to = ?)');
            $s->execute([$u['id'], $id, $u['id']]);
            if ($s->rowCount() === 0) throw new ApiError(409, 'chat_already_assigned');
            $to = (int) $u['id'];
        } else {
            $to = isset($in['user_id']) ? (int) $in['user_id'] : null;
            if ($to !== null && !in_array($to, array_map(static fn ($a) => (int) $a['id'], self::agents()), true)) throw new ApiError(422, 'chat_invalid_agent');
            db()->prepare('UPDATE chat_conversations SET assigned_to = ? WHERE id = ?')->execute([$to, $id]);
        }
        Audit::log('chat_assign', 'chat', $id, ['to' => $to]);
        return ['ok' => true, 'assigned_to' => $to];
    }

    private static function note(array $u, int $id, array $in): array
    {
        self::conv($id);
        $text = clean_text($in['body'] ?? '', Chat::MAX_TEXT);
        if ($text === '') throw new ApiError(422, 'note_required');
        db()->prepare('INSERT INTO chat_notes (conversation_id, user_id, author, body) VALUES (?, ?, ?, ?)')->execute([$id, $u['id'], $u['name'], $text]);
        Audit::log('chat_note', 'chat', $id);       // sem o texto
        return ['ok' => true];
    }

    private static function setStatus(array $u, int $id, string $status): array
    {
        self::conv($id);
        db()->prepare("UPDATE chat_conversations SET status = ?, closed_at = CASE WHEN ? = 'closed' THEN now() END WHERE id = ?")->execute([$status, $status, $id]);
        Audit::log($status === 'closed' ? 'chat_close' : 'chat_reopen', 'chat', $id);
        return ['ok' => true, 'status' => $status];
    }

    private static function linkBooking(array $u, int $id, array $in): array
    {
        self::conv($id);
        $s = db()->prepare('SELECT id FROM bookings WHERE reference = ?');
        $s->execute([clean_text($in['reference'] ?? '', 30)]);
        $b = $s->fetchColumn();
        if ($b === false) throw new ApiError(404, 'not_found');
        db()->prepare('UPDATE chat_conversations SET booking_id = ? WHERE id = ?')->execute([$b, $id]);
        Audit::log('chat_link_booking', 'chat', $id, ['booking' => (int) $b]);
        return ['ok' => true];
    }

    private static function file(array $u, int $id): never
    {
        $s = db()->prepare('SELECT * FROM chat_messages WHERE id = ? AND file_path IS NOT NULL');
        $s->execute([$id]);
        Chat::stream($s->fetch() ?: throw new ApiError(404, 'not_found'));
    }

    /* ── Presença ───────────────────────────────────────── */

    /** O painel chama isto de 30 em 30 segundos. active = houve interacção real desde a última chamada. */
    private static function heartbeat(array $u, array $in): array
    {
        $status = in_array($in['status'] ?? null, ['online', 'away', 'offline'], true) ? $in['status'] : null;
        $active = !empty($in['active']) || $status !== null;
        db()->prepare("INSERT INTO chat_agents (user_id, status, last_seen_at, last_active_at) VALUES (?, coalesce(?, 'offline'), now(), now())
            ON CONFLICT (user_id) DO UPDATE SET status = coalesce(?, chat_agents.status), last_seen_at = now(), last_active_at = CASE WHEN ? THEN now() ELSE chat_agents.last_active_at END")
            ->execute([$u['id'], $status, $status, $active ? 't' : 'f']);
        if ($status !== null) Audit::log('chat_status', 'chat', null, ['status' => $status]);
        $s = db()->prepare('SELECT a.status, ' . Chat::EFFECTIVE . ' AS effective FROM chat_agents a WHERE a.user_id = ?');
        $s->execute([$u['id']]);
        return $s->fetch() + ['waiting' => self::stats()['pending']];
    }

    /* ── Definições ─────────────────────────────────────── */

    private static function saveSettings(array $u, array $in): array
    {
        $hours = [];
        foreach (is_array($in['hours'] ?? null) ? $in['hours'] : [] as $day => $h) {
            if (!in_array((string) $day, ['1', '2', '3', '4', '5', '6', '7'], true) || !is_array($h)) throw new ApiError(422, 'chat_invalid_hours');
            $from = (string) ($h['from'] ?? '');
            $to = (string) ($h['to'] ?? '');
            if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $from) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $to) || $from >= $to) throw new ApiError(422, 'chat_invalid_hours');
            $hours[(string) $day] = ['from' => $from, 'to' => $to];
        }
        $v = ['enabled' => !empty($in['enabled']), 'hours' => (object) $hours, 'retention_months' => max(1, min(24, (int) ($in['retention_months'] ?? 12))), 'notify_offline' => !empty($in['notify_offline'])];
        db()->prepare('INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by')
            ->execute(['chat', json_encode($v, JSON_UNESCAPED_UNICODE), $u['id']]);
        Audit::log('settings_chat', 'settings', 'chat', ['enabled' => $v['enabled'], 'retention_months' => $v['retention_months']]);
        return ['ok' => true, 'settings' => Chat::settings()];
    }
}
