<?php
/**
 * MOZ CAMP ADVENTURES — api/src/Auth.php
 * Autenticação do painel: sessões no servidor (cookie HttpOnly + SameSite=Strict),
 * token CSRF por sessão, limite de tentativas de login, perfis com permissões
 * e registo de auditoria.
 */

declare(strict_types=1);

final class Auth
{
    public const COOKIE = 'mca_admin';
    private const IDLE = 4 * 3600;        // sessão expira após 4 h sem actividade
    private const ABSOLUTE = 12 * 3600;   // e no máximo 12 h depois do login

    /** Catálogo de permissões atribuíveis a perfis (o perfil admin tem '*'). */
    public const PERMISSIONS = [
        'dashboard.view'   => 'Ver o painel de resumo',
        'bookings.view'    => 'Ver reservas',
        'bookings.manage'  => 'Alterar estado e notas das reservas',
        'bookings.create'  => 'Registar pedidos manuais (WhatsApp, telefone)',
        'invoices.view'    => 'Ver facturas e PDFs',
        'invoices.issue'   => 'Criar e emitir facturas',
        'invoices.send'    => 'Enviar facturas ao cliente',
        'invoices.void'    => 'Anular facturas emitidas',
        'payments.view'    => 'Ver pagamentos, saldos e comprovativos',
        'payments.record'  => 'Registar pagamentos (ficam em verificação)',
        'payments.confirm' => 'Confirmar ou recusar pagamentos (emite recibo)',
        'payments.reverse' => 'Reverter pagamentos e registar reembolsos',
        'reviews.moderate' => 'Aprovar ou rejeitar avaliações',
        'emails.manage'    => 'Ver registo de e-mails e reenviar',
        'messages.view'    => 'Ver mensagens de contacto',
        'settings.manage'  => 'Alterar dados da empresa e de pagamento',
        'users.manage'     => 'Gerir utilizadores e perfis',
        'audit.view'       => 'Ver o registo de auditoria',
    ];

    private static ?array $user = null;
    private static bool $loaded = false;

    public static function user(): ?array
    {
        if (self::$loaded) {
            return self::$user;
        }
        self::$loaded = true;
        $token = $_COOKIE[self::COOKIE] ?? '';
        if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
            return null;
        }
        $stmt = db()->prepare('SELECT s.token_hash, s.csrf_token, s.last_seen_at, u.id, u.name, u.email, u.active, r.id AS role_id, r.code AS role_code, r.name AS role_name, r.permissions
            FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id
            WHERE s.token_hash = ? AND s.expires_at > now() AND s.last_seen_at > now() - make_interval(secs => ?)');
        $stmt->execute([hash('sha256', $token), self::IDLE]);
        $row = $stmt->fetch();
        if (!$row || !$row['active']) {
            return null;
        }
        if (strtotime((string) $row['last_seen_at']) < time() - 300) {
            db()->prepare('UPDATE sessions SET last_seen_at = now() WHERE token_hash = ?')->execute([$row['token_hash']]);
        }
        $row['permissions'] = self::parseArray($row['permissions']);
        return self::$user = $row;
    }

    public static function has(string $perm): bool
    {
        $u = self::user();
        return $u !== null && (in_array('*', $u['permissions'], true) || in_array($perm, $u['permissions'], true));
    }

