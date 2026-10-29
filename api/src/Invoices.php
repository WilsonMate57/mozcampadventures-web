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
        $stmt = db()->prepare('SELECT i.*, b.reference, b.lang, b.client_link_version, b.id AS bid, b.item_name FROM invoices i JOIN bookings b ON b.id = i.booking_id WHERE i.id = ?');
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
        $html = EmailView::invoice(['lang' => $inv['lang'], 'name' => $customer['name'] ?? '', 'label' => $label, 'number' => $inv['number'], 'ref' => $inv['reference'], 'item' => $inv['item_name'], 'amount' => $amount, 'proof' => $link, 'area' => $area]);
        $status = Mailer::send('invoice', $to, "$label {$inv['number']} — Moz Camp Adventures", $body, 'invoice', $id, (string) config('mail.team'), [['name' => str_replace('/', '-', $inv['number']) . '.pdf', 'mime' => 'application/pdf', 'path' => $inv['pdf_path']]], $inv['lang'], null, null, $html);
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

/**
 * Aspecto comum das facturas, pró-formas e recibos — segue o modelo de factura
 * da empresa: fundo cinza-claro, logótipo horizontal, título e barras laranja,
 * rodapé com morada, e-mail, site e telefone. Imagens em api/assets/doc-*.jpg
 * (geradas por scripts/document-assets.mjs).
 */
final class DocTheme
{
    public const ORANGE = [0.816, 0.518, 0.122];   // #d0841f
    public const BG = [0.949, 0.949, 0.949];       // #f2f2f2
    public const INK = [0.173, 0.173, 0.165];      // #2c2c2a
    public const SOFT = [0.40, 0.40, 0.39];
    public const RULE = [0.50, 0.50, 0.50];        // #7f7f7f
    public const WHITE = [1, 1, 1];
    public const L = 42.0;
    public const R = 553.0;

    public static function page(Pdf $p): void
    {
        $p->addPage();
        $p->rect(0, 0, Pdf::W, Pdf::H, self::BG);
    }

    public static function asset(string $file): string
    {
        return dirname(__DIR__) . "/assets/$file";
    }

    public static function amount(float $n): string
    {
        return number_format($n, 2, ',', '.');
    }

    /** Logótipo, título laranja, morada e telefone, filete a toda a largura. */
    public static function header(Pdf $p, string $title, array $c): void
    {
        $p->jpeg(self::asset('doc-logo.jpg'), 48, 16, 132);
        $p->text(self::R, 84, $title, $p->width($title, 32, 'black') > 330 ? 24 : 32, 'black', self::ORANGE, 'R');
        $x = self::R;
        foreach ([['phone', $c['phone'] ?? ''], ['pin', $c['address'] ?? '']] as [$icon, $txt]) {
            if ($txt === '') continue;
            $x -= $p->width($txt, 8.5);
            $p->text($x, 127, $txt, 8.5, false, self::INK);
            $p->jpeg(self::asset("doc-icon-$icon.jpg"), $x - 13, 119, 9);
            $x -= 13 + 20;
        }
        $p->line(0, 138, Pdf::W, 138, self::RULE, 0.8);
    }

    /** Menções legais, filete e rodapé com ícones e logótipo. */
    public static function footer(Pdf $p, array $c, string $legal): void
    {
        $p->paragraph(self::L, 742, self::R - self::L, $legal, 6.3, false, self::SOFT, 1.3);
        $p->line(0, 758, Pdf::W, 758, self::RULE, 0.8);
        $cells = [['pin', $c['address'] ?? ''], ['mail', $c['email'] ?? ''], ['globe', $c['website'] ?? ''], ['phone', $c['phone'] ?? '']];
        $x0 = 28; $w = 100;
        foreach ($cells as $i => [$icon, $txt]) {
            $cx = $x0 + $w * $i + $w / 2;
            if ($i > 0) $p->line($x0 + $w * $i, 772, $x0 + $w * $i, 816, self::RULE, 0.6);
            $p->jpeg(self::asset("doc-icon-$icon.jpg"), $cx - 5, 776, 10);
            foreach (array_slice(self::wrap($p, $txt, $w - 10, 6.4), 0, 3) as $k => $line) {
                $p->text($cx, 797 + $k * 8, $line, 6.4, false, self::INK, 'C');
            }
        }
        $p->jpeg(self::asset('doc-logo.jpg'), 468, 766, 82);
    }

    /** Quebra por palavras; uma palavra mais larga do que a linha (ex.: e-mail) é partida por caracteres. */
    public static function wrap(Pdf $p, string $s, float $max, float $size, bool $bold = false): array
    {
        $lines = [];
        $line = '';
        foreach (preg_split('/\s+/u', trim($s)) as $word) {
            $try = $line === '' ? $word : "$line $word";
            if ($p->width($try, $size, $bold) <= $max) { $line = $try; continue; }
            if ($line !== '') { $lines[] = $line; $line = ''; }
            foreach (preg_split('//u', $word, -1, PREG_SPLIT_NO_EMPTY) as $ch) {
                if ($line !== '' && $p->width($line . $ch, $size, $bold) > $max) { $lines[] = $line; $line = ''; }
                $line .= $ch;
            }
        }
        if ($line !== '') $lines[] = $line;
        return $lines;
    }

