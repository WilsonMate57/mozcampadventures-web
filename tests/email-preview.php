<?php
/**
 * MOZ CAMP ADVENTURES — tests/email-preview.php
 * Gera os e-mails (HTML) com dados FICTÍCIOS numa pasta, para rever o layout no browser.
 *   MCA_CONFIG=<config dev> php tests/email-preview.php <pasta>
 * As imagens vêm de app.site_url (em desenvolvimento, o servidor local tem de estar a correr).
 */

declare(strict_types=1);

$root = dirname(__DIR__);
require "$root/api/src/bootstrap.php";
require "$root/api/src/Invoices.php";
require "$root/api/src/Mailer.php";
require "$root/api/src/EmailView.php";

$out = $argv[1] ?? sys_get_temp_dir() . '/mca-email-preview';
if (!is_dir($out)) mkdir($out, 0777, true);
$area = rtrim((string) config('app.site_url'), '/') . '/reserva/#r=MCA-2026-00123&t=exemplo';
$lines = [['Adultos: 2 × 9.300 MZN', '18.600 MZN'], ['Crianças: 1 × 6.500 MZN', '6.500 MZN'], ['Transfer Hotel – Marina', '1.000 MZN']];
$base = ['ref' => 'MCA-2026-00123', 'item' => 'Bilene — Lagoa de São Martinho', 'slug' => 'bilene-day-trip', 'lines' => $lines, 'total' => '26.100 MZN', 'to_confirm' => false,
    'name' => 'Joana Exemplo', 'phone' => '+258 84 000 0000', 'email' => 'joana@example.com', 'message' => 'Viajamos com uma criança de 6 anos. Há coletes salva-vidas?'];
$booking = ['id' => 1, 'reference' => 'MCA-2026-00123', 'item_id' => 'island-hopping-experience', 'item_name' => 'Island Hopping Experience', 'item_kind' => 'tour', 'lang' => 'pt',
    'customer_name' => 'Joana Exemplo', 'service_date' => '2026-11-14', 'checkin' => null, 'checkout' => null, 'adults' => 2, 'children' => 1];

$files = [
    'pedido-recebido' => EmailView::bookingReceived(['lang' => 'pt', 'when' => EmailView::date('2026-11-14', 'pt'), 'pax' => '3 (2 adultos, 1 criança)', 'area' => $area] + $base),
    'request-received-en' => EmailView::bookingReceived(['lang' => 'en', 'when' => EmailView::date('2026-11-14', 'en'), 'pax' => '3 (2 adults, 1 child)', 'area' => $area] + $base),
    'equipa-novo-pedido' => EmailView::teamBooking(['lang' => 'pt', 'when' => EmailView::date('2026-11-14', 'pt'), 'pax' => '3 (2 adultos, 1 criança)'] + $base),
    'reserva-confirmada' => EmailView::notification('booking_confirmed', 'pt', $booking, "A sua reserva MCA-2026-00123 para Island Hopping Experience (14/11/2026) está CONFIRMADA.\n\nSe ainda não recebeu a factura, enviá-la-emos em breve com as instruções de pagamento.", ['name' => 'Joana Exemplo', 'link' => $area]),
    'pagamento-recebido' => EmailView::notification('payment_confirmed', 'pt', $booking, "Confirmamos a recepção de 26.100 MZN (M-Pesa · ref. 8HG2K1) referente à factura FT 2026/12.\nRecibo: RC 2026/9 (em anexo).\n\nA factura está totalmente paga. Obrigado!", ['name' => 'Joana Exemplo', 'link' => $area, 'invoice' => 'FT 2026/12', 'amount' => '26.100 MZN']),
    'obrigado-avaliacao' => EmailView::notification('booking_completed', 'pt', $booking, "Obrigado por ter vivido Island Hopping Experience connosco!\n\nA sua opinião ajuda outros viajantes. Pode deixar a sua avaliação aqui:\nhttps://mozcampadventures.co.mz/tours/island-hopping-experience/#avaliacoes", ['name' => 'Joana Exemplo', 'link' => $area, 'review' => 'https://mozcampadventures.co.mz/tours/island-hopping-experience/#avaliacoes']),
    'factura' => EmailView::invoice(['lang' => 'pt', 'name' => 'Joana Exemplo', 'label' => 'Factura', 'number' => 'FT 2026/12', 'ref' => 'MCA-2026-00123', 'item' => 'Island Hopping Experience', 'amount' => '26.100 MZN', 'proof' => rtrim((string) config('app.site_url'), '/') . '/pagamento/#t=exemplo', 'area' => $area]),
    'convite-painel' => EmailView::fromText("Olá Domingos,\n\nFoi criado o seu acesso ao painel da Moz Camp Adventures (perfil Gerente).\n\nDefina a sua palavra-passe neste link (válido 48 horas):\nhttps://mozcampadventures.co.mz/admin/#/definir-senha?token=exemplo\n\nMoz Camp Adventures", 'Acesso ao painel — Moz Camp Adventures', 'pt'),
];
foreach ($files as $name => $html) file_put_contents("$out/$name.html", $html);
echo count($files) . " e-mails em $out (" . implode(', ', array_map(static fn ($h) => round(strlen($h) / 1024) . ' KB', $files)) . ")\n";
