<?php
/**
 * MOZ CAMP ADVENTURES — api/src/Chat.php
 * Live Chat do lado do visitante (/api/chat/*), sem conta.
 *
 *  - Sessão: token aleatório num cookie HttpOnly; na base de dados só fica o hash. Cada pedido só
 *    alcança a conversa desse token, por isso um visitante nunca vê a conversa de outro.
 *  - Tempo real: consulta curta (short polling). O servidor não tem WebSockets nem Redis.
 *  - Disponibilidade: heartbeat + actividade real + estado escolhido + horário (ver self::EFFECTIVE).
 *  - As notas internas estão noutra tabela e nada aqui as lê.
 *  - Quem saiu recebe as respostas por e-mail, em lote, pela tarefa agendada (api/bin/worker.php).
 */

declare(strict_types=1);

final class Chat
{
    public const SUBJECTS = ['reservations', 'island_hopping', 'sunset_cruise', 'beach_tours', 'safaris', 'transfers', 'accommodation', 'general', 'other'];
    public const MAX_TEXT = 2000;
    public const MAX_FILE = 5242880;
    private const COOKIE = 'mca_chat';
    private const SUBJECT_LABELS = ['reservations' => 'Reservas', 'island_hopping' => 'Island Hopping', 'sunset_cruise' => 'Sunset Cruise', 'beach_tours' => 'Passeios de praia', 'safaris' => 'Safaris',
        'transfers' => 'Transfers', 'accommodation' => 'Alojamento', 'general' => 'Informação geral', 'other' => 'Outro'];

    /** Online exige heartbeat recente E actividade real: ter o painel aberto não chega. */
    public const EFFECTIVE = "CASE WHEN a.last_seen_at IS NULL OR a.last_seen_at < now() - interval '90 seconds' OR a.status = 'offline' THEN 'offline'
        WHEN a.status = 'online' AND a.last_active_at > now() - interval '15 minutes' THEN 'online' ELSE 'away' END";

    public static function settings(): array
    {
        return setting('chat') + ['enabled' => true, 'hours' => [], 'retention_months' => 12, 'notify_offline' => true];
    }

    /** Horário de Maputo. Sem horário definido, está sempre dentro. Dia sem entrada = fechado. */
    public static function withinHours(array $hours, ?DateTimeImmutable $now = null): bool
    {
        if (!$hours) return true;
        $now ??= new DateTimeImmutable('now');
        $day = $hours[$now->format('N')] ?? null;
        if (!$day) return false;
        $t = $now->format('H:i');
        return $t >= $day['from'] && $t < $day['to'];
    }

    /** online, away ou offline, para o visitante. */
    public static function state(): string
    {
        if (!self::withinHours((array) self::settings()['hours'])) return 'offline';
        $states = db()->query('SELECT ' . self::EFFECTIVE . ' FROM chat_agents a JOIN users u ON u.id = a.user_id WHERE u.active')->fetchAll(PDO::FETCH_COLUMN);
        return in_array('online', $states, true) ? 'online' : (in_array('away', $states, true) ? 'away' : 'offline');
    }

    public static function route(string $method, string $path): mixed
    {
        if ($method === 'POST') require_allowed_origin();
        return match (true) {
            $method === 'GET' && $path === '/status' => self::status(),
            $method === 'GET' && $path === '/poll' => self::poll($_GET),
            $method === 'POST' && $path === '/start' => self::start(json_input(8192)),
            $method === 'POST' && $path === '/messages' => self::message(json_input(16384)),
            $method === 'POST' && $path === '/upload' => self::upload(),
            $method === 'POST' && $path === '/typing' => self::typing(),
            $method === 'POST' && $path === '/end' => self::end(),
            $method === 'GET' && preg_match('#^/file/(\d+)$#', $path, $m) === 1 => self::file((int) $m[1]),
            default => throw new ApiError(404, 'not_found'),
        };
    }

    /* ── Sessão ─────────────────────────────────────────── */

