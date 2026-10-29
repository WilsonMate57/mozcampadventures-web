<?php
/**
 * MOZ CAMP ADVENTURES — api/src/Mailer.php
 * Envio de e-mail pela API do Resend (mail.transport = 'resend', recomendado)
 * ou pelo servidor (mail.transport = 'mail' → sendmail/Postfix do Plesk),
 * com registo em email_log (corpo e anexos por caminho, para diagnóstico
 * e reenvio). Um envio só é dado como feito se mail() o aceitar; falhas
 * ficam registadas com o erro.
 * mail.transport = 'log' (desenvolvimento) regista sem enviar; nesse modo,
 * destinatários em domínios .invalid (RFC 2606) simulam falha, para testes.
 * Cada e-mail leva HTML (layout da marca, api/src/EmailView.php) e texto (multipart/alternative);
 * sem HTML próprio, o texto é convertido para o mesmo layout (EmailView::fromText).
 * Resend: chave em RESEND_API_KEY (variável de ambiente) ou mail.resend_key; o remetente
 * (mail.from) tem de ser de um domínio verificado no Resend. Ver docs/NOTIFICACOES.md §6.
 */

declare(strict_types=1);

final class Mailer
{
    public static ?int $lastId = null;   // id do último registo em email_log
    private const RESEND_URL = 'https://api.resend.com/emails';

    /**
     * @param list<array{name:string, mime:string, data?:string, path?:string}> $attachments
     * @param ?string $logBody corpo a registar no lugar do enviado (e-mails de conta: sem o link secreto)
     * @param ?string $html versão HTML; sem ela, o texto é posto no layout da marca
     * @return 'sent'|'failed'|'logged'
     */
    public static function send(string $kind, string $to, string $subject, string $body, ?string $relatedType = null, ?int $relatedId = null, ?string $replyTo = null, array $attachments = [], ?string $lang = null, ?int $resentOf = null, ?string $logBody = null, ?string $html = null): string
    {
        $html ??= EmailView::fromText($body, $subject, $lang);
        $logHtml = $logBody !== null ? EmailView::fromText($logBody, $subject, $lang) : $html;   // o registo nunca guarda o link secreto
        $status = 'failed';
        $error = null;
        $providerId = null;
        $files = [];
        foreach ($attachments as $a) {
            $data = $a['data'] ?? (isset($a['path']) && is_file($a['path']) ? (string) file_get_contents($a['path']) : null);
            if ($data === null) {
                $error = 'anexo em falta: ' . $a['name'];
                continue;
            }
            $files[] = ['name' => $a['name'], 'mime' => $a['mime'], 'data' => $data];
        }
        $list = self::split($to);
        $to = implode(', ', $list);
        if (!$list || count($list) !== count(array_filter($list, static fn ($a) => filter_var($a, FILTER_VALIDATE_EMAIL)))) {
            $error = 'endereço inválido';
        } elseif ($error !== null) {
            // anexo em falta: não enviar um e-mail incompleto
        } elseif (config('mail.transport') === 'log') {
            if (array_filter($list, static fn ($a) => str_ends_with(strtolower($a), '.invalid'))) {
                $error = 'falha simulada (modo de teste, domínio .invalid)';
            } else {
                $status = 'logged';
            }
        } elseif (config('mail.transport') === 'resend') {
            [$status, $error, $providerId] = self::viaResend($list, $subject, $body, $html, $replyTo, $files);
        } else {
            $from = (string) config('mail.from');
            $headers = [
                'From' => self::encode((string) config('mail.from_name')) . " <$from>",
                'MIME-Version' => '1.0',
                'X-Mailer' => 'MCA-API/' . MCA_API_VERSION,
            ];
            if ($replyTo && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
                $headers['Reply-To'] = $replyTo;
            }
            /* Texto + HTML (o HTML em base64: as linhas longas do HTML excedem o limite de 998 caracteres do SMTP) */
            $alt = 'mca-alt-' . bin2hex(random_bytes(10));
            $altBody = "--$alt\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n$body\r\n"
                . "--$alt\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "\r\n--$alt--\r\n";
            $headers['Content-Type'] = "multipart/alternative; boundary=\"$alt\"";
            $wire = $altBody;
            if ($files) {
                $boundary = 'mca-' . bin2hex(random_bytes(12));
                $headers['Content-Type'] = "multipart/mixed; boundary=\"$boundary\"";
                $wire = "--$boundary\r\nContent-Type: multipart/alternative; boundary=\"$alt\"\r\n\r\n$altBody\r\n";
                foreach ($files as $a) {
                    $name = preg_replace('/[^A-Za-z0-9._-]/', '_', $a['name']);
                    $wire .= "--$boundary\r\nContent-Type: {$a['mime']}; name=\"$name\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"$name\"\r\n\r\n" . chunk_split(base64_encode($a['data'])) . "\r\n";
                }
                $wire .= "--$boundary--\r\n";
            }
            set_error_handler(static function (int $no, string $msg) use (&$error): bool { $error = $msg; return true; });
            try {
                $ok = mail($to, self::encode($subject), $wire, $headers, '-f' . $from);
            } finally {
                restore_error_handler();
            }
            $status = $ok ? 'sent' : 'failed';
            if (!$ok && !$error) {
                $error = 'mail() recusou a mensagem';
            }
        }
        $meta = array_map(static fn ($a) => ['name' => $a['name'], 'mime' => $a['mime'], 'path' => $a['path'] ?? null], $attachments);
        $ins = db()->prepare('INSERT INTO email_log (kind, to_addr, subject, related_type, related_id, status, error, body, attachments, lang, reply_to, resent_of, provider, provider_id, body_html) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id');
        $ins->execute([$kind, $to, $subject, $relatedType, $relatedId, $status, $error, $logBody ?? $body, json_encode($meta, JSON_UNESCAPED_UNICODE), $lang, $replyTo, $resentOf, (string) (config('mail.transport') ?: 'mail'), $providerId, $logHtml]);
        self::$lastId = (int) $ins->fetchColumn();
        return $status;
    }

