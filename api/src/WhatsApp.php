<?php
/**
 * MOZ CAMP ADVENTURES — api/src/WhatsApp.php
 * Meta WhatsApp Business Cloud API (oficial): mensagens a clientes e avisos à equipa.
 *
 *  - Mensagens iniciadas pela empresa usam MODELOS aprovados pela Meta (textos: docs/WHATSAPP.md).
 *  - Clientes: só com consentimento na reserva, sem pedido de saída (STOP) e com o envio ligado no painel.
 *  - Fila: cada mensagem é uma linha em whatsapp_messages com chave única (dedupe_key). É enviada logo
 *    depois da reserva; o que falhar é repetido por api/bin/worker.php (tarefa agendada no Plesk).
 *  - Estados: pending → sent (aceite pela Meta) → delivered → read, ou failed. «sent» não significa entregue:
 *    a entrega e a leitura chegam pelo webhook.
 *  - Sem resposta da Meta (tempo esgotado) não se repete sozinho: a mensagem pode ter saído. Fica «failed»
 *    para decisão no painel.
 *  - Credenciais: variável de ambiente, ou cifradas em settings «whatsapp_secrets» (chave derivada de
 *    app.secret, que fica fora da base de dados), ou private/mca-config.php. Nunca são devolvidas à API.
 *  - whatsapp.mode = 'log' (desenvolvimento) regista sem enviar.
 *  - Nunca bloqueia o pedido de reserva: quem chama apanha as excepções.
 */

declare(strict_types=1);

final class WhatsApp
{
    private const API = 'https://graph.facebook.com';
    private const MAX_ATTEMPTS = 5;
    private const SECRETS = ['token' => 'WHATSAPP_TOKEN', 'app_secret' => 'WHATSAPP_APP_SECRET', 'verify_token' => 'WHATSAPP_VERIFY_TOKEN'];
    private const STOP_WORDS = ['stop', 'parar', 'sair', 'unsubscribe'];
    private const RANK = ['pending' => 0, 'logged' => 1, 'sent' => 1, 'delivered' => 2, 'read' => 3];
    /* Modelos a aprovar na Meta (docs/WHATSAPP.md §3): mesmo nome em pt_PT e em inglês */
    public const TEMPLATES = ['booking_received' => 'mca_reserva_recebida', 'booking_confirmed' => 'mca_reserva_confirmada', 'booking_changed' => 'mca_reserva_alterada',
        'booking_cancelled' => 'mca_reserva_cancelada', 'activity_reminder' => 'mca_lembrete_actividade'];

    /* ── Configuração ───────────────────────────────────── */

    private static function api(): array
    {
        return setting('whatsapp_api') + ['customer_enabled' => false, 'reminder_days' => 1, 'events' => []];
    }

    /** Valor não secreto: painel, depois a configuração do servidor. */
    private static function cfg(string $key, string $default = ''): string
    {
        $v = self::api()[$key] ?? '';
        if ($v === '' || $v === null) $v = config("whatsapp.$key");
        return (string) ($v ?: $default);
    }

    private static function key(): string
    {
        return hash_hmac('sha256', 'whatsapp-secrets', (string) config('app.secret'), true);
    }

    private static function encrypt(string $plain): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $ct = openssl_encrypt($plain, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        return base64_encode($iv . $tag . $ct);
    }

