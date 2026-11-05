<?php
/**
 * MOZ CAMP ADVENTURES — API pública (Fase 4)
 *   GET  /api/health
 *   POST /api/bookings          pedido de reserva → referência MCA-AAAA-NNNNN
 *   GET  /api/availability?item=&from=&to=   datas reserváveis de um pacote
 *   POST /api/contact           mensagem de contacto
 *   GET  /api/reviews?item=…    avaliações aprovadas (item ou 'home')
 *   POST /api/reviews           nova avaliação (fica pendente)
 *   POST /api/proof/info        dados da factura para o link privado do comprovativo
 *   POST /api/proof             comprovativo do cliente (multipart) → pagamento «declarado»
 *   /api/admin/*                painel de administração (ver src/Admin.php)
 * Erros: {"error": "<código>", ...} com o estado HTTP adequado.
 */

declare(strict_types=1);

require __DIR__ . '/src/bootstrap.php';
require __DIR__ . '/src/Catalog.php';
require __DIR__ . '/src/Availability.php';
require __DIR__ . '/src/Mailer.php';
require __DIR__ . '/src/EmailView.php';
require __DIR__ . '/src/Services.php';
require __DIR__ . '/src/Auth.php';
require __DIR__ . '/src/Pdf.php';
require __DIR__ . '/src/Invoices.php';
require __DIR__ . '/src/Payments.php';
require __DIR__ . '/src/Notify.php';
require __DIR__ . '/src/WhatsApp.php';
require __DIR__ . '/src/Admin.php';
require __DIR__ . '/src/Account.php';
require __DIR__ . '/src/CatalogAdmin.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = '/' . trim((string) preg_replace('#^/?api#', '', parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/'), '/');

try {
    if (str_starts_with($path, '/admin/')) {       // painel: /api/admin/* (sessão + permissões)
        $result = Admin::route($method, substr($path, 6));
        json_response(200, $result);
    }
    if (str_starts_with($path, '/account/')) {     // contas de cliente: /api/account/* (sessão própria, separada da equipa)
        $result = Account::route($method, substr($path, 8));
        json_response(200, $result);
    }
    $result = match ([$method, $path]) {
        ['GET', '/health'] => ['ok' => true, 'version' => MCA_API_VERSION, 'db' => (bool) db()->query('SELECT 1')->fetchColumn()],
        ['POST', '/bookings'] => (function () { require_allowed_origin(); return Bookings::create(json_input()); })(),
        ['POST', '/contact'] => (function () { require_allowed_origin(); return Contact::create(json_input()); })(),
        ['GET', '/availability'] => Availability::publicView($_GET),
        ['GET', '/reviews'] => Reviews::list(isset($_GET['item']) ? (string) $_GET['item'] : null),
        ['POST', '/reviews'] => (function () { require_allowed_origin(); return Reviews::create(json_input()); })(),
        ['POST', '/proof/info'] => Payments::proofInfo(json_input()),
        ['POST', '/proof'] => Payments::submitProof(),
        ['POST', '/client/booking'] => Notify::clientView(json_input()),
        ['POST', '/client/document'] => Notify::clientDocument(json_input()),
        ['POST', '/client/proof-link'] => Notify::clientProofLink(json_input()),
        default => throw new ApiError(404, 'not_found'),
    };
    /* POST que só consulta (o token vai no corpo, não no URL) responde 200; os que criam, 201 */
    $readOnly = in_array($path, ['/client/booking', '/client/proof-link', '/proof/info'], true);
    json_response($method === 'POST' && !$readOnly ? 201 : 200, $result);
} catch (ApiError $e) {
    json_response($e->status, ['error' => $e->errorCode] + $e->extra);
} catch (Throwable $e) {
    error_log('[MCA API] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json_response(500, ['error' => 'server_error']);
}
