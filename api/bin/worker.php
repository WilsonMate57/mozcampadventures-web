<?php
/**
 * MOZ CAMP ADVENTURES — tarefas periódicas (só linha de comandos).
 *   /opt/plesk/php/8.4/bin/php httpdocs/api/bin/worker.php
 * Plesk → Tarefas agendadas, de 5 em 5 minutos, com o utilizador do domínio.
 * Envia as mensagens de WhatsApp em fila (repetições) e, a partir das 08:00 de Maputo, os lembretes.
 * Live Chat: envia por e-mail as respostas que o visitante não viu e apaga o que passou do prazo de retenção.
 * Só escreve quando fez alguma coisa, para o Plesk não enviar um e-mail a cada execução.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$src = dirname(__DIR__) . '/src';
foreach (['bootstrap', 'Catalog', 'Mailer', 'EmailView', 'Services', 'Auth', 'Pdf', 'Invoices', 'WhatsApp', 'Chat'] as $f) require "$src/$f.php";

$lock = fopen(rtrim((string) config('app.storage_dir'), '/\\') . '/worker.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) exit(0);      // a anterior ainda corre
$done = [];
foreach (['whatsapp' => static fn () => WhatsApp::work(), 'chat_replies' => static fn () => Chat::mailReplies(), 'chat_purged' => static fn () => Chat::purge()] as $job => $run) {
    try {
        $done[$job] = $run();           // uma tarefa com erro não impede as outras
    } catch (Throwable $e) {
        error_log("[MCA worker] $job: " . $e->getMessage());
        echo "$job: erro (ver o registo do PHP)\n";
    }
}
if (array_filter($done, static fn ($v) => is_array($v) ? array_sum($v) > 0 : $v > 0)) echo json_encode($done), "\n";
