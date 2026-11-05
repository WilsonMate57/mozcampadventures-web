<?php
/**
 * MOZ CAMP ADVENTURES — api/src/Services.php
 * Pedidos de reserva (com referência), mensagens de contacto e avaliações.
 */

declare(strict_types=1);

final class Bookings
{
    /**
     * Cria um pedido de reserva. Idempotente pela chave do cliente: repetir o
     * mesmo pedido devolve a mesma referência, sem criar duplicados.
     */
    public static function create(array $in, ?array $admin = null): array
    {
        if ($admin !== null) {                    // pedido manual registado no painel (WhatsApp, telefone, e-mail)
            $in['idempotency_key'] = $in['idempotency_key'] ?? self::uuid();
            $in['website'] = '';
        }
        reject_honeypot($in);
        $lang = lang_of($in['lang'] ?? 'pt');
        $key = is_string($in['idempotency_key'] ?? null) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $in['idempotency_key']) ? strtolower($in['idempotency_key']) : null;
        if ($key === null) {
            throw new ApiError(422, 'invalid_idempotency_key');
        }

        $existing = db()->prepare('SELECT id, reference, lang, client_link_version, total_estimate, total_to_confirm, price_lines FROM bookings WHERE idempotency_key = ?');
        $existing->execute([$key]);
        if ($row = $existing->fetch()) {
            return ['reference' => $row['reference'], 'total' => (int) $row['total_estimate'], 'to_confirm' => (bool) $row['total_to_confirm'], 'lines' => json_decode((string) $row['price_lines'], true) ?: [],
                'status' => 'pedido', 'client_url' => $admin === null ? Notify::clientLink($row) : null, 'replayed' => true];
        }
        if ($admin === null) {
            rate_limit('booking', (int) (config('limits.bookings_per_hour') ?? 10), 3600);
        }
        $channel = $admin !== null ? (in_array($in['channel'] ?? '', ['whatsapp', 'email', 'manual'], true) ? $in['channel'] : 'manual') : 'site';

