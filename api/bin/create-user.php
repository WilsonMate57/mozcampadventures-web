<?php
/**
 * MOZ CAMP ADVENTURES — cria um utilizador do painel (só linha de comandos).
 *   php api/bin/create-user.php "Nome" email@exemplo.com admin|gerente
 * Mostra um link de configuração da palavra-passe (válido 48 h).
 * Usado para os primeiros acessos; depois, o administrador gere utilizadores no painel.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require dirname(__DIR__) . '/src/bootstrap.php';
require dirname(__DIR__) . '/src/Auth.php';

[, $name, $email, $roleCode] = $argv + [null, null, null, null];
if (!$name || !filter_var($email, FILTER_VALIDATE_EMAIL) || !$roleCode) {
    fwrite(STDERR, "Uso: php api/bin/create-user.php \"Nome\" email role(admin|gerente)\n");
    exit(1);
}
$role = db()->prepare('SELECT id FROM roles WHERE code = ?');
$role->execute([$roleCode]);
$roleId = $role->fetchColumn() ?: exit("Perfil desconhecido: $roleCode\n");

$stmt = db()->prepare('INSERT INTO users (name, email, role_id) VALUES (?, lower(?), ?) ON CONFLICT ((lower(email))) DO UPDATE SET name = EXCLUDED.name RETURNING id');
$stmt->execute([$name, $email, $roleId]);
$id = (int) $stmt->fetchColumn();
$link = Auth::issueSetupLink($id);
Audit::log('user_created_cli', 'user', $id, ['email' => strtolower($email), 'role' => $roleCode], null, 'linha de comandos');
echo "Utilizador #$id ($roleCode): $email\nLink para definir a palavra-passe (48 h):\n$link\n";
