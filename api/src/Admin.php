<?php
/**
 * MOZ CAMP ADVENTURES — api/src/Admin.php
 * Rotas do painel (/api/admin/*). Todas exigem sessão; cada uma exige a
 * permissão indicada; escritas exigem token CSRF e origem do site.
 */

declare(strict_types=1);

final class Admin
{
    private const BOOKING_FLOW = [
        'pedido' => ['confirmada', 'cancelada'],
        'confirmada' => ['concluida', 'cancelada'],
        'cancelada' => ['pedido'],
        'concluida' => [],
    ];

    public static function route(string $method, string $path): mixed
    {
        $routes = [
            ['POST', '#^/login$#', fn () => Auth::login(json_input())],
            ['POST', '#^/logout$#', fn () => Auth::logout()],
            ['GET', '#^/me$#', fn () => Auth::me() + ['permissions_catalog' => Auth::PERMISSIONS]],
            ['POST', '#^/setup-password$#', fn () => Auth::setupPassword(json_input())],
            ['GET', '#^/dashboard$#', fn () => self::dashboard(Auth::require('dashboard.view'))],
            ['GET', '#^/catalog$#', fn () => self::catalog(Auth::require('bookings.create'))],
            ['GET', '#^/bookings$#', fn () => self::bookings(Auth::require('bookings.view'))],
            ['POST', '#^/bookings$#', fn () => Bookings::create(json_input(), Auth::require('bookings.create'))],
            ['GET', '#^/bookings/(MCA-\d{4}-\d{5,})$#', fn ($m) => self::booking($m[1], Auth::require('bookings.view'))],
            ['POST', '#^/bookings/(MCA-\d{4}-\d{5,})/status$#', fn ($m) => self::bookingStatus($m[1], json_input(), Auth::require('bookings.manage'))],
            ['POST', '#^/bookings/(MCA-\d{4}-\d{5,})/notes$#', fn ($m) => self::bookingNote($m[1], json_input(), Auth::require('bookings.manage'))],
            ['GET', '#^/invoices$#', fn () => (Auth::require('invoices.view') ? Invoices::list($_GET) : null)],
            ['POST', '#^/invoices$#', fn () => Invoices::createDraft(json_input(), Auth::require('invoices.issue'))],
            ['GET', '#^/invoices/(\d+)$#', fn ($m) => (Auth::require('invoices.view') ? Invoices::get((int) $m[1]) : null)],
            ['GET', '#^/invoices/(\d+)/pdf$#', fn ($m) => (Auth::require('invoices.view') ? Invoices::streamPdf((int) $m[1]) : null)],
            ['POST', '#^/invoices/(\d+)/draft$#', fn ($m) => (Auth::require('invoices.issue') ? Invoices::updateDraft((int) $m[1], json_input()) : null)],
            ['POST', '#^/invoices/(\d+)/discard$#', fn ($m) => (Auth::require('invoices.issue') ? Invoices::discard((int) $m[1]) : null)],
            ['POST', '#^/invoices/(\d+)/issue$#', fn ($m) => Invoices::issue((int) $m[1], Auth::require('invoices.issue'))],
            ['POST', '#^/invoices/(\d+)/void$#', fn ($m) => Invoices::void((int) $m[1], json_input(), Auth::require('invoices.void'))],
            ['POST', '#^/invoices/(\d+)/send$#', fn ($m) => Invoices::send((int) $m[1], Auth::require('invoices.send'))],
            ['GET', '#^/payments$#', fn () => (Auth::require('payments.view') ? Payments::list($_GET) : null)],
            ['POST', '#^/invoices/(\d+)/payments$#', fn ($m) => Payments::record((int) $m[1], json_input(), Auth::require('payments.record'))],
            ['POST', '#^/invoices/(\d+)/proof-link$#', fn ($m) => self::proofLink((int) $m[1], Auth::require('payments.record'))],
            ['POST', '#^/invoices/(\d+)/refunds$#', fn ($m) => Payments::refund((int) $m[1], json_input(), Auth::require('payments.reverse'))],
            ['POST', '#^/payments/(\d+)/confirm$#', fn ($m) => Payments::confirm((int) $m[1], json_input(), Auth::require('payments.confirm'))],
            ['POST', '#^/payments/(\d+)/refuse$#', fn ($m) => Payments::refuse((int) $m[1], json_input(), Auth::require('payments.confirm'))],
            ['POST', '#^/payments/(\d+)/reverse$#', fn ($m) => Payments::reverse((int) $m[1], json_input(), Auth::require('payments.reverse'))],
            ['GET', '#^/payments/(\d+)/proof$#', fn ($m) => (Auth::require('payments.view') ? Payments::streamProof((int) $m[1]) : null)],
            ['GET', '#^/receipts/(\d+)/pdf$#', fn ($m) => (Auth::require('payments.view') ? Payments::streamReceipt((int) $m[1]) : null)],
            ['GET', '#^/emails$#', fn () => self::emails(Auth::require('emails.manage'))],
            ['POST', '#^/emails/(\d+)/resend$#', fn ($m) => self::resend((int) $m[1], Auth::require('emails.manage'))],
            ['POST', '#^/bookings/(MCA-\d{4}-\d{5,})/client-link$#', fn ($m) => self::clientLink($m[1], json_input(), Auth::require('bookings.manage'))],
            ['GET', '#^/reviews$#', fn () => self::reviews(Auth::require('reviews.moderate'))],
            ['POST', '#^/reviews/(\d+)$#', fn ($m) => self::moderate((int) $m[1], json_input(), Auth::require('reviews.moderate'))],
            ['GET', '#^/messages$#', fn () => self::messages(Auth::require('messages.view'))],
            ['POST', '#^/messages/(\d+)$#', fn ($m) => self::messageStatus((int) $m[1], json_input(), Auth::require('messages.view'))],
            ['GET', '#^/users$#', fn () => self::users(Auth::require('users.manage'))],
            ['POST', '#^/users$#', fn () => self::createUser(json_input(), Auth::require('users.manage'))],
            ['POST', '#^/users/(\d+)$#', fn ($m) => self::updateUser((int) $m[1], json_input(), Auth::require('users.manage'))],
            ['POST', '#^/users/(\d+)/reset$#', fn ($m) => self::resetUser((int) $m[1], Auth::require('users.manage'))],
            ['POST', '#^/roles$#', fn () => self::saveRole(null, json_input(), Auth::require('users.manage'))],
            ['POST', '#^/roles/(\d+)$#', fn ($m) => self::saveRole((int) $m[1], json_input(), Auth::require('users.manage'))],
            ['GET', '#^/settings$#', fn () => self::settings(Auth::require('settings.manage'))],
            ['POST', '#^/settings/(company|payment|notifications)$#', fn ($m) => self::saveSetting($m[1], json_input(), Auth::require('settings.manage'))],
            ['GET', '#^/audit$#', fn () => self::audit(Auth::require('audit.view'))],
        ];
        foreach ($routes as [$verb, $re, $fn]) {
            if ($verb === $method && preg_match($re, $path, $m)) {
                return $fn($m);
            }
        }
        throw new ApiError(404, 'not_found');
    }