        $item = Catalog::find((string) ($in['item'] ?? ''), $lang) ?? throw new ApiError(422, 'invalid_item');
        $name = clean_text($in['name'] ?? '', 120);
        $phone = clean_text($in['phone'] ?? '', 40);
        $email = clean_text($in['email'] ?? '', 160);
        $message = clean_text($in['message'] ?? '', 2000);
        if (strlen($name) < 2) {
            throw new ApiError(422, 'invalid_name');
        }
        if (strlen(preg_replace('/\D/', '', $phone)) < 7) {
            throw new ApiError(422, 'invalid_phone');
        }
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new ApiError(422, 'invalid_email');
        }
        $q = Pricing::quote($item, $in);   // preço recalculado no servidor; valores do cliente são ignorados

        $token = bin2hex(random_bytes(24));
        $pdo = db();
        $pdo->beginTransaction();
        try {
            /* Disponibilidade: verificada aqui, com a data bloqueada até ao fim da transacção */
            $itemId = $item['slug'] ?? $item['id'];
            $override = $admin !== null && !empty($in['override_capacity']);
            $claim = Availability::claim($itemId, $q, $in, $admin !== null, $override);
            $year = date('Y');
            $seq = $pdo->prepare('INSERT INTO counters (name, value) VALUES (?, 1) ON CONFLICT (name) DO UPDATE SET value = counters.value + 1 RETURNING value');
            $seq->execute(["booking-$year"]);
            $reference = sprintf('MCA-%s-%05d', $year, (int) $seq->fetchColumn());

            $consent = ($in['whatsapp_opt_in'] ?? false) === true;
            $ins = $pdo->prepare('INSERT INTO bookings (reference, idempotency_key, channel, lang, item_id, item_kind, item_name, service_date, checkin, checkout, nights, adults, children, options, price_lines, total_estimate, total_to_confirm, customer_name, customer_phone, customer_email, customer_message, access_token_hash, ip_hash, user_agent, customer_id, session, hold_expires_at, whatsapp_opt_in, whatsapp_opt_in_at)
                VALUES (:ref, :key, :channel, :lang, :item, :kind, :iname, :sdate, :cin, :cout, :nights, :adults, :children, :options, :lines, :total, :tc, :name, :phone, :email, :msg, :tok, :ip, :ua, :cust, :sess, :hold, :wa, :waat)
                RETURNING id');
            $ins->execute([
                ':ref' => $reference, ':key' => $key, ':channel' => $channel, ':lang' => $lang,
                ':item' => $item['slug'] ?? $item['id'], ':kind' => $item['_kind'], ':iname' => $item['name'],
                ':sdate' => $q['dates']['service_date'] ?? null, ':cin' => $q['dates']['checkin'] ?? null, ':cout' => $q['dates']['checkout'] ?? null,
                ':nights' => $q['nights'], ':adults' => $q['adults'], ':children' => $q['children'],
                ':options' => json_encode($q['options'], JSON_UNESCAPED_UNICODE), ':lines' => json_encode($q['lines'], JSON_UNESCAPED_UNICODE),
                ':total' => $q['total'], ':tc' => $q['to_confirm'] ? 't' : 'f',
                ':name' => $name, ':phone' => $phone, ':email' => $email ?: null, ':msg' => $message ?: null,
                ':tok' => hash('sha256', $token), ':ip' => ip_hash(), ':ua' => clean_text($_SERVER['HTTP_USER_AGENT'] ?? '', 300),
                ':cust' => $admin === null ? Account::currentId() : null,     // pedido feito com sessão de cliente → fica na conta
                ':sess' => $claim['session'], ':hold' => date('c', time() + Availability::holdHours() * 3600),
                ':wa' => $consent ? 't' : 'f', ':waat' => $consent ? date('c') : null,
            ]);
            $id = (int) $ins->fetchColumn();
            Availability::attach($id, $itemId, $claim);
            $pdo->prepare("INSERT INTO booking_events (booking_id, type, data, actor) VALUES (?, 'created', ?, ?)")
                ->execute([$id, json_encode(['total' => $q['total'], 'to_confirm' => $q['to_confirm'], 'channel' => $channel, 'session' => $claim['session'], 'override_capacity' => $override]), $admin['name'] ?? 'cliente']);
            $pdo->commit();
        } catch (ApiError $e) {                          // sem vagas, data bloqueada, sessão inválida
            $pdo->rollBack();
            throw $e;
        } catch (PDOException $e) {
            $pdo->rollBack();
            if ($e->getCode() === '23505') {             // corrida na mesma chave de idempotência
                return self::create($in, $admin);
            }
            throw $e;
        }

        /* Depois do commit: uma falha do WhatsApp nunca desfaz a reserva. O que ficar na fila sai pela tarefa agendada. */
        if ($consent) {
            try {
                $row = $pdo->prepare('SELECT * FROM bookings WHERE id = ?');
                $row->execute([$id]);
                $waMessage = WhatsApp::enqueueCustomer('booking_received', $row->fetch(), "booking_received:$id");
                if ($waMessage !== null) WhatsApp::sendNow($waMessage);
            } catch (Throwable $e) {
                error_log('[MCA WhatsApp] ' . $e->getMessage());
            }
        }
        if ($claim['session']) $q['dates']['session'] = $claim['session'];
        $mail = $admin === null ? self::notify($reference, $id, $item, $q, $name, $phone, $email, $message, $lang) : [];
        // Link pessoal da área do cliente: vai no QR code do ticket do pedido (só para quem fez o pedido no site)
        $clientUrl = $admin === null ? Notify::clientLink(['id' => $id, 'reference' => $reference, 'lang' => $lang, 'client_link_version' => 1]) : null;
        return ['reference' => $reference, 'total' => $q['total'], 'to_confirm' => $q['to_confirm'], 'lines' => $q['lines'], 'status' => 'pedido', 'email' => $mail, 'client_url' => $clientUrl];
    }

    public static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }

    private static function notify(string $ref, int $id, array $item, array $q, string $name, string $phone, string $email, string $message, string $lang): array
    {
        $when = isset($q['dates']['service_date'])
            ? "Data: {$q['dates']['service_date']}" . (isset($q['dates']['session']) ? " às {$q['dates']['session']}" : '')
            : "Entrada: {$q['dates']['checkin']} · Saída: {$q['dates']['checkout']} ({$q['nights']} noites)";
        $lines = implode("\n", array_map(static fn ($l) => "• {$l['label']}: " . ($l['amount'] === null ? ($l['note'] ?? 'a confirmar') : Pricing::fmt($l['amount'])), $q['lines']));
        $total = $q['to_confirm'] ? 'a confirmar pela equipa' : Pricing::fmt($q['total']);

        $team = "Novo pedido de reserva $ref\n\nExperiência: {$item['name']}\n$when\nParticipantes: {$q['pax']} ({$q['adults']} adultos, {$q['children']} crianças)\n\n$lines\n\nTotal estimado: $total\n\nCliente: $name\nTelefone: $phone\nE-mail: " . ($email ?: '—') . ($message ? "\nMensagem: $message" : '') . "\nIdioma: $lang\n\nEste pedido aguarda confirmação de disponibilidade.";
        /* Versão HTML (layout da marca): mesmos dados, datas por extenso */
        $view = ['ref' => $ref, 'item' => $item['name'], 'slug' => $item['slug'] ?? $item['id'], 'lang' => $lang, 'to_confirm' => $q['to_confirm'],
            'lines' => array_map(static fn ($l) => [$l['label'], $l['amount'] === null ? ($l['note'] ?? 'a confirmar') : Pricing::fmt($l['amount'])], $q['lines']), 'total' => $total,
            'name' => $name, 'phone' => $phone, 'email' => $email, 'message' => $message];
        $whenH = static fn (string $l) => isset($q['dates']['service_date']) ? EmailView::date($q['dates']['service_date'], $l) . (isset($q['dates']['session']) ? ' · ' . $q['dates']['session'] : '')
            : EmailView::date($q['dates']['checkin'], $l, false) . ' – ' . EmailView::date($q['dates']['checkout'], $l, false) . ' (' . $q['nights'] . ($l === 'en' ? ' nights)' : ' noites)');
        $paxH = static fn (string $l) => $q['pax'] . ' (' . $q['adults'] . ($l === 'en' ? ' adults' : ' adultos') . ($q['children'] ? ', ' . $q['children'] . ($l === 'en' ? ' children' : ' crianças') : '') . ')';
        $out = ['team' => !(setting('team_events')['email_new_booking'] ?? true) ? 'disabled' : Mailer::send('booking_team', Mailer::team(), "Pedido de reserva $ref — {$item['name']}", $team, 'booking', $id, $email ?: null, [], 'pt', null, null,
            EmailView::teamBooking(['when' => $whenH('pt'), 'pax' => $paxH('pt')] + $view))];
        try {   // aviso à equipa pelo WhatsApp (se activo); uma falha fica registada e nunca bloqueia o pedido
            $whenWa = isset($q['dates']['service_date']) ? $q['dates']['service_date'] : "{$q['dates']['checkin']} a {$q['dates']['checkout']} ({$q['nights']} noites)";
            WhatsApp::bookingTeam($ref, $id, $item['name'], $whenWa, "{$q['pax']} ({$q['adults']} adultos, {$q['children']} crianças)", $name, $phone, $total);
        } catch (Throwable $e) {
            error_log('[MCA WhatsApp] ' . $e->getMessage());
        }

        if ($email !== '' && Notify::enabled('booking_received')) {
            $area = Notify::clientLink(['id' => $id, 'reference' => $ref, 'lang' => $lang, 'client_link_version' => 1]);
            $client = $lang === 'en'
                ? "Hello $name,\n\nWe have received your booking request $ref for {$item['name']}.\n\n$when\n\n$lines\n\nEstimated total: " . ($q['to_confirm'] ? 'to be confirmed by our team' : Pricing::fmt($q['total'])) . "\n\nThis is a REQUEST, not a confirmed booking. Our team will confirm availability and send payment instructions (M-Pesa, e-Mola or bank transfer).\n\nFollow your request here: $area\n\nQuestions? WhatsApp +258 84 440 6543 — please quote $ref.\n\nMoz Camp Adventures\nMarina, Escola Náutica, Maputo"
                : "Olá $name,\n\nRecebemos o seu pedido de reserva $ref para {$item['name']}.\n\n$when\n\n$lines\n\nTotal estimado: $total\n\nIsto é um PEDIDO, não uma reserva confirmada. A nossa equipa vai confirmar a disponibilidade e enviar as instruções de pagamento (M-Pesa, e-Mola ou transferência bancária).\n\nAcompanhe o seu pedido aqui: $area\n\nDúvidas? WhatsApp +258 84 440 6543 — indique a referência $ref.\n\nMoz Camp Adventures\nMarina, Escola Náutica, Cidade de Maputo";
            $viewC = ['when' => $whenH($lang), 'pax' => $paxH($lang), 'area' => $area] + $view;
            if ($lang === 'en') { $viewC['total'] = $q['to_confirm'] ? 'to be confirmed' : Pricing::fmt($q['total']); $viewC['lines'] = array_map(static fn ($l) => [$l['label'], $l['amount'] === null ? ($l['note'] ?? 'to be confirmed') : Pricing::fmt($l['amount'])], $q['lines']); }
            $out['client'] = Mailer::send('booking_client', $email, ($lang === 'en' ? 'Booking request received' : 'Pedido de reserva recebido') . " — $ref", $client, 'booking', $id, (string) config('mail.team'), [], $lang, null, null,
                EmailView::bookingReceived($viewC));
        }
        return $out;
    }
}

