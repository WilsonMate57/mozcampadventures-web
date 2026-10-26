<?php
/**
 * MOZ CAMP ADVENTURES — api/src/Notify.php
 * Notificações ao cliente (PT/EN, no idioma da reserva) e área do cliente.
 * Cada notificação devolve o resultado real: sent | failed | logged |
 * no_email (cliente sem e-mail) | disabled (tipo desligado nas Definições) | skipped.
 */

declare(strict_types=1);

final class Notify
{
    private const T = [
        'pt' => [
            'hello' => 'Olá {name},', 'sign' => "Moz Camp Adventures\nWhatsApp +258 84 440 6543 · booking@mozcampadventures.co.mz",
            'area' => "Acompanhe a sua reserva e descarregue os seus documentos aqui:\n{link}",
            'booking_confirmed.subject' => 'Reserva confirmada — {ref}',
            'booking_confirmed.body' => "A sua reserva {ref} para {item} ({when}) está CONFIRMADA.{note}\n\nSe ainda não recebeu a factura, enviá-la-emos em breve com as instruções de pagamento.",
            'booking_cancelled.subject' => 'Reserva cancelada — {ref}',
            'booking_cancelled.body' => "A sua reserva {ref} para {item} ({when}) foi cancelada.{note}\n\nSe tiver dúvidas ou se pagou algum valor, responda a este e-mail ou fale connosco por WhatsApp.",
            'booking_completed.subject' => 'Obrigado pela sua visita — {ref}',
            'booking_completed.body' => "Obrigado por ter vivido {item} connosco!\n\nA sua opinião ajuda outros viajantes. Pode deixar a sua avaliação aqui:\n{review}",
            'payment_confirmed.subject' => 'Pagamento recebido — {invoice}',
            'payment_confirmed.body' => "Confirmamos a recepção de {amount} ({method}{ref}) referente à factura {invoice}.\nRecibo: {receipt} (em anexo).\n\n{status}",
            'paid_full' => 'A factura está totalmente paga. Obrigado!',
            'paid_partial' => 'Valor ainda em dívida: {balance}.',
            'payment_refused.subject' => 'Comprovativo não confirmado — {invoice}',
            'payment_refused.body' => "Não conseguimos confirmar o pagamento de {amount} ({method}{ref}) que nos enviou para a factura {invoice}.\nMotivo: {note}\n\nPor favor, verifique e envie novamente o comprovativo, ou fale connosco.",
            'payment_reversed.subject' => 'Pagamento anulado — {invoice}',
            'payment_reversed.body' => "O pagamento de {amount} ({method}{ref}) da factura {invoice} foi anulado e o recibo {receipt} deixou de ser válido.\nMotivo: {note}\n\nValor em dívida: {balance}.",
            'refund.subject' => 'Reembolso efectuado — {invoice}',
            'refund.body' => "Efectuámos um reembolso de {amount} ({method}{ref}) referente à factura {invoice}.\nMotivo: {note}",
            'invoice_voided.subject' => 'Factura anulada — {invoice}',
            'invoice_voided.body' => "A factura {invoice} foi anulada.\nMotivo: {note}\n\nSe for emitida uma nova factura, recebê-la-á em breve.",
        ],
        'en' => [
            'hello' => 'Hello {name},', 'sign' => "Moz Camp Adventures\nWhatsApp +258 84 440 6543 · booking@mozcampadventures.co.mz",
            'area' => "Follow your booking and download your documents here:\n{link}",
            'booking_confirmed.subject' => 'Booking confirmed — {ref}',
            'booking_confirmed.body' => "Your booking {ref} for {item} ({when}) is CONFIRMED.{note}\n\nIf you have not yet received the invoice, we will send it shortly with payment instructions.",
            'booking_cancelled.subject' => 'Booking cancelled — {ref}',
            'booking_cancelled.body' => "Your booking {ref} for {item} ({when}) has been cancelled.{note}\n\nIf you have questions or have already paid, reply to this e-mail or contact us on WhatsApp.",
            'booking_completed.subject' => 'Thank you for travelling with us — {ref}',
            'booking_completed.body' => "Thank you for experiencing {item} with us!\n\nYour feedback helps other travellers. You can leave a review here:\n{review}",
            'payment_confirmed.subject' => 'Payment received — {invoice}',
            'payment_confirmed.body' => "We confirm receipt of {amount} ({method}{ref}) for invoice {invoice}.\nReceipt: {receipt} (attached).\n\n{status}",
            'paid_full' => 'The invoice is fully paid. Thank you!',
            'paid_partial' => 'Balance still due: {balance}.',
            'payment_refused.subject' => 'Proof of payment not confirmed — {invoice}',
            'payment_refused.body' => "We could not confirm the payment of {amount} ({method}{ref}) you sent for invoice {invoice}.\nReason: {note}\n\nPlease check and send the proof again, or contact us.",
            'payment_reversed.subject' => 'Payment cancelled — {invoice}',
            'payment_reversed.body' => "The payment of {amount} ({method}{ref}) for invoice {invoice} has been cancelled and receipt {receipt} is no longer valid.\nReason: {note}\n\nBalance due: {balance}.",
            'refund.subject' => 'Refund issued — {invoice}',
            'refund.body' => "We have issued a refund of {amount} ({method}{ref}) for invoice {invoice}.\nReason: {note}",
            'invoice_voided.subject' => 'Invoice cancelled — {invoice}',
            'invoice_voided.body' => "Invoice {invoice} has been cancelled.\nReason: {note}\n\nIf a new invoice is issued, you will receive it shortly.",
        ],
    ];

