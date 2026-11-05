<?php
/**
 * MOZ CAMP ADVENTURES — tarefas periódicas (só linha de comandos).
 *   /opt/plesk/php/8.4/bin/php httpdocs/api/bin/worker.php
 * Plesk → Tarefas agendadas, de 5 em 5 minutos, com o utilizador do domínio.
 * Envia as mensagens de WhatsApp em fila (repetições) e, a partir das 08:00 de Maputo, os lembretes.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$src = dirname(__DIR__) . '/src';
foreach (['bootstrap', 'Catalog', 'Mailer', 'EmailView', 'Services', 'Auth', 'Pdf', 'Invoices', 'WhatsApp'] as $f) require "$src/$f.php";

$lock = fopen(rtrim((string) config('app.storage_dir'), '/\\') . '/worker.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) exit(0);      // a anterior ainda corre
echo json_encode(WhatsApp::work()), "\n";
