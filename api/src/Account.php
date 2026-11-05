<?php
/**
 * MOZ CAMP ADVENTURES — api/src/Account.php
 * Contas de cliente no site (/api/account/*), separadas das contas da equipa:
 *  - registo com e-mail e palavra-passe: a conta funciona de imediato;
 *  - sessão em cookie HttpOnly + SameSite=Strict, CSRF nas escritas;
 *  - as reservas pertencem à conta quando feitas com a sessão iniciada
 *    (bookings.customer_id) — o e-mail não é confirmado, por isso nunca
 *    se ligam reservas pelo e-mail (seriam visíveis a quem registasse o
 *    e-mail de outra pessoa);
 *  - reposição da palavra-passe por link de 1 hora (o link não fica no
 *    registo de e-mails — Mailer::send $logBody);
 *  - promoções só com consentimento (data registada).
 */

declare(strict_types=1);

final class Account
{
    public const COOKIE = 'mca_customer';
    public const FLAG = 'mca_in';                 // cookie visível ao JS: só indica «tem sessão» (para o cabeçalho)
    private const IDLE = 14 * 86400;              // sessão expira após 14 dias sem actividade
    private const ABSOLUTE = 30 * 86400;          // e no máximo 30 dias depois do login
    private const RESET_TTL = '1 hour';

    private static ?array $cur = null;
    private static bool $loaded = false;

    public static function route(string $method, string $path): array
    {
        return match ([$method, $path]) {
            ['POST', '/register'] => self::register(json_input()),
            ['POST', '/login'] => self::login(json_input()),
            ['POST', '/logout'] => self::logout(),
            ['GET', '/me'] => self::me(),
            ['POST', '/profile'] => self::profile(json_input()),
            ['POST', '/password'] => self::changePassword(json_input()),
            ['POST', '/forgot'] => self::forgot(json_input()),
            ['POST', '/reset'] => self::reset(json_input()),
            ['POST', '/delete'] => self::delete(json_input()),
            default => throw new ApiError(404, 'not_found'),
        };
    }

    /** Id da conta com sessão iniciada (para ligar a reserva à conta) ou null. */
    public static function currentId(): ?int
    {
        $c = self::current();
        return $c ? (int) $c['id'] : null;
    }

    /* ── Registo e entrada ──────────────────────────────── */

    private static function register(array $in): array
    {
        require_allowed_origin();
        reject_honeypot($in);
        rate_limit('account-register', 5, 3600);
        $name = clean_text($in['name'] ?? '', 120);
        $email = strtolower(clean_text($in['email'] ?? '', 160));
        $phone = clean_text($in['phone'] ?? '', 40);
        $lang = lang_of($in['lang'] ?? 'pt');
        $password = is_string($in['password'] ?? null) ? $in['password'] : '';
        $marketing = ($in['marketing'] ?? false) === true;
        if (strlen($name) < 2) throw new ApiError(422, 'invalid_name');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new ApiError(422, 'invalid_email');
        if ($phone !== '' && strlen(preg_replace('/\D/', '', $phone)) < 7) throw new ApiError(422, 'invalid_phone');
        self::checkPassword($password);
        if (($in['terms'] ?? false) !== true) throw new ApiError(422, 'terms_required');

        $s = db()->prepare('SELECT 1 FROM customers WHERE lower(email) = ?');
        $s->execute([$email]);
        if ($s->fetchColumn()) throw new ApiError(409, 'email_taken');     // «já tem conta: entre ou reponha a palavra-passe»

        try {
            $ins = db()->prepare('INSERT INTO customers (name, email, phone, lang, password_hash, marketing_opt_in, marketing_consent_at) VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? THEN now() END) RETURNING id');
            $ins->execute([$name, $email, $phone ?: null, $lang, password_hash($password, PASSWORD_DEFAULT), $marketing ? 't' : 'f', $marketing ? 't' : 'f']);
        } catch (PDOException $e) {
            if ($e->getCode() === '23505') throw new ApiError(409, 'email_taken');   // corrida: dois registos em simultâneo
            throw $e;
        }
        $id = (int) $ins->fetchColumn();
        Audit::log('customer_registered', 'customer', $id, ['marketing' => $marketing], null, 'cliente');
        self::startSession($id);
        return self::me();
    }