    /** «a@x, b@y» → [a@x, b@y] (sem repetidos). */
    public static function split(string $to): array
    {
        return array_values(array_unique(array_filter(array_map('trim', explode(',', $to)), static fn ($a) => $a !== '')));
    }

    /** Destinatários dos avisos à equipa (pedidos de reserva, comprovativos): Definições → Canais de envio; sem lista, mail.team. */
    public static function team(): string
    {
        $s = setting('email_team');
        return !empty($s['recipients']) ? implode(', ', $s['recipients']) : (string) config('mail.team');
    }

    /** Reenvia um e-mail registado (mesmo destinatário, assunto, corpo e anexos guardados). */
    public static function resend(int $id): array
    {
        $s = db()->prepare('SELECT * FROM email_log WHERE id = ?');
        $s->execute([$id]);
        $e = $s->fetch() ?: throw new ApiError(404, 'not_found');
        if ($e['body'] === null) throw new ApiError(422, 'not_resendable');      // registos anteriores à Fase 7 não guardavam o corpo
        if (str_starts_with((string) $e['kind'], 'account_')) throw new ApiError(422, 'not_resendable');   // o link de reposição não fica registado: o cliente pede outro
        $att = array_values(array_filter(json_decode((string) $e['attachments'], true) ?: [], static fn ($a) => !empty($a['path'])));
        $status = self::send($e['kind'], $e['to_addr'], $e['subject'], $e['body'], $e['related_type'], $e['related_id'] !== null ? (int) $e['related_id'] : null, $e['reply_to'], $att, $e['lang'], $id, null, $e['body_html'] ?: null);
        return ['status' => $status, 'id' => self::$lastId];
    }

    /**
     * Resend (https://resend.com/docs/api-reference/emails/send-email): «sent» = aceite pelo Resend (id guardado);
     * a entrega final aparece no painel do Resend. Um 429 (limite de pedidos por segundo) é repetido uma vez.
     * @return array{0:string, 1:?string, 2:?string} [estado, erro, id do Resend]
     */
    private static function viaResend(array $to, string $subject, string $body, string $html, ?string $replyTo, array $files): array
    {
        $key = secret('RESEND_API_KEY', 'mail.resend_key');
        if ($key === '') return ['failed', 'Resend: chave em falta (RESEND_API_KEY ou mail.resend_key)', null];
        $payload = ['from' => config('mail.from_name') . ' <' . config('mail.from') . '>', 'to' => $to, 'subject' => $subject, 'html' => $html, 'text' => $body];
        if ($replyTo && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) $payload['reply_to'] = $replyTo;
        foreach ($files as $a) $payload['attachments'][] = ['filename' => preg_replace('/[^A-Za-z0-9._-]/', '_', $a['name']), 'content' => base64_encode($a['data'])];
        $url = (string) (config('mail.resend_url') ?: self::RESEND_URL);
        for ($try = 0; $try < 2; $try++) {
            $r = http_post_json($url, $payload, ['Authorization' => "Bearer $key"]);
            if ($r['status'] !== 429) break;
            usleep(1100000);
        }
        if ($r['status'] >= 200 && $r['status'] < 300 && !empty($r['body']['id'])) return ['sent', null, (string) $r['body']['id']];
        $msg = $r['error'] ?? (($r['body']['name'] ?? 'erro') . ': ' . ($r['body']['message'] ?? 'resposta inesperada'));
        return ['failed', utf8_cut("Resend HTTP {$r['status']} — $msg", 500), null];
    }

    /** Cabeçalho RFC 2047 (UTF-8, base64) — não depende de mbstring. */
    private static function encode(string $s): string
    {
        return preg_match('/[^\x20-\x7E]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
    }
}