    private static function decrypt(string $b64): string
    {
        $raw = (string) base64_decode($b64, true);
        if (strlen($raw) < 29) return '';
        return (string) openssl_decrypt(substr($raw, 28), 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    }

    private static function credential(string $name): string
    {
        $env = getenv(self::SECRETS[$name]);
        if (is_string($env) && $env !== '') return $env;
        $stored = setting('whatsapp_secrets')[$name] ?? '';
        if ($stored !== '' && ($v = self::decrypt($stored)) !== '') return $v;
        return (string) (config("whatsapp.$name") ?? '');
    }

    private static function configured(): bool
    {
        return config('whatsapp.mode') === 'log' || (self::credential('token') !== '' && self::cfg('phone_number_id') !== '');
    }

    private static function mask(string $v): string
    {
        return $v === '' ? '' : str_repeat('•', max(0, strlen($v) - 4)) . substr($v, -4);
    }

    /** Estado para o painel: só se existe, nunca o valor. */
    public static function status(): array
    {
        $s = setting('whatsapp');
        $a = self::api();
        return ['configured' => self::configured(), 'mode' => config('whatsapp.mode') === 'log' ? 'log' : 'api',
            'template' => self::cfg('template', 'nova_reserva'), 'language' => self::cfg('language', 'pt_PT'), 'language_en' => self::cfg('language_en', 'en_US'),
            'phone_number_id' => self::mask(self::cfg('phone_number_id')), 'waba_id' => self::cfg('waba_id'), 'app_id' => self::cfg('app_id'), 'api_version' => self::cfg('api_version', 'v21.0'), 'sender_number' => self::cfg('sender_number'),
            'has_token' => self::credential('token') !== '', 'has_app_secret' => self::credential('app_secret') !== '', 'has_verify_token' => self::credential('verify_token') !== '',
            'webhook_url' => rtrim((string) config('app.site_url'), '/') . '/api/whatsapp/webhook',
            'customer_enabled' => !empty($a['customer_enabled']), 'events' => (array) $a['events'], 'reminder_days' => (int) $a['reminder_days'], 'templates' => self::TEMPLATES,
            'enabled' => !empty($s['enabled']), 'recipients' => $s['recipients'] ?? []];
    }

    /** Definições → ligação à Meta. Campos secretos vazios mantêm o valor actual. */
    public static function saveApi(array $in, array $u): array
    {
        $a = self::api();
        foreach (['phone_number_id' => 40, 'waba_id' => 40, 'app_id' => 40] as $k => $max) {
            if (!array_key_exists($k, $in)) continue;
            $v = clean_text($in[$k], $max);
            if ($v !== '' && !ctype_digit($v)) throw new ApiError(422, 'whatsapp_invalid_id', '', ['field' => $k]);
            $a[$k] = $v;
        }
        if (array_key_exists('api_version', $in)) {
            $v = clean_text($in['api_version'], 10);
            if ($v !== '' && !preg_match('/^v\d{1,3}\.\d$/', $v)) throw new ApiError(422, 'whatsapp_invalid_version');
            $a['api_version'] = $v;
        }
        if (array_key_exists('sender_number', $in)) {
            $raw = clean_text($in['sender_number'], 30);
            $a['sender_number'] = $raw === '' ? '' : (self::normalize($raw) ?? throw new ApiError(422, 'whatsapp_invalid_number', '', ['number' => $raw]));
            if (in_array($a['sender_number'], setting('whatsapp')['recipients'] ?? [], true)) throw new ApiError(422, 'whatsapp_sender_recipient');
        }
        if (array_key_exists('customer_enabled', $in)) $a['customer_enabled'] = !empty($in['customer_enabled']);
        if (isset($in['reminder_days'])) $a['reminder_days'] = max(0, min(14, (int) $in['reminder_days']));
        if (is_array($in['events'] ?? null)) {
            foreach (array_keys(self::TEMPLATES) as $k) if (array_key_exists($k, $in['events'])) $a['events'][$k] = !empty($in['events'][$k]);
        }
        self::put('whatsapp_api', $a, $u);
        $secrets = setting('whatsapp_secrets');
        $changed = [];
        foreach (array_keys(self::SECRETS) as $k) {
            $v = is_string($in[$k] ?? null) ? trim($in[$k]) : '';
            if ($v === '') continue;
            $secrets[$k] = self::encrypt($v);
            $changed[] = $k;
        }
        if ($changed) self::put('whatsapp_secrets', $secrets, $u);
        Audit::log('settings_whatsapp_api', 'settings', 'whatsapp', ['customer_enabled' => !empty($a['customer_enabled']), 'secrets_changed' => $changed]);   // nunca os valores
        return ['ok' => true, 'status' => self::status()];
    }

    private static function put(string $key, array $value, array $u): void
    {
        db()->prepare('INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by')
            ->execute([$key, json_encode($value, JSON_UNESCAPED_UNICODE), $u['id']]);
    }

    private static function base(): string
    {
        return rtrim((string) (config('whatsapp.api_base') ?: self::API), '/') . '/' . self::cfg('api_version', 'v21.0') . '/';
    }

    /** Definições → testar ligação: pergunta à Meta pelo número. Também revela tokens expirados. */
    public static function check(): array
    {
        if (config('whatsapp.mode') === 'log') return ['ok' => true, 'mode' => 'log', 'message' => 'Modo de teste: não há ligação à Meta.'];
        if (!self::configured()) throw new ApiError(422, 'whatsapp_not_configured');
        $r = http_get_json(self::base() . rawurlencode(self::cfg('phone_number_id')) . '?fields=display_phone_number,verified_name,quality_rating', ['Authorization' => 'Bearer ' . self::credential('token')]);
        if ($r['status'] === 200 && !empty($r['body']['display_phone_number'])) {
            return ['ok' => true, 'number' => $r['body']['display_phone_number'], 'name' => $r['body']['verified_name'] ?? null, 'quality' => $r['body']['quality_rating'] ?? null];
        }
        $e = $r['body']['error'] ?? [];
        $code = (int) ($e['code'] ?? 0);
        return ['ok' => false, 'code' => $code, 'expired' => $code === 190, 'error' => $r['error'] ?? utf8_cut((string) ($e['message'] ?? 'Resposta inesperada'), 300)];
    }

    /* ── Números ────────────────────────────────────────── */

    /** Número em formato internacional só com algarismos; 9 algarismos começados por 8 = Moçambique (+258). */
    public static function normalize(string $n): ?string
    {
        $d = preg_replace('/\D/', '', $n) ?? '';
        if (str_starts_with($d, '00')) $d = substr($d, 2);
        if (strlen($d) === 9 && $d[0] === '8') $d = '258' . $d;
        return strlen($d) >= 10 && strlen($d) <= 15 ? $d : null;
    }

    private static function optedOut(string $number): bool
    {
        $s = db()->prepare('SELECT 1 FROM whatsapp_optouts WHERE number = ?');
        $s->execute([$number]);
        return (bool) $s->fetchColumn();
    }

    /** A Meta recusa quebras de linha, tabulações e mais de 4 espaços seguidos nos parâmetros. */
    private static function param(string $s): string
    {
        $s = trim((string) preg_replace('/\s+/u', ' ', $s));
        return utf8_cut($s === '' ? '—' : $s, 250);
    }

    /* ── Fila ───────────────────────────────────────────── */

    private static function enqueue(string $kind, string $audience, string $to, string $lang, string $template, array $params, ?int $bookingId, ?string $dedupe, ?string $button = null): ?int
    {
        $s = db()->prepare('INSERT INTO whatsapp_messages (kind, audience, to_number, lang, template, params, button, booking_id, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id');
        $s->execute([$kind, $audience, $to, $lang, $template, json_encode(array_map([self::class, 'param'], $params), JSON_UNESCAPED_UNICODE), $button, $bookingId, $dedupe]);
        $id = $s->fetchColumn();
        return $id === false ? null : (int) $id;
    }

    /** Dados da reserva para os modelos, na língua do cliente. */
    private static function bookingParams(array $b, string $lang): array
    {
        $en = $lang === 'en';
        $date = $b['service_date'] ? EmailView::date($b['service_date'], $lang, false) . ($b['session'] ? ' · ' . $b['session'] : '')
            : EmailView::date($b['checkin'], $lang, false) . ' – ' . EmailView::date($b['checkout'], $lang, false);
        $item = Catalog::find((string) $b['item_id'], $lang);
        $total = !empty($b['total_to_confirm']) && $b['total_to_confirm'] !== 'f' ? ($en ? 'to be confirmed' : 'a confirmar') : Pricing::fmt((int) $b['total_estimate']);
        $label = ['pedido' => ['Pedido recebido', 'Request received'], 'confirmada' => ['Confirmada', 'Confirmed'], 'cancelada' => ['Cancelada', 'Cancelled'], 'concluida' => ['Concluída', 'Completed']][$b['status']] ?? [$b['status'], $b['status']];
        return ['name' => strtok((string) $b['customer_name'], ' ') ?: $b['customer_name'], 'ref' => $b['reference'], 'item' => $item['name'] ?? $b['item_name'], 'destination' => $item['location'] ?? '—',
            'date' => $date, 'pax' => (string) ((int) $b['adults'] + (int) $b['children']), 'total' => $total, 'status' => $label[$en ? 1 : 0]];
    }

    /**
     * Mensagem ao cliente, se estiver tudo autorizado. Devolve o id, ou null quando não há nada a enviar.
     * @param string $note texto extra (booking_changed, booking_cancelled)
     */
    public static function enqueueCustomer(string $kind, array $b, string $dedupe, string $note = ''): ?int
    {
        $a = self::api();
        if (empty($a['customer_enabled']) || !($a['events'][$kind] ?? true)) return null;
        if (empty($b['whatsapp_opt_in']) || $b['whatsapp_opt_in'] === 'f') return null;
        $to = self::normalize((string) $b['customer_phone']);
        if ($to === null || self::optedOut($to)) return null;
        $lang = lang_of($b['lang']);
        $p = self::bookingParams($b, $lang);
        $note = $note !== '' ? $note : ($lang === 'en' ? 'Please contact us for details.' : 'Fale connosco para mais detalhes.');
        $params = match ($kind) {
            'booking_received' => [$p['name'], $p['ref'], $p['item'], $p['destination'], $p['date'], $p['pax'], $p['total'], $p['status']],
            'booking_confirmed' => [$p['name'], $p['ref'], $p['item'], $p['destination'], $p['date'], $p['pax'], $p['total']],
            'booking_changed', 'booking_cancelled' => [$p['name'], $p['ref'], $p['item'], $p['date'], $note],
            'activity_reminder' => [$p['name'], $p['item'], $p['date'], $p['pax'], $p['ref']],
        };
        return self::enqueue($kind, 'customer', $to, $lang, self::TEMPLATES[$kind], $params, (int) $b['id'], $dedupe);
    }

    /** Depois de mudar o estado: confirmação ou cancelamento, e envio imediato. */
    public static function statusChanged(array $b, string $to, string $note): ?string
    {
        $kind = ['confirmada' => 'booking_confirmed', 'cancelada' => 'booking_cancelled'][$to] ?? null;
        if ($kind === null) return null;
        $s = db()->prepare('SELECT * FROM bookings WHERE id = ?');
        $s->execute([$b['id']]);
        $row = $s->fetch();
        $n = db()->prepare("SELECT count(*) FROM booking_events WHERE booking_id = ? AND type = 'status_changed'");
        $n->execute([$b['id']]);
        $id = self::enqueueCustomer($kind, $row, "$kind:{$b['id']}:" . $n->fetchColumn(), $note);
        return $id === null ? null : self::sendNow($id);
    }

    /** Painel → «Avisar alteração». */
    public static function notifyChange(array $b, array $in, array $u): array
    {
        $note = clean_text($in['note'] ?? '', 300);
        if (strlen($note) < 3) throw new ApiError(422, 'note_required');
        $id = self::enqueueCustomer('booking_changed', $b, 'booking_changed:' . $b['id'] . ':' . bin2hex(random_bytes(6)), $note);
        if ($id === null) throw new ApiError(422, 'whatsapp_not_allowed');
        Audit::log('whatsapp_change_notice', 'booking', $b['reference'], ['message' => $id]);
        return ['ok' => true, 'status' => self::sendNow($id)];
    }

    /** Painel → retirar consentimento. */
    public static function revokeConsent(array $b, array $u): array
    {
        db()->prepare('UPDATE bookings SET whatsapp_opt_in = false WHERE id = ?')->execute([$b['id']]);
        if ($n = self::normalize((string) $b['customer_phone'])) db()->prepare("INSERT INTO whatsapp_optouts (number, source) VALUES (?, 'painel') ON CONFLICT (number) DO NOTHING")->execute([$n]);
        Audit::log('whatsapp_optout', 'booking', $b['reference'], ['source' => 'painel']);
        return ['ok' => true];
    }

    /** Novo pedido → aviso a cada número da equipa. */
    public static function bookingTeam(string $ref, int $bookingId, string $item, string $when, string $pax, string $name, string $phone, string $total): array
    {
        $s = setting('whatsapp');
        if (empty($s['enabled']) || empty($s['recipients']) || !(setting('team_events')['whatsapp_new_booking'] ?? true)) return [];
        $out = [];
        $sender = self::cfg('sender_number');
        foreach ($s['recipients'] as $to) {
            if ($to === $sender) continue;      // o número remetente não pode ser destinatário
            $id = self::enqueue('booking_team', 'team', $to, 'pt', self::cfg('template', 'nova_reserva'), [$ref, $item, $when, $pax, $name, $phone, $total], $bookingId, "booking_team:$bookingId:$to", $ref);
            if ($id !== null) $out[$to] = self::sendNow($id);
        }
        return $out;
    }

    /** Mensagem de teste (Definições) com dados fictícios, para validar o modelo e os números. */
    public static function test(array $u): array
    {
        $s = setting('whatsapp');
        if (empty($s['recipients'])) throw new ApiError(422, 'whatsapp_no_recipients');
        if (!self::configured()) throw new ApiError(422, 'whatsapp_not_configured');
        $out = [];
        foreach ($s['recipients'] as $to) {
            $id = self::enqueue('test', 'team', $to, 'pt', self::cfg('template', 'nova_reserva'), ['MCA-TESTE', 'Mensagem de teste do painel', date('Y-m-d'), '2', $u['name'], '+258 84 000 0000', '0 MZN'], null, null, 'MCA-TESTE');
            $st = self::sendNow((int) $id);
            $e = db()->prepare('SELECT error FROM whatsapp_messages WHERE id = ?');
            $e->execute([$id]);
            $out[] = ['to' => $to, 'status' => $st, 'error' => $st === 'failed' ? $e->fetchColumn() : null];
        }
        Audit::log('whatsapp_test', 'settings', 'whatsapp', ['results' => array_map(fn ($r) => $r['status'], $out)]);
        return ['results' => $out];
    }

    /* ── Envio ──────────────────────────────────────────── */

    /** Envia uma mensagem da fila. Quem a reservar primeiro envia; os outros devolvem o estado actual. */
    public static function sendNow(int $id): string
    {
        $claim = db()->prepare("UPDATE whatsapp_messages SET locked_at = now(), attempts = attempts + 1 WHERE id = ? AND status = 'pending' AND locked_at IS NULL RETURNING *");
        $claim->execute([$id]);
        $m = $claim->fetch();
        if (!$m) {
            $s = db()->prepare('SELECT status FROM whatsapp_messages WHERE id = ?');
            $s->execute([$id]);
            return (string) $s->fetchColumn();
        }
        if (config('whatsapp.mode') === 'log') {
            db()->prepare("UPDATE whatsapp_messages SET status = 'logged', sent_at = now(), locked_at = NULL WHERE id = ?")->execute([$id]);
            return 'logged';
        }
        if (!self::configured()) return self::fail($id, 'WhatsApp não configurado (token e Phone Number ID)');
        $params = json_decode((string) $m['params'], true) ?: [];
        $components = [['type' => 'body', 'parameters' => array_map(static fn ($p) => ['type' => 'text', 'text' => $p], $params)]];
        if ($m['audience'] === 'team' && config('whatsapp.button') && $m['button']) $components[] = ['type' => 'button', 'sub_type' => 'url', 'index' => '0', 'parameters' => [['type' => 'text', 'text' => $m['button']]]];
        $language = $m['lang'] === 'en' ? self::cfg('language_en', 'en_US') : self::cfg('language', 'pt_PT');
        $r = http_post_json(self::base() . rawurlencode(self::cfg('phone_number_id')) . '/messages',
            ['messaging_product' => 'whatsapp', 'recipient_type' => 'individual', 'to' => $m['to_number'], 'type' => 'template', 'template' => ['name' => $m['template'], 'language' => ['code' => $language], 'components' => $components]],
            ['Authorization' => 'Bearer ' . self::credential('token')]);
        if ($r['status'] >= 200 && $r['status'] < 300 && !empty($r['body']['messages'][0]['id'])) {
            db()->prepare("UPDATE whatsapp_messages SET status = 'sent', provider_id = ?, sent_at = now(), error = NULL, locked_at = NULL WHERE id = ?")->execute([(string) $r['body']['messages'][0]['id'], $id]);
            return 'sent';
        }
        $e = $r['body']['error'] ?? [];
        $error = utf8_cut('Meta HTTP ' . $r['status'] . ' — ' . ($r['error'] ?? (($e['code'] ?? '?') . ': ' . ($e['error_data']['details'] ?? $e['message'] ?? 'resposta inesperada'))), 500);
        /* Só se repete o que a Meta recusou por excesso ou falha dela; sem resposta, a mensagem pode ter saído */
        $temporary = $r['status'] === 429 || $r['status'] >= 500;
        if ($temporary && (int) $m['attempts'] < self::MAX_ATTEMPTS) {
            db()->prepare("UPDATE whatsapp_messages SET error = ?, locked_at = NULL, next_attempt_at = now() + make_interval(mins => ?) WHERE id = ?")->execute([$error, 5 * (int) $m['attempts'], $id]);
            return 'pending';
        }
        if ($r['status'] === 0) $error .= ' (sem resposta: confirme antes de reenviar)';
        return self::fail($id, $error);
    }

    private static function fail(int $id, string $error): string
    {
        db()->prepare("UPDATE whatsapp_messages SET status = 'failed', error = ?, failed_at = now(), locked_at = NULL WHERE id = ?")->execute([$error, $id]);
        return 'failed';
    }

    /** Painel: repõe uma mensagem falhada na fila e envia. Duas ordens seguidas só enviam uma vez. */
    public static function resend(int $id, array $u): array
    {
        $s = db()->prepare("UPDATE whatsapp_messages SET status = 'pending', error = NULL, failed_at = NULL, attempts = 0, next_attempt_at = now(), locked_at = NULL WHERE id = ? AND status = 'failed' RETURNING to_number, audience");
        $s->execute([$id]);
        $m = $s->fetch();
        if (!$m) throw new ApiError(409, 'whatsapp_not_failed');
        if ($m['audience'] === 'customer' && self::optedOut($m['to_number'])) {
            self::fail($id, 'O cliente pediu para deixar de receber mensagens');
            throw new ApiError(422, 'whatsapp_not_allowed');
        }
        Audit::log('whatsapp_resend', 'whatsapp', $id);
        return ['ok' => true, 'status' => self::sendNow($id)];
    }

    /** Tarefa agendada: mensagens por enviar e lembretes. */
    public static function work(): array
    {
        db()->exec("UPDATE whatsapp_messages SET status = 'failed', error = 'Envio interrompido: confirme antes de reenviar', failed_at = now(), locked_at = NULL WHERE status = 'pending' AND locked_at < now() - interval '5 minutes'");
        $reminders = self::queueReminders();
        $ids = db()->query("SELECT id FROM whatsapp_messages WHERE status = 'pending' AND locked_at IS NULL AND next_attempt_at <= now() ORDER BY id LIMIT 50")->fetchAll(PDO::FETCH_COLUMN);
        $done = [];
        foreach ($ids as $id) $done[$id] = self::sendNow((int) $id);
        return ['reminders' => $reminders, 'processed' => count($done)];
    }

    private static function queueReminders(): int
    {
        $a = self::api();
        $days = (int) $a['reminder_days'];
        if ($days < 1 || (int) date('G') < 8 || empty($a['customer_enabled']) || !($a['events']['activity_reminder'] ?? true)) return 0;
        $s = db()->prepare("SELECT * FROM bookings WHERE status = 'confirmada' AND whatsapp_opt_in AND coalesce(service_date, checkin) = ?");
        $s->execute([date('Y-m-d', strtotime("+$days days"))]);
        $n = 0;
        foreach ($s->fetchAll() as $b) {
            if (self::enqueueCustomer('activity_reminder', $b, "activity_reminder:{$b['id']}:" . ($b['service_date'] ?? $b['checkin'])) !== null) $n++;
        }
        return $n;
    }

    /* ── Webhook ────────────────────────────────────────── */

    /** GET: verificação inicial pela Meta. Responde com o desafio em texto. */
    public static function webhookVerify(array $q): never
    {
        $token = self::credential('verify_token');
        $mode = (string) ($q['hub_mode'] ?? '');        // o PHP troca «hub.mode» por «hub_mode»
        if ($mode !== 'subscribe' || $token === '' || !hash_equals($token, (string) ($q['hub_verify_token'] ?? ''))) throw new ApiError(403, 'forbidden');
        http_response_code(200);
        header('Content-Type: text/plain; charset=utf-8');
        echo preg_replace('/[^A-Za-z0-9_.-]/', '', (string) ($q['hub_challenge'] ?? ''));
        exit;
    }

    /** POST: valida a assinatura e regista. Nunca envia mensagens, por isso uma repetição não gera duplicados. */
    public static function webhook(string $raw, string $signature): array
    {
        $secret = self::credential('app_secret');
        if ($secret === '' || !hash_equals('sha256=' . hash_hmac('sha256', $raw, $secret), $signature)) throw new ApiError(403, 'invalid_signature');
        $data = json_decode($raw, true);
        if (!is_array($data)) throw new ApiError(400, 'invalid_json');
        foreach ($data['entry'] ?? [] as $entry) {
            foreach ($entry['changes'] ?? [] as $change) {
                $v = $change['value'] ?? [];
                foreach ($v['statuses'] ?? [] as $st) self::onStatus($st);
                foreach ($v['messages'] ?? [] as $msg) self::onMessage($msg);
            }
        }
        return ['ok' => true];
    }

    private static function record(string $key, string $type, ?string $wamid, ?string $from, ?string $body, array $payload): bool
    {
        $s = db()->prepare('INSERT INTO whatsapp_events (event_key, type, wamid, from_number, body, payload) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (event_key) DO NOTHING RETURNING id');
        $s->execute([$key, $type, $wamid, $from, $body, json_encode($payload, JSON_UNESCAPED_UNICODE)]);
        return $s->fetchColumn() !== false;
    }

    private static function onStatus(array $st): void
    {
        $wamid = (string) ($st['id'] ?? '');
        $to = (string) ($st['status'] ?? '');
        if ($wamid === '' || !in_array($to, ['sent', 'delivered', 'read', 'failed'], true)) return;
        if (!self::record("status:$wamid:$to", 'status', $wamid, null, null, $st)) return;     // repetição da Meta
        $when = isset($st['timestamp']) ? date('c', (int) $st['timestamp']) : date('c');
        if ($to === 'failed') {
            $e = $st['errors'][0] ?? [];
            db()->prepare("UPDATE whatsapp_messages SET status = 'failed', error = ?, failed_at = ? WHERE provider_id = ? AND status <> 'read'")
                ->execute([utf8_cut('Meta ' . ($e['code'] ?? '?') . ': ' . ($e['error_data']['details'] ?? $e['title'] ?? $e['message'] ?? 'falha na entrega'), 500), $when, $wamid]);
            return;
        }
        /* Os estados podem chegar fora de ordem: nunca andam para trás */
        $lower = array_keys(array_filter(self::RANK, static fn ($r) => $r < self::RANK[$to]));
        $col = ['sent' => 'sent_at', 'delivered' => 'delivered_at', 'read' => 'read_at'][$to];
        $in = implode(',', array_map(static fn ($s) => "'$s'", [...$lower, 'failed']));
        db()->prepare("UPDATE whatsapp_messages SET status = ?, $col = ? WHERE provider_id = ? AND status IN ($in)")->execute([$to, $when, $wamid]);
        db()->prepare("UPDATE whatsapp_messages SET $col = coalesce($col, ?) WHERE provider_id = ?")->execute([$when, $wamid]);
    }

    private static function onMessage(array $msg): void
    {
        $id = (string) ($msg['id'] ?? '');
        $from = preg_replace('/\D/', '', (string) ($msg['from'] ?? '')) ?? '';
        if ($id === '' || $from === '') return;
        $body = utf8_cut((string) ($msg['text']['body'] ?? $msg['button']['text'] ?? ('[' . ($msg['type'] ?? 'mensagem') . ']')), 2000);
        if (!self::record("message:$id", 'message', $id, $from, $body, $msg)) return;
        if (in_array(strtolower(trim($body)), self::STOP_WORDS, true)) {
            db()->prepare("INSERT INTO whatsapp_optouts (number, source) VALUES (?, 'whatsapp') ON CONFLICT (number) DO NOTHING")->execute([$from]);
            Audit::log('whatsapp_optout', 'whatsapp', $from, ['source' => 'whatsapp'], null, 'webhook');
        }
    }

    /* ── Histórico ──────────────────────────────────────── */

    /** Painel: histórico com filtros, indicadores dos últimos 30 dias e mensagens recebidas. */
    public static function log(array $q = []): array
    {
        $where = ['1=1'];
        $args = [];
        if (in_array($q['status'] ?? '', ['pending', 'sent', 'delivered', 'read', 'failed', 'logged'], true)) { $where[] = 'm.status = ?'; $args[] = $q['status']; }
        if (array_key_exists($q['kind'] ?? '', self::TEMPLATES) || in_array($q['kind'] ?? '', ['booking_team', 'test'], true)) { $where[] = 'm.kind = ?'; $args[] = $q['kind']; }
        $term = clean_text($q['q'] ?? '', 60);
        if ($term !== '') { $where[] = '(m.to_number ILIKE ? OR b.reference ILIKE ?)'; $args[] = "%$term%"; $args[] = "%$term%"; }
        $s = db()->prepare('SELECT m.id, m.kind, m.audience, m.to_number, m.lang, m.template, m.params, m.status, m.error, m.provider_id, m.attempts, m.created_at, m.sent_at, m.delivered_at, m.read_at, b.reference, b.id AS booking_id, b.id IS NOT NULL AND m.booking_id IS NOT NULL AS related
            FROM whatsapp_messages m LEFT JOIN bookings b ON b.id = m.booking_id WHERE ' . implode(' AND ', $where) . ' ORDER BY m.id DESC LIMIT 200');
        $s->execute($args);
        $rows = array_map(static fn ($r) => ['params' => json_decode((string) $r['params'], true), 'related_type' => $r['related'] ? 'booking' : null] + $r, $s->fetchAll());
        $stats = db()->query("SELECT count(*) FILTER (WHERE sent_at IS NOT NULL) AS sent, count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered, count(*) FILTER (WHERE read_at IS NOT NULL) AS read, count(*) FILTER (WHERE status = 'failed') AS failed FROM whatsapp_messages WHERE created_at > now() - interval '30 days'")->fetch();
        $inbound = db()->query("SELECT from_number, body, created_at FROM whatsapp_events WHERE type = 'message' ORDER BY id DESC LIMIT 50")->fetchAll();
        return ['messages' => $rows, 'stats' => array_map('intval', $stats), 'inbound' => $inbound, 'status' => self::status()];
    }

    /** Definições → WhatsApp: interruptor e números da equipa (até 5). */
    public static function saveSettings(array $in): array
    {
        $nums = [];
        foreach (array_slice(is_array($in['recipients'] ?? null) ? $in['recipients'] : [], 0, 5) as $n) {
            if (!is_string($n) || trim($n) === '') continue;
            $d = self::normalize($n) ?? throw new ApiError(422, 'whatsapp_invalid_number', '', ['number' => clean_text($n, 30)]);
            if ($d === self::cfg('sender_number')) throw new ApiError(422, 'whatsapp_sender_recipient');
            if (!in_array($d, $nums, true)) $nums[] = $d;
        }
        $enabled = !empty($in['enabled']);
        if ($enabled && !$nums) throw new ApiError(422, 'whatsapp_no_recipients');
        return ['enabled' => $enabled, 'recipients' => $nums];
    }
}