    private static function login(array $in): array
    {
        require_allowed_origin();
        $email = strtolower(clean_text($in['email'] ?? '', 160));
        $password = is_string($in['password'] ?? null) ? $in['password'] : '';
        rate_limit('customer-login:' . $email, 5, 900);       // 5 tentativas / 15 min por e-mail+IP
        $s = db()->prepare('SELECT id, password_hash FROM customers WHERE lower(email) = ?');
        $s->execute([$email]);
        $c = $s->fetch();
        $hash = $c['password_hash'] ?? password_hash(bin2hex(random_bytes(8)), PASSWORD_DEFAULT);   // mesmo custo se o e-mail não existir
        if (!password_verify($password, $hash) || !$c) {
            throw new ApiError(401, 'invalid_credentials');
        }
        if (password_needs_rehash($c['password_hash'], PASSWORD_DEFAULT)) {
            db()->prepare('UPDATE customers SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $c['id']]);
        }
        self::startSession((int) $c['id']);
        return self::me();
    }

    private static function logout(): array
    {
        $c = self::require();
        db()->prepare('DELETE FROM customer_sessions WHERE token_hash = ?')->execute([$c['token_hash']]);
        self::cookies('', -3600);
        return ['ok' => true];
    }

    /* ── Sessão ─────────────────────────────────────────── */

    private static function current(): ?array
    {
        if (self::$loaded) return self::$cur;
        self::$loaded = true;
        $token = $_COOKIE[self::COOKIE] ?? '';
        if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) return null;
        $s = db()->prepare('SELECT s.token_hash, s.csrf_token, s.last_seen_at, c.* FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
            WHERE s.token_hash = ? AND s.expires_at > now() AND s.last_seen_at > now() - make_interval(secs => ?)');
        $s->execute([hash('sha256', $token), self::IDLE]);
        $row = $s->fetch();
        if (!$row) return null;
        if (strtotime((string) $row['last_seen_at']) < time() - 3600) {
            db()->prepare('UPDATE customer_sessions SET last_seen_at = now() WHERE token_hash = ?')->execute([$row['token_hash']]);
        }
        return self::$cur = $row;
    }

    /** Exige sessão (401); escritas exigem origem e CSRF. */
    private static function require(): array
    {
        $c = self::current() ?? throw new ApiError(401, 'not_authenticated');
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
            require_allowed_origin();
            $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
            if (!is_string($sent) || !hash_equals($c['csrf_token'], $sent)) throw new ApiError(403, 'csrf_invalid');
        }
        return $c;
    }

    private static function startSession(int $customerId): void
    {
        $token = bin2hex(random_bytes(32));
        db()->prepare('INSERT INTO customer_sessions (token_hash, customer_id, csrf_token, expires_at, ip_hash, user_agent) VALUES (?, ?, ?, now() + make_interval(secs => ?), ?, ?)')
            ->execute([hash('sha256', $token), $customerId, bin2hex(random_bytes(32)), self::ABSOLUTE, ip_hash(), clean_text($_SERVER['HTTP_USER_AGENT'] ?? '', 300)]);
        db()->prepare('UPDATE customers SET last_login_at = now() WHERE id = ?')->execute([$customerId]);
        db()->exec('DELETE FROM customer_sessions WHERE expires_at < now()');
        self::cookies($token, self::ABSOLUTE);
        $_COOKIE[self::COOKIE] = $token;
        self::$loaded = false;
    }