final class Contact
{
    public static function create(array $in): array
    {
        reject_honeypot($in);
        rate_limit('contact', (int) (config('limits.contacts_per_hour') ?? 5), 3600);
        $name = clean_text($in['name'] ?? '', 120);
        $email = clean_text($in['email'] ?? '', 160);
        $phone = clean_text($in['phone'] ?? '', 40);
        $subject = clean_text($in['subject'] ?? '', 120);
        $message = clean_text($in['message'] ?? '', 4000);
        $lang = lang_of($in['lang'] ?? 'pt');
        if (strlen($name) < 2) throw new ApiError(422, 'invalid_name');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new ApiError(422, 'invalid_email');
        if ($subject === '') throw new ApiError(422, 'invalid_subject');
        if (strlen($message) < 2) throw new ApiError(422, 'invalid_message');

        $stmt = db()->prepare('INSERT INTO contact_messages (name, email, phone, subject, message, lang, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id');
        $stmt->execute([$name, $email, $phone ?: null, $subject, $message, $lang, ip_hash()]);
        $id = (int) $stmt->fetchColumn();
        $mail = Mailer::send('contact_team', (string) config('mail.contact'), "Mensagem do site: $subject", "De: $name <$email>\nTelefone: " . ($phone ?: '—') . "\nAssunto: $subject\nIdioma: $lang\n\n$message", 'contact', $id, $email);
        return ['ok' => true, 'id' => $id, 'email' => ['team' => $mail]];
    }
}

