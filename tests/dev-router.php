<?php
/**
 * Router para o servidor embutido do PHP (só desenvolvimento/testes):
 *   MCA_CONFIG=/caminho/config.php php -S localhost:8791 tests/dev-router.php
 * Serve o site estático como o Plesk e encaminha /api/* para api/index.php.
 */

$root = dirname(__DIR__);
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';

/* Mesma Content-Security-Policy da produção (lida do .htaccess); sem upgrade-insecure-requests em http://localhost */
if (preg_match('/Header always set Content-Security-Policy "([^"]+)"/', (string) file_get_contents($root . '/.htaccess'), $m)) {
    header('Content-Security-Policy: ' . trim(str_replace('upgrade-insecure-requests', '', $m[1]), " ;"));
}

if (str_starts_with($path, '/api/') || $path === '/api') {
    /* Diagnóstico local: regista método, caminho, estado, Origin e browser (sem conteúdo do pedido) ao lado da config de dev */
    if (getenv('MCA_CONFIG')) {
        $t0 = microtime(true);
        register_shutdown_function(function () use ($path, $t0) {
            $line = sprintf("%s %s %s → %d (%d ms) origin=%s type=%s ua=%s\n", date('H:i:s'), $_SERVER['REQUEST_METHOD'], $path, http_response_code(),
                (microtime(true) - $t0) * 1000, $_SERVER['HTTP_ORIGIN'] ?? '-', $_SERVER['CONTENT_TYPE'] ?? '-', substr($_SERVER['HTTP_USER_AGENT'] ?? '-', 0, 80));
            @file_put_contents(dirname(getenv('MCA_CONFIG')) . '/dev-requests.log', $line, FILE_APPEND);
        });
    }
    require $root . '/api/index.php';
    return true;
}
$file = realpath($root . $path . (str_ends_with($path, '/') ? 'index.html' : ''));
if ($file === false || !str_starts_with($file, $root) || is_dir($file)) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    readfile($root . '/404.html');
    return true;
}
/* Servido aqui (e não com «return false») para que o cabeçalho CSP acima seja enviado */
$types = ['html' => 'text/html; charset=utf-8', 'css' => 'text/css', 'js' => 'text/javascript', 'json' => 'application/json',
          'webp' => 'image/webp', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'svg' => 'image/svg+xml', 'ico' => 'image/x-icon',
          'woff2' => 'font/woff2', 'xml' => 'application/xml', 'txt' => 'text/plain; charset=utf-8', 'pdf' => 'application/pdf'];
header('Content-Type: ' . ($types[strtolower(pathinfo($file, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
header('Content-Length: ' . filesize($file));
readfile($file);
return true;
