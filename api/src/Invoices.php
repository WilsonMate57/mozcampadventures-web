<?php
/**
 * MOZ CAMP ADVENTURES — api/src/Invoices.php
 * Facturas (FT) e facturas pró-forma (PF) associadas a reservas.
 *   rascunho → (emitir) → emitida → (anular, com motivo) → anulada
 * Número FT-AAAA/NNNN atribuído na transacção de emissão (sem buracos),
 * PDF gerado e guardado FORA da pasta pública com hash SHA-256.
 * Facturas emitidas são imutáveis (trigger mca_invoice_guard).
 */

declare(strict_types=1);

function setting(string $key): array
{
    $stmt = db()->prepare('SELECT value FROM settings WHERE key = ?');
    $stmt->execute([$key]);
    return json_decode((string) $stmt->fetchColumn(), true) ?: [];
}

final class Invoices
{
    public const LABEL = ['FT' => 'Factura', 'PF' => 'Factura pró-forma'];

    public static function list(array $q): array
    {
        $where = ['1=1'];
        $args = [];
        if (!empty($q['status'])) { $where[] = 'i.status = ?'; $args[] = $q['status']; }
        if (!empty($q['type'])) { $where[] = 'i.doc_type = ?'; $args[] = $q['type']; }
        if (!empty($q['from'])) { $where[] = 'coalesce(i.issue_date, i.created_at::date) >= ?'; $args[] = $q['from']; }
        if (!empty($q['to'])) { $where[] = 'coalesce(i.issue_date, i.created_at::date) <= ?'; $args[] = $q['to']; }
        if (!empty($q['q'])) {
            $where[] = '(i.number ILIKE ? OR b.reference ILIKE ? OR i.customer->>\'name\' ILIKE ?)';
            $like = '%' . str_replace(['%', '_'], ['\%', '\_'], (string) $q['q']) . '%';
            array_push($args, $like, $like, $like);
        }
        if (!empty($q['pay'])) { $where[] = 'ib.pay_status = ?'; $args[] = $q['pay']; }
        $stmt = db()->prepare('SELECT i.id, i.doc_type, i.status, i.number, i.issue_date, i.total, i.customer->>\'name\' AS customer, b.reference AS booking_ref, i.created_at, ib.paid, ib.balance, ib.pay_status, ib.awaiting
            FROM invoices i JOIN bookings b ON b.id = i.booking_id LEFT JOIN invoice_balances ib ON ib.invoice_id = i.id WHERE ' . implode(' AND ', $where) . ' ORDER BY coalesce(i.issued_at, i.created_at) DESC LIMIT 200');
        $stmt->execute($args);
        return ['invoices' => $stmt->fetchAll()];
    }

    public static function get(int $id): array
    {
        $stmt = db()->prepare('SELECT i.*, b.reference AS booking_ref, b.item_name, u1.name AS issued_by_name, u2.name AS voided_by_name
            FROM invoices i JOIN bookings b ON b.id = i.booking_id LEFT JOIN users u1 ON u1.id = i.issued_by LEFT JOIN users u2 ON u2.id = i.voided_by WHERE i.id = ?');
        $stmt->execute([$id]);
        $inv = $stmt->fetch() ?: throw new ApiError(404, 'not_found');
        foreach (['customer', 'company', 'payment_info', 'lines'] as $k) {
            $inv[$k] = json_decode((string) $inv[$k], true);
        }
        unset($inv['pdf_path']);
        $ev = db()->prepare('SELECT e.type, e.data, e.created_at, u.name AS user_name FROM invoice_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.invoice_id = ? ORDER BY e.id');
        $ev->execute([$id]);
        $inv['events'] = array_map(static fn ($e) => ['data' => json_decode((string) $e['data'], true)] + $e, $ev->fetchAll());
        unset($inv['proof_token_hash']);
        if ($inv['doc_type'] === 'FT' && $inv['status'] !== 'rascunho' && Auth::has('payments.view')) {
            $inv += Payments::forInvoice($id);
        }
        return ['invoice' => $inv];
    }

    /** Novo rascunho a partir de uma reserva (linhas e cliente copiados da reserva). */
    public static function createDraft(array $in, array $user): array
    {
        $type = ($in['type'] ?? 'FT') === 'PF' ? 'PF' : 'FT';
        $stmt = db()->prepare('SELECT * FROM bookings WHERE reference = ?');
        $stmt->execute([(string) ($in['booking'] ?? '')]);
        $b = $stmt->fetch() ?: throw new ApiError(422, 'invalid_booking');
        if ($b['status'] === 'cancelada') {
            throw new ApiError(422, 'booking_cancelled');
        }
        $when = $b['service_date'] ? date('d/m/Y', strtotime($b['service_date'])) : date('d/m/Y', strtotime($b['checkin'])) . ' – ' . date('d/m/Y', strtotime($b['checkout']));
        $lines = [];
        foreach (json_decode((string) $b['price_lines'], true) ?: [] as $l) {
            if ($l['amount'] === null) {
                continue;
            }
            $lines[] = ['description' => "{$b['item_name']} ($when) — {$l['label']}", 'qty' => 1, 'unit_price' => (float) $l['amount'], 'amount' => (float) $l['amount']];
        }
        $customer = ['name' => $b['customer_name'], 'email' => $b['customer_email'], 'phone' => $b['customer_phone'], 'nuit' => '', 'address' => ''];
        $total = array_sum(array_column($lines, 'amount'));
        $ins = db()->prepare('INSERT INTO invoices (doc_type, booking_id, customer, lines, subtotal, total, created_by) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id');
        $ins->execute([$type, $b['id'], json_encode($customer, JSON_UNESCAPED_UNICODE), json_encode($lines, JSON_UNESCAPED_UNICODE), $total, max(0, $total), $user['id']]);
        $id = (int) $ins->fetchColumn();
        Audit::log('invoice_draft_created', 'invoice', $id, ['type' => $type, 'booking' => $b['reference'], 'total' => $total]);
        return self::get($id);
    }

    /** Edita um rascunho. Os valores das linhas são recalculados no servidor. */
    public static function updateDraft(int $id, array $in): array
    {
        $cur = self::lockDraft($id);
        $customer = [];
        foreach (['name' => 160, 'email' => 160, 'phone' => 40, 'nuit' => 20, 'address' => 300] as $k => $max) {
            $customer[$k] = clean_text($in['customer'][$k] ?? '', $max);
        }
        if (strlen($customer['name']) < 2) throw new ApiError(422, 'invalid_customer_name');
        if ($customer['email'] !== '' && !filter_var($customer['email'], FILTER_VALIDATE_EMAIL)) throw new ApiError(422, 'invalid_customer_email');
        if ($customer['nuit'] !== '' && !preg_match('/^\d{9}$/', $customer['nuit'])) throw new ApiError(422, 'invalid_customer_nuit');

        $lines = [];
        foreach (array_slice((array) ($in['lines'] ?? []), 0, 50) as $l) {
            $desc = clean_text($l['description'] ?? '', 240);
            $qty = round((float) ($l['qty'] ?? 0), 2);
            $unit = round((float) ($l['unit_price'] ?? 0), 2);
            if ($desc === '' || $qty <= 0 || $qty > 10000 || abs($unit) > 100000000) {
                throw new ApiError(422, 'invalid_line', '', ['line' => count($lines) + 1]);
            }
            $lines[] = ['description' => $desc, 'qty' => $qty, 'unit_price' => $unit, 'amount' => round($qty * $unit, 2)];
        }
        $total = round(array_sum(array_column($lines, 'amount')), 2);
        if ($total < 0) throw new ApiError(422, 'negative_total');
        $notes = clean_text($in['notes'] ?? '', 1000);
        db()->prepare('UPDATE invoices SET customer = ?, lines = ?, subtotal = ?, total = ?, notes = ? WHERE id = ?')
            ->execute([json_encode($customer, JSON_UNESCAPED_UNICODE), json_encode($lines, JSON_UNESCAPED_UNICODE), $total, $total, $notes ?: null, $id]);
        Audit::log('invoice_draft_updated', 'invoice', $id, ['total_before' => (float) $cur['total'], 'total_after' => $total, 'lines' => count($lines)]);
        return self::get($id);
    }

    public static function discard(int $id): array
    {
        self::lockDraft($id);
        db()->prepare("DELETE FROM invoices WHERE id = ? AND status = 'rascunho'")->execute([$id]);
        Audit::log('invoice_draft_discarded', 'invoice', $id);
        return ['ok' => true];
    }

    /** Emite: número (transacção), cópia dos dados da empresa, PDF e hash. */
    public static function issue(int $id, array $user): array
    {
        $pdo = db();
        $file = null;
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('SELECT * FROM invoices WHERE id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $inv = $stmt->fetch() ?: throw new ApiError(404, 'not_found');
            if ($inv['status'] !== 'rascunho') throw new ApiError(409, 'not_draft');
            $lines = json_decode((string) $inv['lines'], true) ?: [];
            if (!$lines || (float) $inv['total'] <= 0) throw new ApiError(422, 'empty_invoice');
            $company = setting('company');
            if ($inv['doc_type'] === 'FT' && empty($company['nuit'])) throw new ApiError(422, 'company_nuit_missing');
            $payment = setting('payment');

            $year = (int) date('Y');
            $seqStmt = $pdo->prepare('INSERT INTO counters (name, value) VALUES (?, 1) ON CONFLICT (name) DO UPDATE SET value = counters.value + 1 RETURNING value');
            $seqStmt->execute(["invoice-{$inv['doc_type']}-$year"]);
            $seq = (int) $seqStmt->fetchColumn();
            $number = sprintf('%s-%d/%04d', $inv['doc_type'], $year, $seq);

            $bk = $pdo->prepare('SELECT reference, item_name FROM bookings WHERE id = ?');
            $bk->execute([$inv['booking_id']]);
            $booking = $bk->fetch();

            $doc = ['number' => $number, 'type' => $inv['doc_type'], 'date' => date('Y-m-d'), 'booking' => $booking['reference'],
                'customer' => json_decode((string) $inv['customer'], true), 'company' => $company, 'payment' => $payment,
                'lines' => $lines, 'total' => (float) $inv['total'], 'notes' => $inv['notes'], 'issued_by' => $user['name']];
            $pdf = InvoicePdf::render($doc);

            $dir = rtrim((string) config('app.storage_dir'), '/\\') . "/invoices/$year";
            if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
                throw new RuntimeException('Não foi possível criar a pasta de facturas');
            }
            $file = "$dir/" . str_replace('/', '-', $number) . '.pdf';
            $fh = @fopen($file, 'xb');                        // nunca sobrescrever um documento emitido
            if (!$fh) throw new RuntimeException("Ficheiro já existe ou sem permissão: $file");
            fwrite($fh, $pdf);
            fclose($fh);
            @chmod($file, 0640);
            $hash = hash('sha256', $pdf);

            $pdo->prepare("UPDATE invoices SET status = 'emitida', series_year = ?, seq = ?, number = ?, issue_date = current_date, issued_at = now(), issued_by = ?, company = ?, payment_info = ?, pdf_path = ?, pdf_sha256 = ? WHERE id = ?")
                ->execute([$year, $seq, $number, $user['id'], json_encode($company, JSON_UNESCAPED_UNICODE), json_encode($payment, JSON_UNESCAPED_UNICODE), $file, $hash, $id]);
            $pdo->prepare("INSERT INTO invoice_events (invoice_id, type, data, user_id) VALUES (?, 'issued', ?, ?)")
                ->execute([$id, json_encode(['number' => $number, 'total' => (float) $inv['total'], 'sha256' => $hash]), $user['id']]);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            if ($file !== null && is_file($file)) {
                @unlink($file);                               // sem commit, o número não foi atribuído: o PDF não pode ficar
            }
            throw $e;
        }
        Audit::log('invoice_issued', 'invoice', $id, ['number' => $number, 'total' => (float) $inv['total'], 'booking' => $booking['reference']]);
        return self::get($id);
    }

    public static function void(int $id, array $in, array $user): array
    {
        $reason = clean_text($in['reason'] ?? '', 500);
        if (strlen($reason) < 5) throw new ApiError(422, 'void_reason_required');
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('SELECT status, number FROM invoices WHERE id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $inv = $stmt->fetch() ?: throw new ApiError(404, 'not_found');
            if ($inv['status'] !== 'emitida') throw new ApiError(409, 'not_issued');
            $bal = Payments::balance($id);
            if ($bal && (abs($bal['paid']) > 0.001 || $bal['awaiting'] > 0)) {
                throw new ApiError(422, 'invoice_has_payments', '', ['paid' => $bal['paid'], 'awaiting' => $bal['awaiting']]);   // reverter/reembolsar/decidir primeiro
            }
            $pdo->prepare("UPDATE invoices SET status = 'anulada', void_reason = ?, voided_at = now(), voided_by = ? WHERE id = ?")->execute([$reason, $user['id'], $id]);
            $pdo->prepare("INSERT INTO invoice_events (invoice_id, type, data, user_id) VALUES (?, 'voided', ?, ?)")->execute([$id, json_encode(['reason' => $reason], JSON_UNESCAPED_UNICODE), $user['id']]);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        Audit::log('invoice_voided', 'invoice', $id, ['number' => $inv['number'], 'reason' => $reason]);
        $email = ($in['notify'] ?? true) ? Notify::invoiceVoided($id, $reason) : 'skipped';
        return self::get($id) + ['email' => $email];
    }

    /** Envia o PDF ao e-mail do cliente; o resultado real fica registado. */
    public static function send(int $id, array $user): array
    {
        $stmt = db()->prepare('SELECT i.*, b.reference, b.lang, b.client_link_version, b.id AS bid FROM invoices i JOIN bookings b ON b.id = i.booking_id WHERE i.id = ?');
        $stmt->execute([$id]);
        $inv = $stmt->fetch() ?: throw new ApiError(404, 'not_found');
        if ($inv['status'] !== 'emitida') throw new ApiError(409, 'not_issued');
        $customer = json_decode((string) $inv['customer'], true);
        $to = $customer['email'] ?? '';
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) throw new ApiError(422, 'customer_email_missing');
        self::pdfBytes($inv);                                  // verifica a integridade antes de enviar
        $en = $inv['lang'] === 'en';
        $label = $en ? ($inv['doc_type'] === 'PF' ? 'Pro-forma invoice' : 'Invoice') : self::LABEL[$inv['doc_type']];
        $link = $inv['doc_type'] === 'FT' ? Payments::issueProofLink($id) : null;
        $area = Notify::clientLink(['id' => $inv['bid'], 'reference' => $inv['reference'], 'lang' => $inv['lang'], 'client_link_version' => $inv['client_link_version']]);
        $amount = self::money((float) $inv['total']);
        $body = $en
            ? "Hello {$customer['name']},\n\nPlease find attached $label {$inv['number']} for booking {$inv['reference']}, amount $amount.\n\nPayment instructions are in the document. Please quote the invoice number when paying."
              . ($link ? "\n\nAfter paying, you can send the proof of payment through this private link (valid 60 days):\n$link" : '')
              . "\n\nBooking status and documents: $area\n\nThank you,\nMoz Camp Adventures\nWhatsApp +258 84 440 6543"
            : "Olá {$customer['name']},\n\nEnviamos em anexo a $label {$inv['number']} referente ao pedido {$inv['reference']}, no valor de $amount.\n\nAs instruções de pagamento constam do documento. Indique o número da factura no pagamento."
              . ($link ? "\n\nDepois de pagar, pode enviar o comprovativo por este link privado (válido 60 dias):\n$link" : '')
              . "\n\nEstado da reserva e documentos: $area\n\nObrigado,\nMoz Camp Adventures\nWhatsApp +258 84 440 6543";
        $status = Mailer::send('invoice', $to, "$label {$inv['number']} — Moz Camp Adventures", $body, 'invoice', $id, (string) config('mail.team'), [['name' => str_replace('/', '-', $inv['number']) . '.pdf', 'mime' => 'application/pdf', 'path' => $inv['pdf_path']]], $inv['lang']);
        db()->prepare("INSERT INTO invoice_events (invoice_id, type, data, user_id) VALUES (?, 'sent', ?, ?)")->execute([$id, json_encode(['to' => $to, 'status' => $status]), $user['id']]);
        Audit::log('invoice_sent', 'invoice', $id, ['to' => $to, 'status' => $status]);
        return ['status' => $status, 'to' => $to, 'proof_link' => $link];
    }

    /** Bytes do PDF guardado, com verificação de integridade. */
    public static function pdfBytes(array $inv): string
    {
        if (empty($inv['pdf_path']) || !is_file($inv['pdf_path'])) throw new ApiError(404, 'pdf_missing');
        $bytes = (string) file_get_contents($inv['pdf_path']);
        if (!hash_equals((string) $inv['pdf_sha256'], hash('sha256', $bytes))) {
            error_log("[MCA] PDF alterado no disco: {$inv['pdf_path']}");
            throw new ApiError(500, 'pdf_integrity_error');
        }
        return $bytes;
    }

    public static function streamPdf(int $id): never
    {
        $stmt = db()->prepare('SELECT number, pdf_path, pdf_sha256 FROM invoices WHERE id = ?');
        $stmt->execute([$id]);
        $inv = $stmt->fetch() ?: throw new ApiError(404, 'not_found');
        $bytes = self::pdfBytes($inv);
        Audit::log('invoice_pdf_viewed', 'invoice', $id, ['number' => $inv['number']]);
        header('Content-Type: application/pdf');
        header('Content-Disposition: inline; filename="' . str_replace('/', '-', (string) $inv['number']) . '.pdf"');
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');
        header('Content-Length: ' . strlen($bytes));
        echo $bytes;
        exit;
    }

    private static function lockDraft(int $id): array
    {
        $stmt = db()->prepare('SELECT * FROM invoices WHERE id = ?');
        $stmt->execute([$id]);
        $inv = $stmt->fetch() ?: throw new ApiError(404, 'not_found');
        if ($inv['status'] !== 'rascunho') throw new ApiError(409, 'not_draft');
        return $inv;
    }

    public static function money(float $n): string
    {
        return number_format($n, 2, ',', '.') . ' MZN';
    }
}

/** Composição do PDF da factura (A4). */
final class InvoicePdf
{
    private const INK = [0.11, 0.14, 0.14];
    private const SOFT = [0.37, 0.39, 0.40];
    private const TEAL = [0.0, 0.50, 0.49];
    private const LINE = [0.85, 0.88, 0.88];