    /* ── Resumo ─────────────────────────────────────────── */
    private static function dashboard(array $u): array
    {
        $one = static fn (string $sql) => db()->query($sql)->fetchColumn();
        $data = [
            'bookings_pending' => (int) $one("SELECT count(*) FROM bookings WHERE status = 'pedido'"),
            'bookings_confirmed_upcoming' => (int) $one("SELECT count(*) FROM bookings WHERE status = 'confirmada' AND coalesce(service_date, checkin) >= current_date"),
            'messages_new' => (int) $one("SELECT count(*) FROM contact_messages WHERE status = 'novo'"),
            'reviews_pending' => (int) $one("SELECT count(*) FROM reviews WHERE status = 'pendente'"),
            'invoices_draft' => (int) $one("SELECT count(*) FROM invoices WHERE status = 'rascunho'"),
            'invoiced_month' => (float) $one("SELECT coalesce(sum(total), 0) FROM invoices WHERE doc_type = 'FT' AND status = 'emitida' AND issue_date >= date_trunc('month', current_date)"),
            'invoiced_year' => (float) $one("SELECT coalesce(sum(total), 0) FROM invoices WHERE doc_type = 'FT' AND status = 'emitida' AND issue_date >= date_trunc('year', current_date)"),
            'invoices_issued_month' => (int) $one("SELECT count(*) FROM invoices WHERE doc_type = 'FT' AND status = 'emitida' AND issue_date >= date_trunc('month', current_date)"),
        ];
        /* Recebido = pagamentos CONFIRMADOS menos reembolsos (pela data do pagamento). Nunca inclui facturado por receber. */
        $data['received_month'] = (float) $one("SELECT coalesce(sum(CASE WHEN kind = 'payment' THEN amount ELSE -amount END), 0) FROM payments WHERE status = 'confirmado' AND paid_on >= date_trunc('month', current_date)");
        $data['received_year'] = (float) $one("SELECT coalesce(sum(CASE WHEN kind = 'payment' THEN amount ELSE -amount END), 0) FROM payments WHERE status = 'confirmado' AND paid_on >= date_trunc('year', current_date)");
        $data['outstanding'] = (float) $one("SELECT coalesce(sum(balance), 0) FROM invoice_balances WHERE pay_status IN ('pendente', 'parcial')");
        $data['payments_awaiting'] = (int) $one("SELECT count(*) FROM payments WHERE status IN ('declarado', 'em_verificacao')");
        $data['invoices_by_status'] = db()->query("SELECT pay_status, count(*) AS n FROM invoice_balances WHERE pay_status <> 'anulada' GROUP BY pay_status")->fetchAll(PDO::FETCH_KEY_PAIR);
        $data['emails_failed'] = Auth::has('emails.manage') ? (int) $one("SELECT count(*) FROM email_log e WHERE e.status = 'failed' AND e.created_at > now() - interval '7 days' AND NOT EXISTS (SELECT 1 FROM email_log r WHERE r.resent_of = e.id AND r.status IN ('sent', 'logged'))") : null;
        if (!Auth::has('payments.view')) {
            unset($data['received_month'], $data['received_year'], $data['outstanding'], $data['payments_awaiting'], $data['invoices_by_status']);
        }
        $data['recent'] = db()->query("SELECT reference, item_name, customer_name, status, coalesce(service_date, checkin) AS date, total_estimate, created_at FROM bookings ORDER BY created_at DESC LIMIT 8")->fetchAll();
        $data['upcoming'] = db()->query("SELECT reference, item_name, customer_name, coalesce(service_date, checkin) AS date, adults + children AS pax FROM bookings WHERE status = 'confirmada' AND coalesce(service_date, checkin) BETWEEN current_date AND current_date + 14 ORDER BY 4 LIMIT 10")->fetchAll();
        return $data;
    }

