<?php
/**
 * MOZ CAMP ADVENTURES — repõe o catálogo publicado no painel depois de um deploy por Git.
 *   php api/bin/catalog-restore.php
 * O deploy substitui data/*.json pela versão do repositório. A publicação no painel guarda uma cópia
 * em storage/catalog-live/: se for diferente, este comando repõe-a e regenera o site.
 * Sem cópia (ainda nada publicado no painel), não faz nada.
 * Colocar em Plesk → Git → Deployment actions, depois de `npm ci --omit=dev`.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require dirname(__DIR__) . '/src/bootstrap.php';

$root = dirname(__DIR__, 2);
$live = rtrim((string) (config('app.data_dir') ?: "$root/data"), '/\\');
$snap = rtrim((string) config('app.storage_dir'), '/\\') . '/catalog-live';
$files = ['tours.json', 'accommodations.json', 'en.json', 'booking-rules.json', 'categories.json'];

if (!is_file("$snap/tours.json")) {
    echo "Sem catálogo publicado no painel: nada a repor.\n";
    exit(0);
}
$changed = 0;
foreach ($files as $f) {
    if (!is_file("$snap/$f")) continue;
    if (json_decode((string) file_get_contents("$snap/$f")) === null) {
        fwrite(STDERR, "Cópia inválida: $f. Nada foi alterado.\n");
        exit(1);
    }
    if (!is_file("$live/$f") || hash_file('sha256', "$snap/$f") !== hash_file('sha256', "$live/$f")) $changed++;
}
if (!$changed) {
    echo "Catálogo já está igual ao publicado no painel.\n";
    exit(0);
}
foreach ($files as $f) if (is_file("$snap/$f")) copy("$snap/$f", "$live/$f");
echo "Catálogo do painel reposto ($changed ficheiros). A regenerar o site…\n";
passthru(escapeshellarg((string) (config('app.node_bin') ?: 'node')) . ' ' . escapeshellarg("$root/scripts/publish.mjs"), $code);
exit($code);