    public static function render(array $d): string
    {
        $p = new Pdf();
        $p->addPage();
        $L = 48; $R = Pdf::W - 48; $c = $d['company'];
        $p->rect(0, 0, Pdf::W, 6, self::TEAL);

        // Cabeçalho: logótipo + empresa
        $p->jpeg(dirname(__DIR__) . '/assets/logo-invoice.jpg', $L, 34, 64);
        $y = 44;
        $p->text($R, $y, $c['legal_name'] ?? '', 12, true, self::INK, 'R');
        foreach (array_filter([
            ($c['trade_name'] ?? '') !== ($c['legal_name'] ?? '') ? $c['trade_name'] : null,
            !empty($c['nuit']) ? 'NUIT ' . $c['nuit'] : null,
            $c['address'] ?? null, $c['phone'] ?? null, trim(($c['email'] ?? '') . '  ·  ' . ($c['website'] ?? ''), ' ·'),
        ]) as $l) {
            $y += 13;
            $p->text($R, $y, $l, 8.5, false, self::SOFT, 'R');
        }

        // Título e dados do documento
        $y = 140;
        $title = $d['type'] === 'PF' ? 'FACTURA PRÓ-FORMA' : 'FACTURA';
        $p->text($L, $y, $title, 20, true, self::INK);
        $p->text($L, $y + 20, $d['number'], 12, true, self::TEAL);
        $meta = [['Data de emissão', date('d/m/Y', strtotime($d['date']))], ['Referência da reserva', $d['booking']], ['Moeda', 'Metical (MZN)']];
        $my = $y - 6;
        foreach ($meta as [$k, $v]) {
            $p->text($R - 215, $my, $k, 8, false, self::SOFT);
            $p->text($R, $my, $v, 9, true, self::INK, 'R');
            $my += 15;
        }

        // Cliente
        $y = 200;
        $cu = $d['customer'];
        $info = array_values(array_filter([!empty($cu['nuit']) ? 'NUIT ' . $cu['nuit'] : null, $cu['address'] ?? null, trim(($cu['email'] ?? '') . '   ' . ($cu['phone'] ?? ''))]));
        $boxH = 52 + count($info) * 12;
        $p->rect($L, $y, $R - $L, $boxH, [0.965, 0.973, 0.969]);
        $p->text($L + 14, $y + 18, 'CLIENTE', 7.5, true, self::TEAL);
        $p->text($L + 14, $y + 34, $cu['name'] ?? '', 11, true, self::INK);
        foreach ($info as $i => $l) {
            $p->text($L + 14, $y + 49 + $i * 12, $l, 8.5, false, self::SOFT);
        }

        // Tabela de linhas
        $y += $boxH + 22;
        $cols = ['desc' => $L + 10, 'qty' => $R - 190, 'unit' => $R - 95, 'amt' => $R - 10];
        $p->rect($L, $y, $R - $L, 22, self::INK);
        $p->text($cols['desc'], $y + 14.5, 'Descrição', 8.5, true, [1, 1, 1]);
        $p->text($cols['qty'], $y + 14.5, 'Qtd.', 8.5, true, [1, 1, 1], 'R');
        $p->text($cols['unit'], $y + 14.5, 'Preço unitário', 8.5, true, [1, 1, 1], 'R');
        $p->text($cols['amt'], $y + 14.5, 'Valor', 8.5, true, [1, 1, 1], 'R');
        $y += 22;
        foreach ($d['lines'] as $l) {
            $h = $p->paragraph($cols['desc'], $y + 15, $cols['qty'] - $cols['desc'] - 40, $l['description'], 9, false, self::INK, 1.3);
            $p->text($cols['qty'], $y + 15, rtrim(rtrim(number_format((float) $l['qty'], 2, ',', '.'), '0'), ','), 9, false, self::INK, 'R');
            $p->text($cols['unit'], $y + 15, number_format((float) $l['unit_price'], 2, ',', '.'), 9, false, self::INK, 'R');
            $p->text($cols['amt'], $y + 15, number_format((float) $l['amount'], 2, ',', '.'), 9, false, self::INK, 'R');
            $y += max(24, $h + 12);
            $p->line($L, $y, $R, $y, self::LINE);
        }

        // Totais
        $y += 16;
        $p->text($R - 230, $y, 'Subtotal', 9, false, self::SOFT);
        $p->text($R - 10, $y, Invoices::money($d['total']), 9, false, self::INK, 'R');
        $y += 10;
        $p->rect($R - 240, $y, 240, 30, [0.91, 0.98, 0.98]);
        $p->text($R - 230, $y + 19, $d['type'] === 'PF' ? 'Total' : 'Total a pagar', 10, true, self::INK);
        $p->text($R - 10, $y + 19, Invoices::money($d['total']), 12, true, self::INK, 'R');
        $y += 44;
        if (!empty($c['tax_note'])) {
            $p->text($R, $y, $c['tax_note'], 8, false, self::SOFT, 'R');
            $y += 12;
        }

        // Instruções de pagamento
        $y = max($y + 16, 560);
        $p->text($L, $y, 'INSTRUÇÕES DE PAGAMENTO', 7.5, true, self::TEAL);
        $y += 16;
        foreach ($d['payment']['methods'] ?? [] as $m) {
            if (!empty($m['pending']) || ($m['type'] === 'mobile' && empty($m['number']))) {
                continue;
            }
            $detail = $m['type'] === 'bank' ? "Conta {$m['account']}   ·   NIB {$m['nib']}" : $m['number'];
            $p->text($L, $y, $m['label'], 9, true, self::INK);
            $p->text($L + 110, $y, $detail, 9, false, self::INK);
            $y += 15;
        }
        if (!empty($d['payment']['note'])) {
            $y += $p->paragraph($L, $y + 4, $R - $L, $d['payment']['note'], 8.5, false, self::SOFT);
        }
        if (!empty($d['notes'])) {
            $y += 12;
            $p->text($L, $y, 'OBSERVAÇÕES', 7.5, true, self::TEAL);
            $y += $p->paragraph($L, $y + 14, $R - $L, $d['notes'], 9, false, self::INK) + 8;
        }
        if ($d['type'] === 'PF') {
            $y += 10;
            $p->text($L, $y, 'Este documento não é uma factura nem serve de recibo. Serve apenas para pedido de pagamento.', 8.5, true, self::INK);
        }

        // Rodapé
        $p->line($L, Pdf::H - 58, $R, Pdf::H - 58, self::LINE);
        $p->text($L, Pdf::H - 42, ($c['legal_name'] ?? '') . (!empty($c['nuit']) ? ' · NUIT ' . $c['nuit'] : '') . ' · ' . $d['number'], 7.5, false, self::SOFT);
        $p->text($R, Pdf::H - 42, 'Documento processado por computador · Emitido por ' . $d['issued_by'], 7.5, false, self::SOFT, 'R');

        return $p->output(['title' => $title . ' ' . $d['number'], 'author' => $c['legal_name'] ?? '']);
    }
}