    /** Exige sessão (401) e, opcionalmente, permissão (403). Escritas exigem CSRF e origem. */
    public static function require(?string $perm = null): array
    {
        $u = self::user() ?? throw new ApiError(401, 'not_authenticated');
        if ($perm !== null && !self::has($perm)) {
            throw new ApiError(403, 'forbidden', '', ['permission' => $perm]);
        }
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
            require_allowed_origin();
            $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
            if (!is_string($sent) || !hash_equals($u['csrf_token'], $sent)) {
                throw new ApiError(403, 'csrf_invalid');
            }
        }
        return $u;
    }

    public static function login(array $in): array
    {
        require_allowed_origin();
        $email = strtolower(clean_text($in['email'] ?? '', 160));
        $password = is_string($in['password'] ?? null) ? $in['password'] : '';
        rate_limit('login:' . $email, 5, 900);       // 5 tentativas / 15 min por e-mail+IP

        $stmt = db()->prepare('SELECT id, name, password_hash, active FROM users WHERE lower(email) = ?');
        $stmt->execute([$email]);
        $u = $stmt->fetch();
        $hash = $u['password_hash'] ?? password_hash(random_bytes(8), PASSWORD_DEFAULT);   // mesmo custo se o e-mail não existir
        $ok = password_verify($password, $hash) && $u && $u['active'] && $u['password_hash'];
        if (!$ok) {
            Audit::log('login_failed', 'user', $u['id'] ?? null, ['email' => $email], $u ? (int) $u['id'] : null, $u['name'] ?? null);
            throw new ApiError(401, 'invalid_credentials');
        }
        if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
            db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $u['id']]);
        }
        $token = bin2hex(random_bytes(32));
        $csrf = bin2hex(random_bytes(32));
        db()->prepare('INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at, ip_hash, user_agent) VALUES (?, ?, ?, now() + make_interval(secs => ?), ?, ?)')
            ->execute([hash('sha256', $token), $u['id'], $csrf, self::ABSOLUTE, ip_hash(), clean_text($_SERVER['HTTP_USER_AGENT'] ?? '', 300)]);
        db()->prepare('UPDATE users SET last_login_at = now() WHERE id = ?')->execute([$u['id']]);
        db()->exec('DELETE FROM sessions WHERE expires_at < now()');
        self::setCookie($token, self::ABSOLUTE);
        Audit::log('login', 'user', $u['id'], [], (int) $u['id'], $u['name']);
        self::$loaded = false;
        $_COOKIE[self::COOKIE] = $token;
        return self::me();
    }

    public static function logout(): array
    {
        $u = self::require();
        db()->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([$u['token_hash']]);
        self::setCookie('', -3600);
        Audit::log('logout', 'user', $u['id']);
        return ['ok' => true];
    }

    public static function me(): array
    {
        $u = self::user() ?? throw new ApiError(401, 'not_authenticated');
        return ['user' => ['id' => $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role_name'], 'role_code' => $u['role_code'], 'permissions' => $u['permissions']], 'csrf' => $u['csrf_token']];
    }

    /** Define a palavra-passe a partir do link de configuração (convite ou reposição). */
    public static function setupPassword(array $in): array
    {
        require_allowed_origin();
        rate_limit('setup', 10, 900);
        $token = is_string($in['token'] ?? null) ? $in['token'] : '';
        $password = is_string($in['password'] ?? null) ? $in['password'] : '';
        if (strlen($password) < 10 || !preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
            throw new ApiError(422, 'weak_password');
        }
        $stmt = db()->prepare('UPDATE users SET password_hash = ?, setup_token_hash = NULL, setup_expires_at = NULL
            WHERE setup_token_hash = ? AND setup_expires_at > now() AND active RETURNING id, name');
        $stmt->execute([password_hash($password, PASSWORD_DEFAULT), hash('sha256', $token)]);
        $u = $stmt->fetch() ?: throw new ApiError(422, 'invalid_or_expired_token');
        db()->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$u['id']]);
        Audit::log('password_set', 'user', $u['id'], [], (int) $u['id'], $u['name']);
        return ['ok' => true];
    }

    /** Gera um link de configuração de palavra-passe válido por 48 h. */
    public static function issueSetupLink(int $userId): string
    {
        $token = bin2hex(random_bytes(32));
        db()->prepare("UPDATE users SET setup_token_hash = ?, setup_expires_at = now() + interval '48 hours' WHERE id = ?")->execute([hash('sha256', $token), $userId]);
        return rtrim((string) config('app.site_url'), '/') . '/admin/#/definir-senha?token=' . $token;
    }

    private static function setCookie(string $value, int $ttl): void
    {
        setcookie(self::COOKIE, $value, [
            'expires' => time() + $ttl, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict',
            'secure' => (bool) (config('app.cookie_secure') ?? true),
        ]);
    }

    public static function parseArray(mixed $pg): array
    {
        if (is_array($pg)) {
            return $pg;
        }
        $s = trim((string) $pg, '{}');
        return $s === '' ? [] : array_map(static fn ($x) => trim($x, '"'), explode(',', $s));
    }
}

final class Audit
{
    public static function log(string $action, ?string $entity = null, int|string|null $entityId = null, array $data = [], ?int $userId = null, ?string $userName = null): void
    {
        $u = $userId === null ? Auth::user() : null;
        db()->prepare('INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, data, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([$userId ?? ($u['id'] ?? null), $userName ?? ($u['name'] ?? null), $action, $entity, $entityId === null ? null : (string) $entityId, json_encode($data, JSON_UNESCAPED_UNICODE), ip_hash()]);
    }
}