    public static function enabled(string $type): bool
    {
        $s = setting('notifications');
        return (bool) ($s[$type] ?? true);
    }

    /* ── Área do cliente ─────────────────────────────── */

    public static function token(array $b): string
    {
        return substr(hash_hmac('sha256', "booking:{$b['id']}:{$b['reference']}:{$b['client_link_version']}", (string) config('app.secret')), 0, 48);
    }

    public static function clientLink(array $b): string
    {
        $base = rtrim((string) config('app.site_url'), '/');
        return $base . ($b['lang'] === 'en' ? '/en/booking/' : '/reserva/') . '#r=' . $b['reference'] . '&t=' . self::token($b);
    }

    public static function booking(string $ref): ?array
    {
        $s = db()->prepare('SELECT * FROM bookings WHERE reference = ?');
        $s->execute([$ref]);
        return $s->fetch() ?: null;
    }

    /* ── Envio ───────────────────────────────────────── */

    /** Envia um modelo ao cliente da reserva. */
    private static function deliver(string $type, array $b, array $vars, ?string $toOverride = null, array $attachments = [], ?int $relatedId = null, string $relatedType = 'booking'): string
    {
        if (!self::enabled($type)) return 'disabled';
        $to = $toOverride ?: (string) $b['customer_email'];
        if ($to === '') return 'no_email';
        $lang = $b['lang'] === 'en' ? 'en' : 'pt';
        $t = self::T[$lang];
        $vars += ['name' => $b['customer_name'], 'ref' => $b['reference'], 'item' => $b['item_name'], 'when' => self::when($b, $lang), 'note' => '', 'link' => self::clientLink($b)];
        $fill = static fn (string $s) => preg_replace_callback('/\{(\w+)\}/', static fn ($m) => (string) ($vars[$m[1]] ?? $m[0]), $s);
        $body = $fill($t['hello']) . "\n\n" . $fill($t["$type.body"]) . "\n\n" . $fill($t['area']) . "\n\n" . $t['sign'];
        return Mailer::send("notify_$type", $to, $fill($t["$type.subject"]), $body, $relatedType, $relatedId ?? (int) $b['id'], (string) config('mail.team'), $attachments, $lang);
    }

