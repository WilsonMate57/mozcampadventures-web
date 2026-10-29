<?php
/**
 * MOZ CAMP ADVENTURES — api/src/Payments.php
 * Pagamentos, reembolsos, comprovativos e recibos.
 *   declarado/em_verificacao → confirmado (gera recibo RC) | recusado
 *   confirmado → revertido (anula o recibo)
 * Só pagamentos CONFIRMADOS contam. O estado financeiro vem da vista
 * invoice_balances (calculado, nunca escrito à mão).
 */

declare(strict_types=1);

final class Payments
{
    private const MAX_PROOF = 5 * 1024 * 1024;

    /** Métodos aceites = etiquetas das Definições (Nedbank, Millennium bim, M-Pesa, e-Mola). */
    public static function methods(): array
    {
        return array_values(array_filter(array_map(static fn ($m) => $m['label'] ?? '', setting('payment')['methods'] ?? [])));
    }

    public static function balance(int $invoiceId): ?array
    {
        $s = db()->prepare('SELECT total, received, refunded, paid, balance, awaiting, pay_status FROM invoice_balances WHERE invoice_id = ?');
        $s->execute([$invoiceId]);
        $b = $s->fetch();
        if (!$b) {
            return null;
        }
        foreach (['total', 'received', 'refunded', 'paid', 'balance'] as $k) {
            $b[$k] = (float) $b[$k];
        }
        $b['awaiting'] = (int) $b['awaiting'];
        return $b;
    }