    /** Caixa de três colunas: destinatário · número e data · valor. */
    public static function infoBox(Pdf $p, string $toLabel, array $cu, array $mid, string $valueLabel, float $value): void
    {
        $y = 158; $h = 92; $c1 = 278; $c2 = 402;
        $p->rect(self::L, $y, self::R - self::L, $h, null, self::RULE, 0.9);
        $p->line($c1, $y, $c1, $y + $h, self::RULE, 0.9);
        $p->line($c2, $y, $c2, $y + $h, self::RULE, 0.9);
        $p->text(self::L + 19, $y + 20, $toLabel, 9.5, false, self::INK);
        $yy = $y + 32;
        foreach (array_slice(self::wrap($p, (string) ($cu['name'] ?? ''), $c1 - self::L - 30, 9.5, true), 0, 2) as $l) {
            $p->text(self::L + 19, $yy, $l, 9.5, true, self::INK);
            $yy += 11.5;
        }
        $extra = array_merge(self::wrap($p, (string) ($cu['address'] ?? ''), $c1 - self::L - 30, 9), !empty($cu['email']) ? self::wrap($p, (string) $cu['email'], $c1 - self::L - 30, 9) : []);
        foreach (array_slice($extra, 0, 3) as $l) {
            $p->text(self::L + 19, $yy, $l, 9, false, self::INK);
            $yy += 11;
        }
        $p->text(self::L + 19, $y + 80, 'NUIT: ' . (!empty($cu['nuit']) ? $cu['nuit'] : 'N/A'), 9, false, self::INK);
        $my = $y + 27;
        foreach ($mid as [$k, $v]) {
            $p->text($c1 + 20, $my, $k, 9.5, true, self::INK);
            $p->text($c1 + 20, $my + 12, $v, 9.5, false, self::INK);
            $my += 33;
        }
        $p->text($c2 + 20, $y + 42, $valueLabel, 10, false, self::INK);
        $txt = self::amount($value) . ' MZN';
        $size = 14.5;
        while ($size > 9 && $p->width($txt, $size, true) > self::R - $c2 - 30) $size -= 0.5;
        $p->text($c2 + 20, $y + 61, $txt, $size, true, self::INK);
    }

    /** Barra laranja de cabeçalho de tabela. $cols: [[texto, x, alinhamento]] */
    public static function tableHead(Pdf $p, float $y, array $cols): float
    {
        $p->rect(self::L, $y, self::R - self::L, 32, self::ORANGE);
        foreach ($cols as [$t, $x, $a]) $p->text($x, $y + 20.5, $t, 11.5, true, self::WHITE, $a);
        return $y + 32;
    }

    /** Linhas de totais à direita e barra laranja com o total. */
    public static function totals(Pdf $p, float $y, array $rows, string $label, float $value): float
    {
        foreach ($rows as [$k, $v]) {
            $p->text(427, $y, $k, 10.5, true, self::INK, 'R');
            $p->text(536, $y, $v, 10, false, self::INK, 'R');
            $y += 20;
        }
        $p->rect(319, $y - 6, 234, 22, self::ORANGE);
        $p->text(427, $y + 9.5, $label, 12, true, self::WHITE, 'R');
        $p->text(536, $y + 9.5, self::amount($value), 12, true, self::WHITE, 'R');
        return $y + 30;
    }
}