    public static function bookingStatus(array $b, string $to, string $note): string
    {
        $type = ['confirmada' => 'booking_confirmed', 'cancelada' => 'booking_cancelled', 'concluida' => 'booking_completed'][$to] ?? null;
        if ($type === null) return 'skipped';
        $lang = $b['lang'] === 'en' ? 'en' : 'pt';
        $review = rtrim((string) config('app.site_url'), '/') . ($b['item_kind'] === 'stay' ? ($lang === 'en' ? '/en/accommodations/' : '/alojamentos/') : ($lang === 'en' ? '/en/tours/' : '/tours/')) . $b['item_id'] . '/#avaliacoes';
        $noteTxt = $note !== '' ? "\n" . ($lang === 'en' ? 'Note: ' : 'Nota: ') . $note : '';
        return self::deliver($type, $b, ['note' => $noteTxt, 'review' => $review]);
    }

    /** Notificações de pagamento/factura: $kind ∈ payment_confirmed | payment_refused | payment_reversed | refund. */
    public static function payment(string $kind, int $paymentId, string $note = ''): string
    {
        $s = db()->prepare('SELECT p.*, i.number AS invoice_number, i.customer, i.booking_id, r.number AS receipt_number, r.pdf_path AS receipt_path
            FROM payments p JOIN invoices i ON i.id = p.invoice_id LEFT JOIN receipts r ON r.id = p.receipt_id WHERE p.id = ?');
        $s->execute([$paymentId]);
        $p = $s->fetch();
        if (!$p) return 'skipped';
        $b = db()->prepare('SELECT * FROM bookings WHERE id = ?');
        $b->execute([$p['booking_id']]);
        $booking = $b->fetch();
        $customer = json_decode((string) $p['customer'], true);
        $bal = Payments::balance((int) $p['invoice_id']);
        $lang = $booking['lang'] === 'en' ? 'en' : 'pt';
        $t = self::T[$lang];
        $vars = [
            'invoice' => $p['invoice_number'], 'amount' => Invoices::money((float) $p['amount']), 'method' => $p['method'],
            'ref' => $p['reference'] ? ' · ref. ' . $p['reference'] : '', 'receipt' => $p['receipt_number'] ?? '—', 'note' => $note,
            'balance' => Invoices::money(max(0, $bal['balance'] ?? 0)),
            'status' => ($bal && $bal['pay_status'] === 'pago') ? $t['paid_full'] : str_replace('{balance}', Invoices::money(max(0, $bal['balance'] ?? 0)), $t['paid_partial']),
            'name' => $customer['name'] ?? $booking['customer_name'],
        ];
        $att = $kind === 'payment_confirmed' && $p['receipt_path'] ? [['name' => str_replace('/', '-', $p['receipt_number']) . '.pdf', 'mime' => 'application/pdf', 'path' => $p['receipt_path']]] : [];
        return self::deliver($kind, $booking, $vars, ($customer['email'] ?? '') ?: null, $att, $paymentId, 'payment');
    }

    public static function invoiceVoided(int $invoiceId, string $reason): string
    {
        $s = db()->prepare('SELECT i.number, i.customer, b.* FROM invoices i JOIN bookings b ON b.id = i.booking_id WHERE i.id = ?');
        $s->execute([$invoiceId]);
        $row = $s->fetch();
        if (!$row) return 'skipped';
        $customer = json_decode((string) $row['customer'], true);
        return self::deliver('invoice_voided', $row, ['invoice' => $row['number'], 'note' => $reason, 'name' => $customer['name'] ?? $row['customer_name']], ($customer['email'] ?? '') ?: null, [], $invoiceId, 'invoice');
    }

    private static function when(array $b, string $lang): string
    {
        $f = static fn ($d) => date('d/m/Y', strtotime((string) $d));
        return $b['service_date'] ? $f($b['service_date']) : $f($b['checkin']) . ' – ' . $f($b['checkout']);
    }

    /* ── Área do cliente (pública, com link assinado) ── */

    private static function clientBooking(array $in): array
    {
        require_allowed_origin();
        rate_limit('client-area', 60, 3600);
        $ref = (string) ($in['ref'] ?? '');
        $tok = (string) ($in['token'] ?? '');
        $b = preg_match('/^MCA-\d{4}-\d{5,}$/', $ref) ? self::booking($ref) : null;
        if (!$b || !preg_match('/^[a-f0-9]{48}$/', $tok) || !hash_equals(self::token($b), $tok)) {
            throw new ApiError(404, 'invalid_link');
        }
        return $b;
    }

    public static function clientView(array $in): array
    {
        $b = self::clientBooking($in);
        $inv = db()->prepare("SELECT i.id, i.doc_type, i.status, i.number, i.issue_date, i.total, ib.paid, ib.balance, ib.pay_status
            FROM invoices i LEFT JOIN invoice_balances ib ON ib.invoice_id = i.id WHERE i.booking_id = ? AND i.status <> 'rascunho' ORDER BY i.id");
        $inv->execute([$b['id']]);
        $rc = db()->prepare("SELECT r.id, r.number, r.amount, r.status, r.issued_at, i.number AS invoice FROM receipts r JOIN invoices i ON i.id = r.invoice_id WHERE i.booking_id = ? ORDER BY r.id");
        $rc->execute([$b['id']]);
        return [
            'booking' => ['reference' => $b['reference'], 'item' => $b['item_name'], 'kind' => $b['item_kind'], 'status' => $b['status'], 'service_date' => $b['service_date'], 'checkin' => $b['checkin'], 'checkout' => $b['checkout'],
                'adults' => (int) $b['adults'], 'children' => (int) $b['children'], 'name' => strtok((string) $b['customer_name'], ' '), 'lang' => $b['lang']],
            'invoices' => array_map(static fn ($i) => ['id' => (int) $i['id'], 'type' => $i['doc_type'], 'status' => $i['status'], 'number' => $i['number'], 'date' => $i['issue_date'], 'total' => (float) $i['total'],
                'paid' => $i['paid'] !== null ? (float) $i['paid'] : null, 'balance' => $i['balance'] !== null ? (float) $i['balance'] : null, 'pay_status' => $i['pay_status']], $inv->fetchAll()),
            'receipts' => array_map(static fn ($r) => ['id' => (int) $r['id'], 'number' => $r['number'], 'amount' => (float) $r['amount'], 'status' => $r['status'], 'date' => substr((string) $r['issued_at'], 0, 10), 'invoice' => $r['invoice']], $rc->fetchAll()),
        ];
    }

    /** Descarrega uma factura/recibo DESTA reserva (POST, para o token não ir para logs). */
    public static function clientDocument(array $in): never
    {
        $b = self::clientBooking($in);
        $id = (int) ($in['id'] ?? 0);
        if (($in['kind'] ?? '') === 'receipt') {
            $s = db()->prepare('SELECT r.id FROM receipts r JOIN invoices i ON i.id = r.invoice_id WHERE r.id = ? AND i.booking_id = ?');
            $s->execute([$id, $b['id']]);
            $s->fetchColumn() ?: throw new ApiError(404, 'not_found');
            Audit::log('client_receipt_download', 'receipt', $id, ['booking' => $b['reference']], null, 'cliente');
            Payments::streamReceipt($id);
        }
        $s = db()->prepare("SELECT number, pdf_path, pdf_sha256 FROM invoices WHERE id = ? AND booking_id = ? AND status <> 'rascunho'");
        $s->execute([$id, $b['id']]);
        $inv = $s->fetch() ?: throw new ApiError(404, 'not_found');
        Audit::log('client_invoice_download', 'invoice', $id, ['booking' => $b['reference']], null, 'cliente');
        $bytes = Invoices::pdfBytes($inv);
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . str_replace('/', '-', (string) $inv['number']) . '.pdf"');
        header('Cache-Control: private, no-store');
        header('Content-Length: ' . strlen($bytes));
        echo $bytes;
        exit;
    }

    /** Link de comprovativo para uma factura FT desta reserva com saldo em dívida. */
    public static function clientProofLink(array $in): array
    {
        $b = self::clientBooking($in);
        $s = db()->prepare("SELECT i.id FROM invoices i JOIN invoice_balances ib ON ib.invoice_id = i.id WHERE i.id = ? AND i.booking_id = ? AND i.status = 'emitida' AND ib.balance > 0");
        $s->execute([(int) ($in['id'] ?? 0), $b['id']]);
        $id = $s->fetchColumn() ?: throw new ApiError(404, 'not_found');
        return ['link' => Payments::issueProofLink((int) $id)];
    }
}