    private static function find(): ?array
    {
        $token = $_COOKIE[self::COOKIE] ?? '';
        if (!is_string($token) || strlen($token) !== 64) return null;
        $s = db()->prepare("SELECT *, agent_typing_at > now() - interval '6 seconds' AS agent_typing FROM chat_conversations WHERE token_hash = ?");
        $s->execute([hash('sha256', $token)]);
        return $s->fetch() ?: null;
    }

    private static function session(): array
    {
        return self::find() ?? throw new ApiError(401, 'chat_no_session');
    }

    private static function cookie(string $token, int $ttl): void
    {
        setcookie(self::COOKIE, $token, ['expires' => $token === '' ? 1 : time() + $ttl, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict', 'secure' => (bool) (config('app.cookie_secure') ?? true)]);
    }

    private static function unread(int $id, int $readId): int
    {
        $s = db()->prepare("SELECT count(*) FROM chat_messages WHERE conversation_id = ? AND id > ? AND sender = 'agent'");
        $s->execute([$id, $readId]);
        return (int) $s->fetchColumn();
    }

    /* ── Rotas públicas ─────────────────────────────────── */

    private static function status(): array
    {
        if (empty(self::settings()['enabled'])) return ['enabled' => false];
        $c = self::find();
        return ['enabled' => true, 'state' => self::state(), 'session' => $c !== null, 'unread' => $c ? self::unread((int) $c['id'], (int) $c['visitor_read_id']) : 0];
    }

    private static function start(array $in): array
    {
        reject_honeypot($in);
        $cfg = self::settings();
        if (empty($cfg['enabled'])) throw new ApiError(503, 'chat_disabled');
        if (self::find()) throw new ApiError(409, 'chat_exists');
        rate_limit('chat-start', 5, 3600);

        $name = clean_text($in['name'] ?? '', 120);
        $email = strtolower(clean_text($in['email'] ?? '', 160));
        $phone = clean_text($in['phone'] ?? '', 30);
        $subject = (string) ($in['subject'] ?? '');
        $text = clean_text($in['message'] ?? '', self::MAX_TEXT);
        if (strlen($name) < 2) throw new ApiError(422, 'invalid_name');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new ApiError(422, 'invalid_email');
        if ($phone !== '' && strlen((string) preg_replace('/\D/', '', $phone)) < 7) throw new ApiError(422, 'invalid_phone');
        if (!in_array($subject, self::SUBJECTS, true)) throw new ApiError(422, 'invalid_subject');
        if ($text === '') throw new ApiError(422, 'invalid_message');

        $lang = lang_of($in['lang'] ?? 'pt');
        $item = is_string($in['item'] ?? null) && Catalog::find($in['item'], $lang) ? $in['item'] : null;
        $page = clean_text($in['page'] ?? '', 300);
        if (!str_starts_with($page, '/') || str_starts_with($page, '//')) $page = null;

        $state = self::state();
        $token = bin2hex(random_bytes(32));
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $s = $pdo->prepare('INSERT INTO chat_conversations (token_hash, name, email, phone, subject, lang, origin_page, item_id, offline, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id');
            $s->execute([hash('sha256', $token), $name, $email, $phone ?: null, $subject, $lang, $page, $item, $state === 'online' ? 'f' : 't', ip_hash()]);
            $id = (int) $s->fetchColumn();
            $first = self::add($id, 'visitor', $name, $text, is_string($in['client_id'] ?? null) ? self::clientId($in['client_id']) : null);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        self::cookie($token, (int) $cfg['retention_months'] * 30 * 86400);
        if ($state !== 'online' && !empty($cfg['notify_offline'])) {
            try {
                Mailer::send('chat_offline', Mailer::team(), "Live Chat: mensagem de $name", "Mensagem recebida sem equipa disponível.\n\nNome: $name\nE-mail: $email\nTelefone: " . ($phone ?: '—') . "\nAssunto: " . self::SUBJECT_LABELS[$subject] . "\n\n$text\n\nResponda no painel, em Live Chat.", 'chat', $id, $email);
            } catch (Throwable $e) {
                error_log('[MCA Chat] ' . $e->getMessage());
            }
        }
        return ['ok' => true, 'state' => $state, 'message' => self::view($first)];
    }

    private static function poll(array $q): array
    {
        $c = self::session();
        $id = (int) $c['id'];
        $s = db()->prepare('SELECT id, sender, author, body, file_name, file_mime, file_size, client_id, created_at FROM chat_messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT 200');
        $s->execute([$id, max(0, (int) ($q['after'] ?? 0))]);
        $rows = $s->fetchAll();
        $read = (int) $c['visitor_read_id'];
        if (!empty($q['open'])) {        // só conta como lida com a janela aberta
            /* Só escreve se houver algo novo ou de 15 em 15 s: a consulta repete-se a cada 3 s e uma escrita é o passo mais caro */
            $u = db()->prepare("WITH latest AS (SELECT coalesce(max(id), 0) AS id FROM chat_messages WHERE conversation_id = ?)
                UPDATE chat_conversations c SET visitor_seen_at = now(), visitor_read_id = GREATEST(c.visitor_read_id, latest.id) FROM latest
                WHERE c.id = ? AND (c.visitor_read_id < latest.id OR c.visitor_seen_at IS NULL OR c.visitor_seen_at < now() - interval '15 seconds') RETURNING c.visitor_read_id");
            $u->execute([$id, $id]);
            $read = (int) ($u->fetchColumn() ?: $read);
        }
        return ['messages' => array_map([self::class, 'view'], $rows), 'state' => self::state(), 'status' => $c['status'], 'typing' => !empty($c['agent_typing']), 'read_upto' => (int) $c['agent_read_id'], 'unread' => self::unread($id, $read)];
    }

    private static function message(array $in): array
    {
        $c = self::session();
        rate_limit('chat-msg:' . $c['id'], 30, 60);
        $text = clean_text($in['body'] ?? '', self::MAX_TEXT);
        if ($text === '') throw new ApiError(422, 'invalid_message');
        return ['message' => self::view(self::add((int) $c['id'], 'visitor', (string) $c['name'], $text, self::clientId($in['client_id'] ?? null)))];
    }

    private static function upload(): array
    {
        $c = self::session();
        rate_limit('chat-file:' . $c['id'], 10, 3600);
        $file = self::saveFile((int) $c['id']);
        return ['message' => self::view(self::add((int) $c['id'], 'visitor', (string) $c['name'], '', self::clientId($_POST['client_id'] ?? null), $file))];
    }

    private static function typing(): array
    {
        $c = self::session();
        db()->prepare('UPDATE chat_conversations SET visitor_typing_at = now() WHERE id = ?')->execute([$c['id']]);
        return ['ok' => true];
    }

    /** Termina a sessão neste dispositivo. A conversa fica com a equipa. */
    private static function end(): array
    {
        self::session();
        self::cookie('', 0);
        return ['ok' => true];
    }

    private static function file(int $id): never
    {
        $c = self::session();
        $s = db()->prepare('SELECT * FROM chat_messages WHERE id = ? AND conversation_id = ? AND file_path IS NOT NULL');
        $s->execute([$id, $c['id']]);
        self::stream($s->fetch() ?: throw new ApiError(404, 'not_found'));
    }

    /* ── Partilhado com o painel ────────────────────────── */

    public static function clientId(mixed $v): string
    {
        if (!is_string($v) || !preg_match('/^[A-Za-z0-9-]{8,64}$/', $v)) throw new ApiError(422, 'invalid_client_id');
        return $v;
    }

    /** Grava a mensagem e actualiza a conversa. O mesmo client_id devolve a mensagem já gravada. */
    public static function add(int $conv, string $sender, string $author, string $body, ?string $clientId, ?array $file = null, ?int $userId = null): array
    {
        $pdo = db();
        $own = !$pdo->inTransaction();
        if ($own) $pdo->beginTransaction();
        try {
            $s = $pdo->prepare('INSERT INTO chat_messages (conversation_id, sender, user_id, author, body, file_name, file_path, file_mime, file_size, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (conversation_id, client_id) DO NOTHING RETURNING *');
            $s->execute([$conv, $sender, $userId, $author, $body, $file['name'] ?? null, $file['path'] ?? null, $file['mime'] ?? null, $file['size'] ?? null, $clientId]);
            $m = $s->fetch();
            if ($m) {
                $preview = utf8_cut($body !== '' ? (string) preg_replace('/\s+/u', ' ', $body) : '[' . ($file['name'] ?? '') . ']', 140);
                $extra = $sender === 'visitor' ? "status = 'open', closed_at = NULL, visitor_typing_at = NULL" : 'first_response_at = coalesce(first_response_at, now()), assigned_to = coalesce(assigned_to, ?), agent_typing_at = NULL';
                $args = $sender === 'visitor' ? [$sender, $preview, $conv] : [$sender, $preview, $userId, $conv];
                $pdo->prepare("UPDATE chat_conversations SET last_message_at = now(), last_sender = ?, last_preview = ?, $extra WHERE id = ?")->execute($args);
            } else {
                $e = $pdo->prepare('SELECT * FROM chat_messages WHERE conversation_id = ? AND client_id = ?');
                $e->execute([$conv, $clientId]);
                $m = $e->fetch();
            }
            if ($own) $pdo->commit();
            return $m;
        } catch (Throwable $e) {
            if ($own && $pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    /** O que o visitante pode ver de uma mensagem. */
    private static function view(array $m): array
    {
        return ['id' => (int) $m['id'], 'from' => $m['sender'], 'author' => $m['author'], 'body' => $m['body'], 'at' => $m['created_at'], 'cid' => $m['sender'] === 'visitor' ? $m['client_id'] : null,
            'file' => $m['file_name'] ? ['name' => $m['file_name'], 'mime' => $m['file_mime'], 'size' => (int) $m['file_size'], 'url' => '/api/chat/file/' . $m['id']] : null];
    }

    /** Valida pelo conteúdo real e grava fora da pasta pública. */
    public static function saveFile(int $conv): array
    {
        $f = $_FILES['file'] ?? null;
        if (!is_array($f) || !is_string($f['tmp_name'] ?? null)) throw new ApiError(422, 'chat_file_missing');
        if (in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || (int) $f['size'] > self::MAX_FILE) throw new ApiError(413, 'chat_file_too_large');
        if ($f['error'] !== UPLOAD_ERR_OK) throw new ApiError(422, 'chat_file_missing');
        $bytes = (string) file_get_contents($f['tmp_name']);
        $mime = match (true) {
            str_starts_with($bytes, '%PDF-') => 'application/pdf',
            str_starts_with($bytes, "\xFF\xD8\xFF") => 'image/jpeg',
            str_starts_with($bytes, "\x89PNG\r\n\x1A\n") => 'image/png',
            str_starts_with($bytes, 'RIFF') && substr($bytes, 8, 4) === 'WEBP' => 'image/webp',
            default => throw new ApiError(415, 'chat_file_type'),
        };
        if ($mime !== 'application/pdf' && @getimagesizefromstring($bytes) === false) throw new ApiError(415, 'chat_file_type');
        $ext = ['application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$mime];
        $rel = "chat/$conv";
        $dir = rtrim((string) config('app.storage_dir'), '/\\') . "/$rel";
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) throw new RuntimeException("Não foi possível criar $dir");
        $stored = bin2hex(random_bytes(16)) . ".$ext";
        file_put_contents("$dir/$stored", $bytes);
        @chmod("$dir/$stored", 0640);
        $base = (string) preg_replace('/[^\p{L}\p{N}._ -]+/u', '_', pathinfo((string) $f['name'], PATHINFO_FILENAME));
        return ['name' => utf8_cut(trim($base, '._ ') ?: 'ficheiro', 80) . ".$ext", 'path' => "$rel/$stored", 'mime' => $mime, 'size' => strlen($bytes)];
    }

    public static function stream(array $m): never
    {
        $path = rtrim((string) config('app.storage_dir'), '/\\') . '/' . $m['file_path'];
        if (!is_file($path)) throw new ApiError(404, 'not_found');
        $disposition = str_starts_with((string) $m['file_mime'], 'image/') ? 'inline' : 'attachment';
        header('Content-Type: ' . $m['file_mime']);
        header('Content-Disposition: ' . $disposition . "; filename*=UTF-8''" . rawurlencode((string) $m['file_name']));
        header('Content-Security-Policy: sandbox; default-src \'none\'');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, no-store');
        header('Content-Length: ' . filesize($path));
        readfile($path);
        exit;
    }

    public static function subjectLabel(string $code): string
    {
        return self::SUBJECT_LABELS[$code] ?? $code;
    }

    /** Depois de uma reserva no site: liga-a à conversa deste visitante. */
    public static function linkBooking(int $bookingId): void
    {
        $c = self::find();
        if ($c) db()->prepare('UPDATE chat_conversations SET booking_id = ? WHERE id = ?')->execute([$bookingId, $c['id']]);
    }

    /* ── Tarefa agendada ────────────────────────────────── */

    /** Respostas que o visitante não viu: um e-mail por conversa com tudo o que ficou por ler. */
    public static function mailReplies(): int
    {
        $rows = db()->query("SELECT c.* FROM chat_conversations c WHERE coalesce(c.visitor_seen_at, c.created_at) < now() - interval '5 minutes'
            AND EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id = c.id AND m.sender = 'agent' AND m.id > GREATEST(c.visitor_read_id, c.emailed_upto_id) AND m.created_at < now() - interval '2 minutes')")->fetchAll();
        foreach ($rows as $c) {
            $s = db()->prepare("SELECT id, author, body, file_name FROM chat_messages WHERE conversation_id = ? AND sender = 'agent' AND id > ? ORDER BY id");
            $s->execute([$c['id'], max((int) $c['visitor_read_id'], (int) $c['emailed_upto_id'])]);
            $msgs = $s->fetchAll();
            db()->prepare('UPDATE chat_conversations SET emailed_upto_id = ? WHERE id = ?')->execute([end($msgs)['id'], $c['id']]);
            $en = $c['lang'] === 'en';
            $text = implode("\n\n", array_map(static fn ($m) => $m['author'] . ': ' . ($m['body'] !== '' ? $m['body'] : '[' . $m['file_name'] . ']'), $msgs));
            $body = ($en ? "Hello {$c['name']},\n\nOur team replied to your chat:\n\n$text\n\nYou can reply to this e-mail or continue the chat on our website." : "Olá {$c['name']},\n\nA nossa equipa respondeu à sua conversa:\n\n$text\n\nPode responder a este e-mail ou continuar a conversa no nosso site.");
            Mailer::send('chat_reply', (string) $c['email'], $en ? 'Reply from Moz Camp Adventures' : 'Resposta da Moz Camp Adventures', $body, 'chat', (int) $c['id'], null, [], (string) $c['lang']);
        }
        return count($rows);
    }

    /** Apaga conversas e ficheiros fora do prazo de retenção. */
    public static function purge(): int
    {
        $s = db()->prepare('DELETE FROM chat_conversations WHERE last_message_at < now() - make_interval(months => ?) RETURNING id');
        $s->execute([max(1, (int) self::settings()['retention_months'])]);
        $ids = $s->fetchAll(PDO::FETCH_COLUMN);
        foreach ($ids as $id) {
            $dir = rtrim((string) config('app.storage_dir'), '/\\') . "/chat/$id";
            if (!is_dir($dir)) continue;
            array_map('unlink', glob("$dir/*") ?: []);
            @rmdir($dir);
        }
        return count($ids);
    }
}