    public static function forInvoice(int $invoiceId): array
    {
        $s = db()->prepare('SELECT p.id, p.kind, p.method, p.amount, p.paid_on, p.reference, p.status, p.source, p.notes, (p.proof_path IS NOT NULL) AS has_proof, p.created_at, p.decided_at, p.decision_note, p.reversed_at, p.reverse_reason,
              r.id AS receipt_id, r.number AS receipt_number, r.status AS receipt_status, u1.name AS created_by_name, u2.name AS decided_by_name, u3.name AS reversed_by_name
            FROM payments p LEFT JOIN receipts r ON r.id = p.receipt_id LEFT JOIN users u1 ON u1.id = p.created_by LEFT JOIN users u2 ON u2.id = p.decided_by LEFT JOIN users u3 ON u3.id = p.reversed_by
            WHERE p.invoice_id = ? ORDER BY p.id');
        $s->execute([$invoiceId]);
        return ['payments' => $s->fetchAll(), 'balance' => self::balance($invoiceId), 'methods' => self::methods()];
    }

    public static function list(array $q): array
    {
        $where = ['1=1'];
        $args = [];
        if (!empty($q['status'])) {
            $where[] = $q['status'] === 'pendentes' ? "p.status IN ('declarado', 'em_verificacao')" : 'p.status = ?';
            if ($q['status'] !== 'pendentes') $args[] = $q['status'];
        }
        $s = db()->prepare('SELECT p.id, p.kind, p.method, p.amount, p.paid_on, p.reference, p.status, p.source, p.created_at, i.id AS invoice_id, i.number AS invoice_number, i.customer->>\'name\' AS customer, r.number AS receipt_number
            FROM payments p JOIN invoices i ON i.id = p.invoice_id LEFT JOIN receipts r ON r.id = p.receipt_id WHERE ' . implode(' AND ', $where) . ' ORDER BY p.created_at DESC LIMIT 300');
        $s->execute($args);
        return ['payments' => $s->fetchAll()];
    }

    /** Registo no painel. Com confirm=true (e permissão) fica logo confirmado e gera recibo. */
    public static function record(int $invoiceId, array $in, array $user): array
    {
        $inv = self::issuedInvoice($invoiceId);
        $data = self::validate($in, $inv);
        $confirm = !empty($in['confirm']);
        if ($confirm) {
            if (!Auth::has('payments.confirm')) throw new ApiError(403, 'forbidden', '', ['permission' => 'payments.confirm']);
            $bal = self::balance($invoiceId);
            if ($data['amount'] > $bal['balance'] + 0.001) throw new ApiError(422, 'exceeds_balance', '', ['balance' => $bal['balance']]);  // não grava nada
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $ins = $pdo->prepare("INSERT INTO payments (invoice_id, method, amount, paid_on, reference, status, notes, created_by) VALUES (?, ?, ?, ?, ?, 'em_verificacao', ?, ?) RETURNING id");
            $ins->execute([$invoiceId, $data['method'], $data['amount'], $data['paid_on'], $data['reference'], $data['notes'], $user['id']]);
            $id = (int) $ins->fetchColumn();
            self::event($id, 'registered', ['amount' => $data['amount'], 'method' => $data['method'], 'reference' => $data['reference']], $user);
            $pdo->commit();
        } catch (PDOException $e) {
            $pdo->rollBack();
            if ($e->getCode() === '23505') throw new ApiError(409, 'duplicate_payment');
            throw $e;
        }
        Audit::log('payment_registered', 'payment', $id, ['invoice' => $inv['number'], 'amount' => $data['amount'], 'method' => $data['method']]);
        if ($confirm) {
            try {
                return self::confirm($id, ['note' => 'Confirmado no registo', 'notify' => $in['notify'] ?? true], $user);
            } catch (ApiError $e) {
                // Corrida rara (outro pagamento confirmado entretanto): o registo não fica pendurado
                self::refuse($id, ['note' => 'Confirmação automática falhou: ' . $e->errorCode], $user);
                throw $e;
            }
        }
        return self::forInvoice($invoiceId);
    }

    /** Confirma a entrada dos fundos: bloqueia a factura, valida o saldo e emite o recibo. */
    public static function confirm(int $paymentId, array $in, array $user): array
    {
        $pdo = db();
        $file = null;
        $pdo->beginTransaction();
        try {
            $p = self::lockPayment($paymentId);
            if (!in_array($p['status'], ['declarado', 'em_verificacao'], true)) throw new ApiError(409, 'payment_not_pending');
            $inv = $pdo->prepare('SELECT * FROM invoices WHERE id = ? FOR UPDATE');      // serializa confirmações da mesma factura
            $inv->execute([$p['invoice_id']]);
            $invoice = $inv->fetch();
            if ($invoice['status'] !== 'emitida') throw new ApiError(409, 'invoice_not_payable');
            $bal = self::balance((int) $p['invoice_id']);
            if ((float) $p['amount'] > $bal['balance'] + 0.001) {
                throw new ApiError(422, 'exceeds_balance', '', ['balance' => $bal['balance']]);
            }
            $year = (int) date('Y');
            $seq = $pdo->prepare('INSERT INTO counters (name, value) VALUES (?, 1) ON CONFLICT (name) DO UPDATE SET value = counters.value + 1 RETURNING value');
            $seq->execute(["receipt-$year"]);
            $n = (int) $seq->fetchColumn();
            $number = sprintf('RC-%d/%04d', $year, $n);
            $after = $bal['balance'] - (float) $p['amount'];
            $pdf = ReceiptPdf::render([
                'number' => $number, 'date' => date('Y-m-d'), 'company' => json_decode((string) $invoice['company'], true),
                'customer' => json_decode((string) $invoice['customer'], true), 'invoice' => $invoice['number'], 'invoice_total' => (float) $invoice['total'],
                'amount' => (float) $p['amount'], 'method' => $p['method'], 'reference' => $p['reference'], 'paid_on' => $p['paid_on'],
                'balance_after' => $after, 'issued_by' => $user['name'],
            ]);
            $file = self::store('receipts/' . $year, str_replace('/', '-', $number) . '.pdf', $pdf);
            $r = $pdo->prepare('INSERT INTO receipts (number, series_year, seq, invoice_id, amount, issued_by, pdf_path, pdf_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id');
            $r->execute([$number, $year, $n, $p['invoice_id'], $p['amount'], $user['id'], $file, hash('sha256', $pdf)]);
            $receiptId = (int) $r->fetchColumn();
            $pdo->prepare("UPDATE payments SET status = 'confirmado', decided_by = ?, decided_at = now(), decision_note = ?, receipt_id = ? WHERE id = ?")
                ->execute([$user['id'], clean_text($in['note'] ?? '', 500) ?: null, $receiptId, $paymentId]);
            self::event($paymentId, 'confirmed', ['receipt' => $number, 'balance_after' => $after], $user);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            if ($file !== null && is_file($file)) @unlink($file);
            throw $e;
        }
        Audit::log('payment_confirmed', 'payment', $paymentId, ['invoice' => $invoice['number'], 'amount' => (float) $p['amount'], 'receipt' => $number, 'balance_after' => $after]);
        $email = ($in['notify'] ?? true) ? Notify::payment('payment_confirmed', $paymentId) : 'skipped';
        return self::forInvoice((int) $p['invoice_id']) + ['email' => $email];
    }

    public static function refuse(int $paymentId, array $in, array $user): array
    {
        $note = clean_text($in['note'] ?? '', 500);
        if (strlen($note) < 3) throw new ApiError(422, 'reason_required');
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $p = self::lockPayment($paymentId);
            if (!in_array($p['status'], ['declarado', 'em_verificacao'], true)) throw new ApiError(409, 'payment_not_pending');
            $pdo->prepare("UPDATE payments SET status = 'recusado', decided_by = ?, decided_at = now(), decision_note = ? WHERE id = ?")->execute([$user['id'], $note, $paymentId]);
            self::event($paymentId, 'refused', ['note' => $note], $user);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        Audit::log('payment_refused', 'payment', $paymentId, ['note' => $note]);
        /* Só se avisa o cliente quando foi ele a enviar o comprovativo */
        $email = ($in['notify'] ?? true) && $p['source'] === 'cliente' ? Notify::payment('payment_refused', $paymentId, $note) : 'skipped';
        return self::forInvoice((int) $p['invoice_id']) + ['email' => $email];
    }

    /** Reverte um pagamento confirmado (ex.: devolução bancária). Anula o recibo; histórico preservado. */
    public static function reverse(int $paymentId, array $in, array $user): array
    {
        $reason = clean_text($in['reason'] ?? '', 500);
        if (strlen($reason) < 5) throw new ApiError(422, 'reason_required');
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $p = self::lockPayment($paymentId);
            if ($p['status'] !== 'confirmado' || $p['kind'] !== 'payment') throw new ApiError(409, 'payment_not_confirmed');
            $pdo->prepare('SELECT id FROM invoices WHERE id = ? FOR UPDATE')->execute([$p['invoice_id']]);
            $bal = self::balance((int) $p['invoice_id']);
            if ($bal['paid'] - (float) $p['amount'] < -0.001) throw new ApiError(422, 'refunds_exceed_payments');
            $pdo->prepare("UPDATE payments SET status = 'revertido', reversed_by = ?, reversed_at = now(), reverse_reason = ? WHERE id = ?")->execute([$user['id'], $reason, $paymentId]);
            if ($p['receipt_id']) {
                $pdo->prepare("UPDATE receipts SET status = 'anulado', void_reason = ?, voided_at = now(), voided_by = ? WHERE id = ?")->execute(['Pagamento revertido: ' . $reason, $user['id'], $p['receipt_id']]);
            }
            self::event($paymentId, 'reversed', ['reason' => $reason], $user);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        Audit::log('payment_reversed', 'payment', $paymentId, ['amount' => (float) $p['amount'], 'reason' => $reason]);
        $email = ($in['notify'] ?? true) ? Notify::payment('payment_reversed', $paymentId, $reason) : 'skipped';
        return self::forInvoice((int) $p['invoice_id']) + ['email' => $email];
    }

    /** Reembolso ao cliente (saída de dinheiro), limitado ao valor efectivamente pago. */
    public static function refund(int $invoiceId, array $in, array $user): array
    {
        $inv = self::issuedInvoice($invoiceId);
        $data = self::validate($in, $inv);
        if (strlen((string) $data['notes']) < 5) throw new ApiError(422, 'reason_required');
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('SELECT id FROM invoices WHERE id = ? FOR UPDATE')->execute([$invoiceId]);
            $bal = self::balance($invoiceId);
            if ($data['amount'] > $bal['paid'] + 0.001) throw new ApiError(422, 'refund_exceeds_paid', '', ['paid' => $bal['paid']]);
            $ins = $pdo->prepare("INSERT INTO payments (invoice_id, kind, method, amount, paid_on, reference, status, notes, created_by, decided_by, decided_at) VALUES (?, 'refund', ?, ?, ?, ?, 'confirmado', ?, ?, ?, now()) RETURNING id");
            $ins->execute([$invoiceId, $data['method'], $data['amount'], $data['paid_on'], $data['reference'], $data['notes'], $user['id'], $user['id']]);
            $id = (int) $ins->fetchColumn();
            self::event($id, 'refunded', ['amount' => $data['amount'], 'reason' => $data['notes']], $user);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        Audit::log('refund_recorded', 'payment', $id, ['invoice' => $inv['number'], 'amount' => $data['amount']]);
        $email = ($in['notify'] ?? true) ? Notify::payment('refund', $id, (string) $data['notes']) : 'skipped';
        return self::forInvoice($invoiceId) + ['email' => $email];
    }

    /* ── Comprovativo enviado pelo cliente (link privado da factura) ── */

    public static function issueProofLink(int $invoiceId): string
    {
        $token = bin2hex(random_bytes(24));
        db()->prepare("UPDATE invoices SET proof_token_hash = ?, proof_token_expires = now() + interval '60 days' WHERE id = ? AND status = 'emitida'")->execute([hash('sha256', $token), $invoiceId]);
        return rtrim((string) config('app.site_url'), '/') . '/pagamento/#t=' . $token;     // fragmento: o token não vai para logs nem Referer
    }

    private static function invoiceByToken(string $token): array
    {
        if (!preg_match('/^[a-f0-9]{48}$/', $token)) throw new ApiError(404, 'invalid_link');
        $s = db()->prepare("SELECT * FROM invoices WHERE proof_token_hash = ? AND proof_token_expires > now() AND status = 'emitida' AND doc_type = 'FT'");
        $s->execute([hash('sha256', $token)]);
        return $s->fetch() ?: throw new ApiError(404, 'invalid_link');
    }

    /** Dados mínimos para a página do cliente (sem dados pessoais além do primeiro nome). */
    public static function proofInfo(array $in): array
    {
        require_allowed_origin();
        rate_limit('proof-info', 30, 3600);
        $inv = self::invoiceByToken((string) ($in['token'] ?? ''));
        $bal = self::balance((int) $inv['id']);
        $customer = json_decode((string) $inv['customer'], true);
        $payment = json_decode((string) $inv['payment_info'], true);
        return ['invoice' => $inv['number'], 'name' => strtok((string) ($customer['name'] ?? ''), ' '), 'total' => $bal['total'], 'paid' => $bal['paid'], 'balance' => $bal['balance'], 'pay_status' => $bal['pay_status'],
            'methods' => array_values(array_map(static fn ($m) => ['label' => $m['label'], 'type' => $m['type'], 'detail' => $m['type'] === 'bank' ? "Conta {$m['account']} · NIB {$m['nib']}" : ($m['number'] ?? '')], array_filter($payment['methods'] ?? [], static fn ($m) => empty($m['pending']))))];
    }

    /** Upload multipart: cria um pagamento «declarado» que só conta depois de confirmado pela equipa. */
    public static function submitProof(): array
    {
        require_allowed_origin();
        rate_limit('proof', 5, 3600);
        if (!empty($_POST['mca_hp']) || !empty($_POST['website'])) throw new ApiError(400, 'rejected');
        $inv = self::invoiceByToken((string) ($_POST['token'] ?? ''));
        $data = self::validate($_POST, $inv);
        $f = $_FILES['proof'] ?? null;
        if ($f && in_array($f['error'] ?? 0, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) throw new ApiError(413, 'proof_too_large');
        if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK) throw new ApiError(422, 'proof_missing');
        if ($f['size'] > self::MAX_PROOF) throw new ApiError(413, 'proof_too_large');
        $bytes = (string) file_get_contents($f['tmp_name']);
        $mime = self::sniff($bytes) ?? throw new ApiError(415, 'proof_invalid_type');    // tipo real pelo conteúdo, não pela extensão
        $ext = ['application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png'][$mime];
        $path = self::store('proofs/' . date('Y'), bin2hex(random_bytes(16)) . ".$ext", $bytes);
        try {
            $ins = db()->prepare("INSERT INTO payments (invoice_id, method, amount, paid_on, reference, status, source, notes, proof_path, proof_sha256, proof_mime) VALUES (?, ?, ?, ?, ?, 'declarado', 'cliente', ?, ?, ?, ?) RETURNING id");
            $ins->execute([$inv['id'], $data['method'], $data['amount'], $data['paid_on'], $data['reference'], $data['notes'], $path, hash('sha256', $bytes), $mime]);
        } catch (PDOException $e) {
            @unlink($path);
            if ($e->getCode() === '23505') throw new ApiError(409, 'duplicate_payment');
            throw $e;
        }
        $id = (int) $ins->fetchColumn();
        self::event($id, 'declared', ['amount' => $data['amount'], 'method' => $data['method']], null, 'cliente');
        Mailer::send('proof_team', Mailer::team(), "Comprovativo recebido — {$inv['number']}", "O cliente enviou um comprovativo de pagamento para a factura {$inv['number']}.\nValor declarado: " . Invoices::money($data['amount']) . "\nMétodo: {$data['method']}\nReferência: " . ($data['reference'] ?: '—') . "\n\nVerifique a entrada dos fundos antes de confirmar no painel.", 'payment', $id);
        return ['ok' => true, 'status' => 'declarado'];
    }

    public static function streamProof(int $paymentId): never
    {
        $s = db()->prepare('SELECT proof_path, proof_sha256, proof_mime FROM payments WHERE id = ?');
        $s->execute([$paymentId]);
        $p = $s->fetch();
        if (!$p || !$p['proof_path'] || !is_file($p['proof_path'])) throw new ApiError(404, 'not_found');
        $bytes = (string) file_get_contents($p['proof_path']);
        if (!hash_equals((string) $p['proof_sha256'], hash('sha256', $bytes))) throw new ApiError(500, 'proof_integrity_error');
        Audit::log('payment_proof_viewed', 'payment', $paymentId);
        self::stream($bytes, (string) $p['proof_mime'], 'comprovativo-' . $paymentId);
    }

    public static function streamReceipt(int $receiptId): never
    {
        $s = db()->prepare('SELECT number, pdf_path, pdf_sha256 FROM receipts WHERE id = ?');
        $s->execute([$receiptId]);
        $r = $s->fetch() ?: throw new ApiError(404, 'not_found');
        $bytes = is_file($r['pdf_path']) ? (string) file_get_contents($r['pdf_path']) : '';
        if (!hash_equals((string) $r['pdf_sha256'], hash('sha256', $bytes))) throw new ApiError(500, 'pdf_integrity_error');
        self::stream($bytes, 'application/pdf', str_replace('/', '-', (string) $r['number']) . '.pdf');
    }

    /* ── Internos ─────────────────────────────────────── */

    private static function validate(array $in, array $inv): array
    {
        $method = clean_text($in['method'] ?? '', 60);
        if (!in_array($method, self::methods(), true)) throw new ApiError(422, 'invalid_method');
        $amount = round((float) str_replace(',', '.', (string) ($in['amount'] ?? 0)), 2);
        if ($amount <= 0 || $amount > 100000000) throw new ApiError(422, 'invalid_amount');
        $paidOn = (string) ($in['paid_on'] ?? '');
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', $paidOn);
        if (!$d || $d->format('Y-m-d') !== $paidOn || $d > new DateTimeImmutable('today') || $d < new DateTimeImmutable('-2 years')) throw new ApiError(422, 'invalid_paid_on');
        return ['method' => $method, 'amount' => $amount, 'paid_on' => $paidOn, 'reference' => clean_text($in['reference'] ?? '', 80) ?: null, 'notes' => clean_text($in['notes'] ?? '', 500) ?: null];
    }

    private static function issuedInvoice(int $id): array
    {
        $s = db()->prepare('SELECT * FROM invoices WHERE id = ?');
        $s->execute([$id]);
        $inv = $s->fetch() ?: throw new ApiError(404, 'not_found');
        if ($inv['doc_type'] !== 'FT') throw new ApiError(422, 'payments_only_on_ft');
        if ($inv['status'] !== 'emitida') throw new ApiError(409, 'invoice_not_payable');
        return $inv;
    }

    private static function lockPayment(int $id): array
    {
        $s = db()->prepare('SELECT * FROM payments WHERE id = ? FOR UPDATE');
        $s->execute([$id]);
        return $s->fetch() ?: throw new ApiError(404, 'not_found');
    }

    private static function event(int $paymentId, string $type, array $data, ?array $user, ?string $actor = null): void
    {
        db()->prepare('INSERT INTO payment_events (payment_id, type, data, user_id, actor) VALUES (?, ?, ?, ?, ?)')
            ->execute([$paymentId, $type, json_encode($data, JSON_UNESCAPED_UNICODE), $user['id'] ?? null, $actor ?? ($user['name'] ?? null)]);
    }

    private static function store(string $sub, string $name, string $bytes): string
    {
        $dir = rtrim((string) config('app.storage_dir'), '/\\') . '/' . $sub;
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) throw new RuntimeException("Não foi possível criar $dir");
        $path = "$dir/$name";
        $fh = @fopen($path, 'xb') ?: throw new RuntimeException("Ficheiro já existe ou sem permissão: $path");
        fwrite($fh, $bytes);
        fclose($fh);
        @chmod($path, 0640);
        return $path;
    }

    /** Tipo real pelo conteúdo (assinatura do ficheiro). */
    private static function sniff(string $b): ?string
    {
        return match (true) {
            str_starts_with($b, '%PDF-') => 'application/pdf',
            str_starts_with($b, "\xFF\xD8\xFF") => 'image/jpeg',
            str_starts_with($b, "\x89PNG\r\n\x1A\n") => 'image/png',
            default => null,
        };
    }

    private static function stream(string $bytes, string $mime, string $name): never
    {
        header('Content-Type: ' . $mime);
        header('Content-Disposition: inline; filename="' . $name . '"');
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');
        header('Content-Length: ' . strlen($bytes));
        echo $bytes;
        exit;
    }
}

/** Recibo (A4), no mesmo modelo das facturas (DocTheme). */
final class ReceiptPdf
{
    public static function render(array $d): string
    {
        $p = new Pdf();
        DocTheme::page($p);
        $c = $d['company'] ?? [];
        $L = DocTheme::L; $R = DocTheme::R; $ink = DocTheme::INK;
        DocTheme::header($p, 'RECIBO', $c);
        DocTheme::infoBox($p, 'Recebido de:', $d['customer'] ?? [], [['Recibo No.', $d['number']], ['Data:', date('d/m/Y', strtotime($d['date']))]], 'Valor recebido.', (float) $d['amount']);

        $y = DocTheme::tableHead($p, 274, [['Descrição', $L + 19, 'L'], ['Factura', 299, 'L'], ['Data pag.', 437, 'C'], ['Valor', 498, 'L']]);
        $desc = 'Pagamento por ' . $d['method'] . ($d['reference'] ? ' (ref. ' . $d['reference'] . ')' : '');
        $lines = array_slice(DocTheme::wrap($p, $desc, 205, 9.5), 0, 3);
        $h = max(39, 16 + count($lines) * 12);
        $ty = $y + ($h - (count($lines) - 1) * 12) / 2 + 3.5;
        foreach ($lines as $k => $line) $p->text($L + 19, $ty + $k * 12, $line, 9.5, false, $ink);
        $p->text(299, $ty, (string) $d['invoice'], 9.5, false, $ink);
        $p->text(437, $ty, date('d/m/Y', strtotime($d['paid_on'])), 9.5, false, $ink, 'C');
        $p->text(541, $ty, DocTheme::amount((float) $d['amount']), 9.5, false, $ink, 'R');
        $y += $h;
        $p->line($L, $y, $R, $y, DocTheme::RULE, 0.8);

        $y = 400;
        DocTheme::totals($p, $y, [
            ['Total da factura', DocTheme::amount((float) $d['invoice_total'])],
            ['Saldo em dívida', DocTheme::amount(max(0, (float) $d['balance_after']))],
        ], 'Recebido (MZN)', (float) $d['amount']);

        $x = $L + 19;
        $p->text($x, $y, 'Recebemos a quantia indicada,', 10, false, $ink);
        $p->text($x, $y + 14, 'referente à factura ' . $d['invoice'] . '.', 10, false, $ink);
        if (!empty($c['tax_note'])) {
            $p->paragraph($x, $y + 34, 250, $c['tax_note'], 8, false, DocTheme::SOFT, 1.3);
        }
        $p->line($x, $y + 96, $x + 180, $y + 96, $ink, 0.6);
        $p->text($x, $y + 110, $c['trade_name'] ?? 'Moz Camp Adventures', 10, true, DocTheme::ORANGE);
        $p->text($x, $y + 123, $d['issued_by'], 9, false, $ink);

        DocTheme::footer($p, $c, ($c['legal_name'] ?? '') . (!empty($c['nuit']) ? ' · NUIT ' . $c['nuit'] : '') . ' · ' . $d['number'] . ' · Documento processado por computador');
        return $p->output(['title' => 'Recibo ' . $d['number'], 'author' => $c['legal_name'] ?? '']);
    }
}