final class Reviews
{
    /** Avaliações aprovadas: de um item, ou as mais recentes (home). */
    public static function list(?string $item): array
    {
        if ($item !== null && $item !== '' && $item !== 'home') {
            $stmt = db()->prepare("SELECT name, origin, rating, body, created_at FROM reviews WHERE status = 'aprovada' AND item_id = ? ORDER BY created_at DESC LIMIT 50");
            $stmt->execute([$item]);
        } else {
            $stmt = db()->query("SELECT name, origin, rating, body, created_at FROM reviews WHERE status = 'aprovada' ORDER BY created_at DESC LIMIT 10");
        }
        $rows = $stmt->fetchAll();
        $avg = $rows ? round(array_sum(array_column($rows, 'rating')) / count($rows), 1) : null;
        return ['reviews' => array_map(static fn ($r) => ['name' => $r['name'], 'origin' => $r['origin'], 'rating' => (int) $r['rating'], 'text' => $r['body'], 'date' => substr((string) $r['created_at'], 0, 10)], $rows), 'count' => count($rows), 'average' => $avg];
    }

    /** Nova avaliação: fica pendente até ser aprovada pela equipa. */
    public static function create(array $in): array
    {
        reject_honeypot($in);
        rate_limit('review', (int) (config('limits.reviews_per_day') ?? 3), 86400);
        $name = clean_text($in['name'] ?? '', 80);
        $origin = clean_text($in['origin'] ?? '', 80);
        $text = clean_text($in['text'] ?? '', 1200);
        $rating = filter_var($in['rating'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 5]]);
        $item = clean_text($in['item'] ?? '', 80);
        if (strlen($name) < 2) throw new ApiError(422, 'invalid_name');
        if ($rating === false) throw new ApiError(422, 'invalid_rating');
        if (strlen($text) < 5) throw new ApiError(422, 'invalid_text');
        if ($item !== '' && Catalog::find($item, 'pt') === null) throw new ApiError(422, 'invalid_item');

        $stmt = db()->prepare('INSERT INTO reviews (item_id, name, origin, rating, body, lang, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id');
        $stmt->execute([$item ?: null, $name, $origin ?: null, $rating, $text, lang_of($in['lang'] ?? 'pt'), ip_hash()]);
        return ['ok' => true, 'status' => 'pendente'];
    }
}
