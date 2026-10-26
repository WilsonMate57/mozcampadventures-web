<?php
/**
 * MOZ CAMP ADVENTURES — aplica as migrações SQL pendentes (só linha de comandos).
 *   php api/bin/migrate.php            aplica as pendentes, cada uma numa transacção
 *   php api/bin/migrate.php --status   lista aplicadas/pendentes
 * Fazer backup da base de dados antes (ver docs/DEPLOYMENT.md).
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require dirname(__DIR__) . '/src/bootstrap.php';

$pdo = db();
$pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
$applied = $pdo->query('SELECT version FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);
$files = glob(dirname(__DIR__) . '/migrations/*.sql');
sort($files);

foreach ($files as $file) {
    $version = basename($file, '.sql');
    if (in_array($version, $applied, true)) {
        echo "  aplicada  $version\n";
        continue;
    }
    if (in_array('--status', $argv, true)) {
        echo "  PENDENTE  $version\n";
        continue;
    }
    $pdo->beginTransaction();
    try {
        $pdo->exec((string) file_get_contents($file));
        $pdo->prepare('INSERT INTO schema_migrations (version) VALUES (?)')->execute([$version]);
        $pdo->commit();
        echo "  APLICADA  $version\n";
    } catch (Throwable $e) {
        $pdo->rollBack();
        fwrite(STDERR, "  ERRO em $version: {$e->getMessage()}\n  Nada desta migração foi aplicado.\n");
        exit(1);
    }
}