    /* ── Reservas ───────────────────────────────────────── */
    private static function catalog(array $u): array
    {
        $out = [];
        foreach (['tours.json' => 'tour', 'accommodations.json' => 'stay'] as $f => $kind) {
            $dir = config('app.data_dir') ?: dirname(__DIR__, 2) . '/data';
            foreach (json_decode((string) file_get_contents("$dir/$f"), true) as $p) {
                if (empty($p['disabled'])) {
                    $out[] = ['id' => $p['slug'] ?? $p['id'], 'name' => $p['name'], 'kind' => $kind, 'child' => !empty($p['price_child']),
                        'boats' => array_map(fn ($o) => ['id' => $o['id'], 'title' => $o['title']], $p['privateBoatOptions'] ?? []),
                        'extras' => array_map(fn ($o) => ['id' => $o['id'], 'title' => $o['title']], $p['extras'] ?? [])];
                }
            }
        }
        return ['items' => $out];
    }

    private static function bookings(array $u): array
    {
        $where = ['1=1'];
        $args = [];
        if (!empty($_GET['status'])) { $where[] = 'b.status = ?'; $args[] = (string) $_GET['status']; }
        if (!empty($_GET['q'])) {
            $like = '%' . str_replace(['%', '_'], ['\%', '\_'], trim((string) $_GET['q'])) . '%';
            $where[] = '(b.reference ILIKE ? OR b.customer_name ILIKE ? OR b.customer_phone ILIKE ? OR b.customer_email ILIKE ? OR b.item_name ILIKE ?)';
            array_push($args, $like, $like, $like, $like, $like);
        }
        $stmt = db()->prepare('SELECT b.reference, b.status, b.channel, b.item_name, b.customer_name, b.customer_phone, coalesce(b.service_date, b.checkin) AS date, b.adults + b.children AS pax, b.total_estimate, b.total_to_confirm, b.created_at,
              (SELECT count(*) FROM invoices i WHERE i.booking_id = b.id AND i.status = \'emitida\') AS invoices
            FROM bookings b WHERE ' . implode(' AND ', $where) . ' ORDER BY b.created_at DESC LIMIT 200');
        $stmt->execute($args);
        return ['bookings' => $stmt->fetchAll()];
    }

    private static function bookingRow(string $ref): array
    {
        $stmt = db()->prepare('SELECT * FROM bookings WHERE reference = ?');
        $stmt->execute([$ref]);
        return $stmt->fetch() ?: throw new ApiError(404, 'not_found');
    }

    private static function booking(string $ref, array $u): array
    {
        $b = self::bookingRow($ref);
        unset($b['access_token_hash'], $b['ip_hash'], $b['idempotency_key']);
        $b['options'] = json_decode((string) $b['options'], true);
        $b['price_lines'] = json_decode((string) $b['price_lines'], true);
        $ev = db()->prepare('SELECT type, data, actor, created_at FROM booking_events WHERE booking_id = ? ORDER BY id');
        $ev->execute([$b['id']]);
        $b['events'] = array_map(static fn ($e) => ['data' => json_decode((string) $e['data'], true)] + $e, $ev->fetchAll());
        $inv = db()->prepare('SELECT i.id, i.doc_type, i.status, i.number, i.total, i.issue_date, ib.paid, ib.balance, ib.pay_status FROM invoices i LEFT JOIN invoice_balances ib ON ib.invoice_id = i.id WHERE i.booking_id = ? ORDER BY i.id');
        $inv->execute([$b['id']]);
        $b['invoices'] = $inv->fetchAll();
        /* Situação financeira da reserva = facturas FT válidas (o estado operacional é independente) */
        $fin = db()->prepare("SELECT coalesce(sum(ib.total), 0) AS invoiced, coalesce(sum(ib.paid), 0) AS paid, coalesce(sum(ib.balance), 0) AS balance, coalesce(sum(ib.awaiting), 0) AS awaiting
            FROM invoice_balances ib JOIN invoices i ON i.id = ib.invoice_id WHERE i.booking_id = ? AND ib.pay_status <> 'anulada'");
        $fin->execute([$b['id']]);
        $f = $fin->fetch();
        $b['finance'] = Auth::has('payments.view') ? [
            'invoiced' => (float) $f['invoiced'], 'paid' => (float) $f['paid'], 'balance' => (float) $f['balance'], 'awaiting' => (int) $f['awaiting'],
            'status' => (float) $f['invoiced'] <= 0 ? 'sem_factura' : ((float) $f['balance'] <= 0.001 ? 'pago' : ((float) $f['paid'] > 0 ? 'parcial' : 'pendente')),
        ] : null;
        $b['next_status'] = self::BOOKING_FLOW[$b['status']] ?? [];
        return ['booking' => $b];
    }

    private static function bookingStatus(string $ref, array $in, array $u): array
    {
        $b = self::bookingRow($ref);
        $to = (string) ($in['status'] ?? '');
        if (!in_array($to, self::BOOKING_FLOW[$b['status']] ?? [], true)) {
            throw new ApiError(422, 'invalid_transition', '', ['from' => $b['status'], 'to' => $to]);
        }
        $note = clean_text($in['note'] ?? '', 1000);
        if ($to === 'cancelada' && strlen($note) < 3) {
            throw new ApiError(422, 'cancel_reason_required');
        }
        $pdo = db();
        $pdo->beginTransaction();
        $pdo->prepare('UPDATE bookings SET status = ? WHERE id = ? AND status = ?')->execute([$to, $b['id'], $b['status']]);
        $pdo->prepare("INSERT INTO booking_events (booking_id, type, data, actor) VALUES (?, 'status_changed', ?, ?)")
            ->execute([$b['id'], json_encode(['from' => $b['status'], 'to' => $to, 'note' => $note], JSON_UNESCAPED_UNICODE), $u['name']]);
        $pdo->commit();
        Audit::log('booking_status', 'booking', $ref, ['from' => $b['status'], 'to' => $to]);
        $email = ($in['notify'] ?? true) ? Notify::bookingStatus($b, $to, $note) : 'skipped';
        return self::booking($ref, $u) + ['email' => $email];
    }

    private static function bookingNote(string $ref, array $in, array $u): array
    {
        $b = self::bookingRow($ref);
        $text = clean_text($in['text'] ?? '', 2000);
        if (strlen($text) < 2) throw new ApiError(422, 'invalid_note');
        db()->prepare("INSERT INTO booking_events (booking_id, type, data, actor) VALUES (?, 'note', ?, ?)")->execute([$b['id'], json_encode(['text' => $text], JSON_UNESCAPED_UNICODE), $u['name']]);
        Audit::log('booking_note', 'booking', $ref);
        return self::booking($ref, $u);
    }

    /** Link da área do cliente (para partilhar). Com revoke=true, invalida todos os links anteriores. */
    private static function clientLink(string $ref, array $in, array $u): array
    {
        $b = self::bookingRow($ref);
        if (!empty($in['revoke'])) {
            $s = db()->prepare('UPDATE bookings SET client_link_version = client_link_version + 1 WHERE id = ? RETURNING client_link_version');
            $s->execute([$b['id']]);
            $b['client_link_version'] = (int) $s->fetchColumn();
            db()->prepare("INSERT INTO booking_events (booking_id, type, data, actor) VALUES (?, 'client_link_revoked', '{}', ?)")->execute([$b['id'], $u['name']]);
            Audit::log('client_link_revoked', 'booking', $ref);
        }
        return ['link' => Notify::clientLink($b)];
    }

    private static function emails(array $u): array
    {
        $where = '1=1';
        $args = [];
        if (in_array($_GET['status'] ?? '', ['sent', 'failed', 'logged'], true)) { $where = 'e.status = ?'; $args[] = $_GET['status']; }
        $s = db()->prepare("SELECT e.id, e.kind, e.to_addr, e.subject, e.related_type, e.related_id, e.status, e.error, e.lang, e.created_at, e.resent_of, (e.body IS NOT NULL) AS resendable,
              EXISTS (SELECT 1 FROM email_log r WHERE r.resent_of = e.id AND r.status IN ('sent', 'logged')) AS resent_ok
            FROM email_log e WHERE $where ORDER BY e.id DESC LIMIT 300");
        $s->execute($args);
        return ['emails' => $s->fetchAll()];
    }

    private static function resend(int $id, array $u): array
    {
        $r = Mailer::resend($id);
        Audit::log('email_resent', 'email', $id, $r);
        return $r;
    }

    /** Link privado para o cliente enviar o comprovativo (para partilhar por WhatsApp). Substitui o anterior. */
    private static function proofLink(int $id, array $u): array
    {
        $s = db()->prepare("SELECT number FROM invoices WHERE id = ? AND doc_type = 'FT' AND status = 'emitida'");
        $s->execute([$id]);
        $number = $s->fetchColumn() ?: throw new ApiError(409, 'invoice_not_payable');
        $link = Payments::issueProofLink($id);
        Audit::log('proof_link_created', 'invoice', $id, ['number' => $number]);
        return ['link' => $link, 'expires_days' => 60];
    }

    /* ── Avaliações e mensagens ─────────────────────────── */
    private static function reviews(array $u): array
    {
        $status = in_array($_GET['status'] ?? '', ['pendente', 'aprovada', 'rejeitada'], true) ? $_GET['status'] : 'pendente';
        $stmt = db()->prepare('SELECT id, item_id, name, origin, rating, body, lang, status, created_at, moderated_at, moderated_by FROM reviews WHERE status = ? ORDER BY created_at DESC LIMIT 200');
        $stmt->execute([$status]);
        return ['reviews' => $stmt->fetchAll()];
    }

    private static function moderate(int $id, array $in, array $u): array
    {
        $to = (string) ($in['status'] ?? '');
        if (!in_array($to, ['aprovada', 'rejeitada', 'pendente'], true)) throw new ApiError(422, 'invalid_status');
        $stmt = db()->prepare('UPDATE reviews SET status = ?, moderated_at = now(), moderated_by = ? WHERE id = ? RETURNING id');
        $stmt->execute([$to, $u['name'], $id]);
        $stmt->fetch() ?: throw new ApiError(404, 'not_found');
        Audit::log('review_' . $to, 'review', $id);
        return ['ok' => true];
    }

    private static function messages(array $u): array
    {
        return ['messages' => db()->query('SELECT id, name, email, phone, subject, message, lang, status, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 200')->fetchAll()];
    }

    private static function messageStatus(int $id, array $in, array $u): array
    {
        $to = (string) ($in['status'] ?? '');
        if (!in_array($to, ['novo', 'respondido', 'arquivado'], true)) throw new ApiError(422, 'invalid_status');
        db()->prepare('UPDATE contact_messages SET status = ? WHERE id = ?')->execute([$to, $id]);
        Audit::log('message_' . $to, 'message', $id);
        return ['ok' => true];
    }

    /* ── Utilizadores e perfis ──────────────────────────── */
    private static function users(array $u): array
    {
        $users = db()->query('SELECT u.id, u.name, u.email, u.active, u.role_id, r.name AS role, u.last_login_at, (u.password_hash IS NOT NULL) AS has_password, u.setup_expires_at FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id')->fetchAll();
        $roles = array_map(static fn ($r) => ['permissions' => Auth::parseArray($r['permissions'])] + $r, db()->query('SELECT id, code, name, permissions, is_system FROM roles ORDER BY id')->fetchAll());
        return ['users' => $users, 'roles' => $roles, 'catalog' => Auth::PERMISSIONS];
    }

    private static function createUser(array $in, array $u): array
    {
        $name = clean_text($in['name'] ?? '', 120);
        $email = strtolower(clean_text($in['email'] ?? '', 160));
        $role = (int) ($in['role_id'] ?? 0);
        if (strlen($name) < 2) throw new ApiError(422, 'invalid_name');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new ApiError(422, 'invalid_email');
        self::roleExists($role);
        try {
            $stmt = db()->prepare('INSERT INTO users (name, email, role_id) VALUES (?, ?, ?) RETURNING id');
            $stmt->execute([$name, $email, $role]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23505') throw new ApiError(409, 'email_exists');
            throw $e;
        }
        $id = (int) $stmt->fetchColumn();
        $link = Auth::issueSetupLink($id);
        $mail = Mailer::send('user_invite', $email, 'Acesso ao painel — Moz Camp Adventures', "Olá $name,\n\nFoi criado o seu acesso ao painel da Moz Camp Adventures.\nDefina a sua palavra-passe neste link (válido 48 horas):\n\n$link\n\nSe não esperava este e-mail, ignore-o.", 'user', $id);
        Audit::log('user_created', 'user', $id, ['email' => $email, 'role_id' => $role]);
        return ['id' => $id, 'setup_link' => $link, 'email' => $mail];
    }

    private static function updateUser(int $id, array $in, array $u): array
    {
        $cur = db()->prepare('SELECT u.id, u.active, u.role_id, r.code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?');
        $cur->execute([$id]);
        $row = $cur->fetch() ?: throw new ApiError(404, 'not_found');
        $role = isset($in['role_id']) ? (int) $in['role_id'] : (int) $row['role_id'];
        $active = isset($in['active']) ? (bool) $in['active'] : (bool) $row['active'];
        self::roleExists($role);
        db()->beginTransaction();
        db()->prepare('UPDATE users SET role_id = ?, active = ? WHERE id = ?')->execute([$role, $active ? 't' : 'f', $id]);
        $admins = (int) db()->query("SELECT count(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'admin' AND u.active")->fetchColumn();
        if ($admins < 1) {
            db()->rollBack();
            throw new ApiError(422, 'last_admin');            // tem de existir sempre um administrador activo
        }
        if (!$active) {
            db()->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$id]);
        }
        db()->commit();
        Audit::log('user_updated', 'user', $id, ['role_id' => $role, 'active' => $active]);
        return self::users($u);
    }

    private static function resetUser(int $id, array $u): array
    {
        $stmt = db()->prepare('SELECT name, email FROM users WHERE id = ? AND active');
        $stmt->execute([$id]);
        $row = $stmt->fetch() ?: throw new ApiError(404, 'not_found');
        $link = Auth::issueSetupLink($id);
        $mail = Mailer::send('user_reset', $row['email'], 'Repor palavra-passe — Moz Camp Adventures', "Olá {$row['name']},\n\nPara definir uma nova palavra-passe do painel, use este link (válido 48 horas):\n\n$link", 'user', $id);
        Audit::log('user_reset_link', 'user', $id);
        return ['setup_link' => $link, 'email' => $mail];
    }

    private static function saveRole(?int $id, array $in, array $u): array
    {
        if ($id !== null) {
            $sys = db()->prepare('SELECT is_system::int AS sys FROM roles WHERE id = ?');
            $sys->execute([$id]);
            $row = $sys->fetch() ?: throw new ApiError(404, 'not_found');
            if ($row['sys']) throw new ApiError(422, 'system_role_locked');   // o perfil Administrador não é editável
        }
        $name = clean_text($in['name'] ?? '', 60);
        $perms = array_values(array_unique(array_filter((array) ($in['permissions'] ?? []), static fn ($p) => is_string($p) && isset(Auth::PERMISSIONS[$p]))));
        if (strlen($name) < 2) throw new ApiError(422, 'invalid_name');
        if ($id === null) {
            $ascii = strtr(strtolower($name), ['á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'é' => 'e', 'ê' => 'e', 'í' => 'i', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ú' => 'u', 'ç' => 'c']);
            $code = trim(preg_replace('/[^a-z0-9]+/', '-', $ascii), '-') ?: 'perfil';
            $stmt = db()->prepare('INSERT INTO roles (code, name, permissions) VALUES (?, ?, ?) RETURNING id');
            try {
                $stmt->execute([substr($code, 0, 30), $name, '{' . implode(',', $perms) . '}']);
            } catch (PDOException $e) {
                if ($e->getCode() === '23505') throw new ApiError(409, 'role_exists');
                throw $e;
            }
            $id = (int) $stmt->fetchColumn();
        } else {
            db()->prepare('UPDATE roles SET name = ?, permissions = ? WHERE id = ?')->execute([$name, '{' . implode(',', $perms) . '}', $id]);
        }
        Audit::log('role_saved', 'role', $id, ['name' => $name, 'permissions' => $perms]);
        return self::users($u);
    }

    private static function roleExists(int $id): void
    {
        $s = db()->prepare('SELECT 1 FROM roles WHERE id = ?');
        $s->execute([$id]);
        $s->fetchColumn() ?: throw new ApiError(422, 'invalid_role');
    }

    /* ── Definições ─────────────────────────────────────── */
    private static function settings(array $u): array
    {
        return ['company' => setting('company'), 'payment' => setting('payment'), 'invoicing' => setting('invoicing'), 'notifications' => setting('notifications')];
    }

    private static function saveSetting(string $key, array $in, array $u): array
    {
        if ($key === 'company') {
            $v = [];
            foreach (['trade_name' => 120, 'legal_name' => 160, 'nuit' => 20, 'address' => 300, 'phone' => 40, 'email' => 160, 'website' => 120, 'tax_regime' => 40, 'tax_note' => 300] as $k => $max) {
                $v[$k] = clean_text($in[$k] ?? '', $max);
            }
            if (strlen($v['legal_name']) < 2) throw new ApiError(422, 'invalid_legal_name');
            if ($v['nuit'] !== '' && !preg_match('/^\d{9}$/', $v['nuit'])) throw new ApiError(422, 'invalid_nuit');
        } elseif ($key === 'notifications') {
            $v = [];
            foreach (array_keys(setting('notifications')) as $k) {
                $v[$k] = !empty($in[$k]);
            }
        } else {
            $methods = [];
            foreach (array_slice((array) ($in['methods'] ?? []), 0, 10) as $m) {
                $type = ($m['type'] ?? '') === 'mobile' ? 'mobile' : 'bank';
                $row = ['type' => $type, 'label' => clean_text($m['label'] ?? '', 60)];
                if ($row['label'] === '') continue;
                if ($type === 'bank') {
                    $row['account'] = clean_text($m['account'] ?? '', 40);
                    $row['nib'] = clean_text($m['nib'] ?? '', 40);
                } else {
                    $row['number'] = clean_text($m['number'] ?? '', 40);
                    if ($row['number'] === '') $row['pending'] = true;
                }
                $methods[] = $row;
            }
            $v = ['methods' => $methods, 'note' => clean_text($in['note'] ?? '', 600)];
        }
        $old = setting($key);
        db()->prepare('INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by')
            ->execute([$key, json_encode($v, JSON_UNESCAPED_UNICODE), $u['id']]);
        Audit::log('settings_' . $key, 'settings', $key, ['before' => $old, 'after' => $v]);
        return self::settings($u);
    }

    private static function audit(array $u): array
    {
        $stmt = db()->prepare('SELECT id, user_name, action, entity, entity_id, data, created_at FROM audit_log ORDER BY id DESC LIMIT 300');
        $stmt->execute();
        return ['entries' => array_map(static fn ($r) => ['data' => json_decode((string) $r['data'], true)] + $r, $stmt->fetchAll())];
    }
}