/** Composição do PDF da factura e da pró-forma (A4), no modelo de factura da empresa. */
final class InvoicePdf
{
    public static function render(array $d): string
    {
        $p = new Pdf();
        DocTheme::page($p);
        $c = $d['company'];
        $L = DocTheme::L; $R = DocTheme::R; $ink = DocTheme::INK;
        $pf = $d['type'] === 'PF';
        $title = $pf ? 'FACTURA PRÓ-FORMA' : 'FACTURA';
        $legal = ($c['legal_name'] ?? '') . (!empty($c['nuit']) ? ' · NUIT ' . $c['nuit'] : '') . ' · ' . $d['number'] . ' · Reserva ' . $d['booking']
            . ' · Documento processado por computador · Emitido por ' . $d['issued_by'];
        DocTheme::header($p, $title, $c);
        DocTheme::infoBox($p, $pf ? 'Pró-forma para:' : 'Factura para:', $d['customer'],
            [[$pf ? 'Pró-forma No.' : 'Factura No.', $d['number']], ['Data:', date('d/m/Y', strtotime($d['date']))]],
            $pf ? 'Valor da pró-forma.' : 'Valor da factura.', (float) $d['total']);

        // Linhas: Descrição · Preço Unit. · QTD · Total (mínimo de 4 linhas, como no modelo)
        $y = DocTheme::tableHead($p, 274, [['Descrição', $L + 19, 'L'], ['Preço Unit.', 299, 'L'], ['QTD', 437, 'C'], ['Total', 498, 'L']]);
        $rows = $d['lines'];
        for ($i = 0; $i < max(4, count($rows)); $i++) {
            $l = $rows[$i] ?? null;
            $h = 39;
            if ($l) {
                $desc = array_slice(DocTheme::wrap($p, (string) $l['description'], 205, 9.5), 0, 3);
                $h = max(39, 16 + count($desc) * 12);
                if ($y + $h > 700) {                       // muitas linhas: continua na página seguinte
                    DocTheme::footer($p, $c, $legal);
                    DocTheme::page($p);
                    DocTheme::header($p, $title, $c);
                    $y = DocTheme::tableHead($p, 160, [['Descrição', $L + 19, 'L'], ['Preço Unit.', 299, 'L'], ['QTD', 437, 'C'], ['Total', 498, 'L']]);
                }
                $ty = $y + ($h - (count($desc) - 1) * 12) / 2 + 3.5;
                foreach ($desc as $k => $line) $p->text($L + 19, $ty + $k * 12, $line, 9.5, false, $ink);
                $p->text(307, $ty, DocTheme::amount((float) $l['unit_price']), 9.5, false, $ink);
                $p->text(437, $ty, rtrim(rtrim(number_format((float) $l['qty'], 2, ',', '.'), '0'), ','), 9.5, false, $ink, 'C');
                $p->text(541, $ty, DocTheme::amount((float) $l['amount']), 9.5, false, $ink, 'R');
            }
            $y += $h;
            $p->line($L, $y, $R, $y, DocTheme::RULE, 0.8);
        }

        // Rodapé do documento: métodos de pagamento (esquerda) e totais (direita)
        $y = max($y + 38, 498);
        if ($y > 590) {
            DocTheme::footer($p, $c, $legal);
            DocTheme::page($p);
            DocTheme::header($p, $title, $c);
            $y = 170;
        }
        $ty = DocTheme::totals($p, $y, array_values(array_filter([
            ['SUB-TOTAL', DocTheme::amount((float) $d['total'])],
            ['Desconto (%)', '0%'],
            stripos((string) ($c['tax_regime'] ?? ''), 'ISPC') !== false ? ['ISPC (3%)', 'Incluso'] : null,
        ])), 'Total (MZN)', (float) $d['total']);
        if ($pf) {
            $ty += $p->paragraph(319, $ty + 8, 234, 'Este documento não é uma factura nem serve de recibo. Serve apenas para pedido de pagamento.', 8, true, $ink, 1.3);
        }
        if (!empty($d['notes'])) {
            $p->text(319, $ty + 14, 'Observações', 8.5, true, $ink);
            $p->paragraph(319, $ty + 26, 234, (string) $d['notes'], 8, false, $ink, 1.3);
        }

        $x = $L + 19;
        $p->text($x, $y, 'Métodos de Pagamentos', 11.5, true, $ink);
        $p->line($x, $y + 9, $x + 120, $y + 9, $ink, 0.8);
        $py = $y + 28;
        foreach ($d['payment']['methods'] ?? [] as $m) {
            if (!empty($m['pending']) || ($m['type'] === 'mobile' && empty($m['number']))) continue;
            $p->rect($x + 1, $py - 6.5, 4, 4, DocTheme::ORANGE);
            $p->text($x + 13, $py, upper_pt((string) $m['label']), 10, true, $ink);
            $rows = $m['type'] === 'bank' ? [['Conta:', $m['account'] ?? ''], ['NIB:', $m['nib'] ?? '']] : [['Número:', $m['number']]];
            foreach ($rows as $k => [$lab, $val]) {
                $p->text($x + 11, $py + 16 + $k * 14, $lab, 9.5, false, $ink);
                $p->text($x + 60, $py + 16 + $k * 14, $val, 9.5, false, $ink);
            }
            $py += 22 + count($rows) * 14;
        }
        $p->text($x + 11, $py + 2, $c['trade_name'] ?? 'Moz Camp Adventures', 10, true, DocTheme::ORANGE);
        if (!empty($d['payment']['note']) && $py + 14 < 728) {
            $p->paragraph($x + 11, $py + 16, 250, $d['payment']['note'], 7.5, false, DocTheme::SOFT, 1.3);
        }

        DocTheme::footer($p, $c, $legal);
        return $p->output(['title' => $title . ' ' . $d['number'], 'author' => $c['legal_name'] ?? '']);
    }
}

/** Maiúsculas sem mbstring (indisponível em alguns servidores): ASCII + acentos portugueses. */
function upper_pt(string $s): string
{
    return strtr(strtoupper($s), ['á' => 'Á', 'à' => 'À', 'â' => 'Â', 'ã' => 'Ã', 'é' => 'É', 'ê' => 'Ê', 'í' => 'Í', 'ó' => 'Ó', 'ô' => 'Ô', 'õ' => 'Õ', 'ú' => 'Ú', 'ç' => 'Ç']);
}