    private static function cookies(string $token, int $ttl): void
    {
        $secure = (bool) (config('app.cookie_secure') ?? true);
        setcookie(self::COOKIE, $token, ['expires' => time() + $ttl, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict', 'secure' => $secure]);
        setcookie(self::FLAG, $token === '' ? '' : '1', ['expires' => time() + $ttl, 'path' => '/', 'httponly' => false, 'samesite' => 'Strict', 'secure' => $secure]);
    }

    /* ── Conta ──────────────────────────────────────────── */

    /** Perfil e reservas desta conta (cada uma com o link da área do cliente: ticket, facturas, recibos). */
    private static function me(): array
    {
        $c = self::current() ?? throw new ApiError(401, 'not_authenticated');
        $s = db()->prepare('SELECT id, reference, lang, client_link_version, item_name, item_kind, status, service_date, checkin, checkout, adults, children, total_estimate, total_to_confirm, created_at
            FROM bookings WHERE customer_id = ? ORDER BY coalesce(service_date, checkin) DESC NULLS LAST, id DESC LIMIT 100');
        $s->execute([$c['id']]);
        $bookings = array_map(static fn ($b) => [
            'reference' => $b['reference'], 'item' => $b['item_name'], 'kind' => $b['item_kind'], 'status' => $b['status'],
            'service_date' => $b['service_date'], 'checkin' => $b['checkin'], 'checkout' => $b['checkout'], 'adults' => (int) $b['adults'], 'children' => (int) $b['children'],
            'total' => (int) $b['total_estimate'], 'to_confirm' => (bool) $b['total_to_confirm'], 'created' => substr((string) $b['created_at'], 0, 10),
            'url' => Notify::clientLink($b),
        ], $s->fetchAll());
        return [
            'customer' => ['name' => $c['name'], 'email' => $c['email'], 'phone' => $c['phone'], 'lang' => $c['lang'], 'marketing' => (bool) $c['marketing_opt_in'],
                'marketing_since' => $c['marketing_opt_in'] ? substr((string) $c['marketing_consent_at'], 0, 10) : null, 'since' => substr((string) $c['created_at'], 0, 10)],
            'bookings' => $bookings,
            'csrf' => $c['csrf_token'],
        ];
    }

    private static function profile(array $in): array
    {
        $c = self::require();
        $name = clean_text($in['name'] ?? $c['name'], 120);
        $phone = clean_text($in['phone'] ?? (string) $c['phone'], 40);
        $lang = lang_of($in['lang'] ?? $c['lang']);
        $marketing = array_key_exists('marketing', $in) ? ($in['marketing'] === true) : (bool) $c['marketing_opt_in'];
        if (strlen($name) < 2) throw new ApiError(422, 'invalid_name');
        if ($phone !== '' && strlen(preg_replace('/\D/', '', $phone)) < 7) throw new ApiError(422, 'invalid_phone');
        $was = (bool) $c['marketing_opt_in'];
        db()->prepare('UPDATE customers SET name = ?, phone = ?, lang = ?, marketing_opt_in = ?,
                marketing_consent_at = CASE WHEN ? THEN now() ELSE marketing_consent_at END,
                marketing_withdrawn_at = CASE WHEN ? THEN now() WHEN ? THEN NULL ELSE marketing_withdrawn_at END, updated_at = now() WHERE id = ?')
            ->execute([$name, $phone ?: null, $lang, $marketing ? 't' : 'f', (!$was && $marketing) ? 't' : 'f', ($was && !$marketing) ? 't' : 'f', (!$was && $marketing) ? 't' : 'f', $c['id']]);
        if ($was !== $marketing) Audit::log($marketing ? 'customer_marketing_opt_in' : 'customer_marketing_opt_out', 'customer', (int) $c['id'], [], null, 'cliente');
        self::$loaded = false;
        return self::me();
    }

    private static function changePassword(array $in): array
    {
        $c = self::require();
        rate_limit('customer-password', 5, 900);
        $current = is_string($in['current'] ?? null) ? $in['current'] : '';
        $new = is_string($in['password'] ?? null) ? $in['password'] : '';
        if (!password_verify($current, $c['password_hash'])) throw new ApiError(401, 'invalid_credentials');
        self::checkPassword($new);
        db()->prepare('UPDATE customers SET password_hash = ?, updated_at = now() WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $c['id']]);
        // Termina as outras sessões (ex.: outro telemóvel)
        db()->prepare('DELETE FROM customer_sessions WHERE customer_id = ? AND token_hash <> ?')->execute([$c['id'], $c['token_hash']]);
        return ['ok' => true];
    }

    /** Apaga a conta e as sessões. As reservas e documentos fiscais ficam (são registos da empresa). */
    private static function delete(array $in): array
    {
        $c = self::require();
        $password = is_string($in['password'] ?? null) ? $in['password'] : '';
        if (!password_verify($password, $c['password_hash'])) throw new ApiError(401, 'invalid_credentials');
        db()->prepare('DELETE FROM customers WHERE id = ?')->execute([$c['id']]);
        Audit::log('customer_deleted', 'customer', (int) $c['id'], [], null, 'cliente');
        self::cookies('', -3600);
        return ['ok' => true];
    }

    /* ── Palavra-passe esquecida ────────────────────────── */

    private static function forgot(array $in): array
    {
        require_allowed_origin();
        $email = strtolower(clean_text($in['email'] ?? '', 160));
        rate_limit('account-forgot:' . $email, 3, 3600);
        $s = db()->prepare('SELECT id, name, lang FROM customers WHERE lower(email) = ?');
        $s->execute([$email]);
        if ($c = $s->fetch()) {
            $token = bin2hex(random_bytes(32));
            db()->prepare("UPDATE customers SET reset_token_hash = ?, reset_expires_at = now() + interval '" . self::RESET_TTL . "' WHERE id = ?")->execute([hash('sha256', $token), $c['id']]);
            self::resetMail($email, $c['lang'], (int) $c['id'], $c['name'], $token);
        }
        return ['ok' => true];      // sempre igual: não revela se o e-mail tem conta
    }

    private static function reset(array $in): array
    {
        require_allowed_origin();
        rate_limit('account-reset', 10, 900);
        $token = is_string($in['token'] ?? null) ? $in['token'] : '';
        $password = is_string($in['password'] ?? null) ? $in['password'] : '';
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) throw new ApiError(422, 'invalid_link');
        self::checkPassword($password);
        $s = db()->prepare('SELECT id FROM customers WHERE reset_token_hash = ? AND reset_expires_at > now()');
        $s->execute([hash('sha256', $token)]);
        $id = (int) ($s->fetchColumn() ?: throw new ApiError(422, 'invalid_link'));
        db()->prepare('UPDATE customers SET password_hash = ?, reset_token_hash = NULL, reset_expires_at = NULL, updated_at = now() WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $id]);
        db()->prepare('DELETE FROM customer_sessions WHERE customer_id = ?')->execute([$id]);
        Audit::log('customer_password_reset', 'customer', $id, [], null, 'cliente');
        self::startSession($id);
        return self::me();
    }

    /* ── Apoio ──────────────────────────────────────────── */

    private static function checkPassword(string $p): void
    {
        if (strlen($p) < 8 || strlen($p) > 200 || !preg_match('/[A-Za-z]/', $p) || !preg_match('/\d/', $p)) {
            throw new ApiError(422, 'weak_password');
        }
    }

    /** E-mail de reposição (PT/EN). O link secreto vai no e-mail mas NÃO fica no registo. */
    private static function resetMail(string $to, string $lang, int $id, string $name, string $token): void
    {
        $en = $lang === 'en';
        $link = rtrim((string) config('app.site_url'), '/') . ($en ? '/en/account/' : '/conta/') . '#reset=';
        $first = strtok($name, ' ') ?: $name;
        $body = $en
            ? "Hello $first,\n\nTo choose a new password, open this link (valid 1 hour):\n\n{LINK}\n\nIf you did not ask for this, ignore this e-mail: your password stays the same.\n\nMoz Camp Adventures"
            : "Olá $first,\n\nPara escolher uma nova palavra-passe, abra este link (válido 1 hora):\n\n{LINK}\n\nSe não pediu isto, ignore este e-mail: a sua palavra-passe não muda.\n\nMoz Camp Adventures";
        Mailer::send('account_reset', $to, $en ? 'Reset your password — Moz Camp Adventures' : 'Repor a palavra-passe — Moz Camp Adventures',
            str_replace('{LINK}', $link . $token, $body), 'customer', $id, (string) config('mail.team'), [], $lang, null, str_replace('{LINK}', $link . '[link secreto — não registado]', $body));
    }

    /* ── Painel (equipa) ────────────────────────────────── */

    /** Lista de clientes com número de reservas (permissão customers.view). */
    public static function adminList(array $q): array
    {
        $where = ['1=1'];
        $args = [];
        if (($q['marketing'] ?? '') === '1') $where[] = 'c.marketing_opt_in';
        if (($s = clean_text($q['q'] ?? '', 120)) !== '') {
            $where[] = '(c.name ILIKE ? OR c.email ILIKE ? OR c.phone ILIKE ?)';
            array_push($args, "%$s%", "%$s%", "%$s%");
        }
        $stmt = db()->prepare('SELECT c.id, c.name, c.email, c.phone, c.lang, c.marketing_opt_in AS marketing, c.marketing_consent_at, c.created_at, c.last_login_at,
                (SELECT count(*) FROM bookings b WHERE b.customer_id = c.id) AS bookings
            FROM customers c WHERE ' . implode(' AND ', $where) . ' ORDER BY c.created_at DESC LIMIT 500');
        $stmt->execute($args);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['marketing'] = (bool) $r['marketing'];
            $r['bookings'] = (int) $r['bookings'];
        }
        $tot = db()->query('SELECT count(*) AS total, count(*) FILTER (WHERE marketing_opt_in) AS marketing FROM customers')->fetch();
        return ['customers' => $rows, 'totals' => array_map('intval', $tot)];
    }
}
