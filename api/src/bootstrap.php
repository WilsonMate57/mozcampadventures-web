<?php
/**
 * MOZ CAMP ADVENTURES — api/src/bootstrap.php
 * Configuração, ligação PostgreSQL, respostas JSON e protecções comuns.
 * A configuração (credenciais, segredos) fica FORA da pasta pública:
 *   MCA_CONFIG=/caminho/mca-config.php  ou  <domínio>/private/mca-config.php
 * Ver api/config.example.php e docs/DEPLOYMENT.md.
 */

declare(strict_types=1);

const MCA_API_VERSION = '1.0.0';

function config(?string $key = null): mixed
{
    static $cfg = null;
    if ($cfg === null) {
        $path = getenv('MCA_CONFIG') ?: dirname(__DIR__, 3) . '/private/mca-config.php';
        if (!is_file($path)) {
            throw new RuntimeException('Configuração em falta: ' . basename($path));
        }
        $cfg = require $path;
        date_default_timezone_set($cfg['app']['timezone'] ?? 'Africa/Maputo');
    }
    if ($key === null) {
        return $cfg;
    }
    $value = $cfg;
    foreach (explode('.', $key) as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            return null;
        }
        $value = $value[$part];
    }
    return $value;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(config('db.dsn'), config('db.user'), config('db.pass'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec("SET TIME ZONE 'Africa/Maputo'");
    }
    return $pdo;
}

final class ApiError extends RuntimeException
{
    public function __construct(public readonly int $status, public readonly string $errorCode, string $message = '', public readonly array $extra = [])
    {
        parent::__construct($message ?: $errorCode);
    }
}

function json_response(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Corpo JSON do pedido (limite 32 KB). */
function json_input(): array
{
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($type, 'application/json') !== 0) {
        throw new ApiError(415, 'unsupported_media_type');
    }
    $raw = file_get_contents('php://input', false, null, 0, 32768);
    $data = json_decode($raw ?: '', true);
    if (!is_array($data)) {
        throw new ApiError(400, 'invalid_json');
    }
    return $data;
}

/** Pedidos de escrita só a partir das origens do site (protecção CSRF). */
function require_allowed_origin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = config('app.allowed_origins') ?? [];
    if ($origin === '' || !in_array(rtrim($origin, '/'), $allowed, true)) {
        throw new ApiError(403, 'origin_not_allowed');
    }
}

function client_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

/** IP guardado apenas como hash com segredo (não reversível). */
function ip_hash(): string
{
    return hash_hmac('sha256', client_ip(), (string) config('app.secret'));
}

/** Limite de pedidos por IP e acção, em janela fixa. */
function rate_limit(string $action, int $max, int $windowSeconds): void
{
    $window = date('c', intdiv(time(), $windowSeconds) * $windowSeconds);
    $stmt = db()->prepare(
        'INSERT INTO rate_limits (key, window_start, hits) VALUES (:k, :w, 1)
         ON CONFLICT (key, window_start) DO UPDATE SET hits = rate_limits.hits + 1
         RETURNING hits'
    );
    $stmt->execute([':k' => $action . ':' . ip_hash(), ':w' => $window]);
    if ((int) $stmt->fetchColumn() > $max) {
        throw new ApiError(429, 'too_many_requests');
    }
    if (random_int(1, 50) === 1) {
        db()->exec("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'");
    }
}

/** Campo-armadilha para bots: tem de vir vazio. */
function reject_honeypot(array $in): void
{
    if (!empty($in['website'])) {
        throw new ApiError(400, 'rejected');
    }
}

/** Texto limpo e com tamanho máximo; '' se ausente. */
function clean_text(mixed $value, int $max): string
{
    if (!is_string($value) && !is_int($value)) {
        return '';
    }
    $s = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string) $value) ?? '');
    return utf8_cut($s, $max);
}

/** Corta a $max caracteres UTF-8 (sem depender da extensão mbstring). */
function utf8_cut(string $s, int $max): string
{
    if (!preg_match_all('/./us', $s, $m) || count($m[0]) <= $max) {
        return $s;
    }
    return implode('', array_slice($m[0], 0, $max));
}

function lang_of(mixed $value): string
{
    return $value === 'en' ? 'en' : 'pt';
}
