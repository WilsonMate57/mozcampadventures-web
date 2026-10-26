<?php
/**
 * MOZ CAMP ADVENTURES — api/src/Mailer.php
 * Envio de e-mail pelo servidor (mail() → sendmail/Postfix do Plesk)
 * com registo em email_log (corpo e anexos por caminho, para diagnóstico
 * e reenvio). Um envio só é dado como feito se mail() o aceitar; falhas
 * ficam registadas com o erro.
 * mail.transport = 'log' (desenvolvimento) regista sem enviar; nesse modo,
 * destinatários em domínios .invalid (RFC 2606) simulam falha, para testes.
 */

declare(strict_types=1);

final class Mailer
{
    public static ?int $lastId = null;   // id do último registo em email_log

    /**
     * @param list<array{name:string, mime:string, data?:string, path?:string}> $attachments
     * @return 'sent'|'failed'|'logged'
     */
    public static function send(string $kind, string $to, string $subject, string $body, ?string $relatedType = null, ?int $relatedId = null, ?string $replyTo = null, array $attachments = [], ?string $lang = null, ?int $resentOf = null): string
    {
        $status = 'failed';
        $error = null;
        $files = [];
        foreach ($attachments as $a) {
            $data = $a['data'] ?? (isset($a['path']) && is_file($a['path']) ? (string) file_get_contents($a['path']) : null);
            if ($data === null) {
                $error = 'anexo em falta: ' . $a['name'];
                continue;
            }
            $files[] = ['name' => $a['name'], 'mime' => $a['mime'], 'data' => $data];
        }
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            $error = 'endereço inválido';
        } elseif ($error !== null) {
            // anexo em falta: não enviar um e-mail incompleto
        } elseif (config('mail.transport') === 'log') {
            if (str_ends_with(strtolower($to), '.invalid')) {
                $error = 'falha simulada (modo de teste, domínio .invalid)';
            } else {
                $status = 'logged';
            }
        } else {
            $from = (string) config('mail.from');
            $headers = [
                'From' => self::encode((string) config('mail.from_name')) . " <$from>",
                'MIME-Version' => '1.0',
                'Content-Type' => 'text/plain; charset=UTF-8',
                'Content-Transfer-Encoding' => '8bit',
                'X-Mailer' => 'MCA-API/' . MCA_API_VERSION,
            ];
            if ($replyTo && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
                $headers['Reply-To'] = $replyTo;
            }
            $wire = $body;
            if ($files) {
                $boundary = 'mca-' . bin2hex(random_bytes(12));
                $headers['Content-Type'] = "multipart/mixed; boundary=\"$boundary\"";
                unset($headers['Content-Transfer-Encoding']);
                $wire = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n$body\r\n";
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
        $ins = db()->prepare('INSERT INTO email_log (kind, to_addr, subject, related_type, related_id, status, error, body, attachments, lang, reply_to, resent_of) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id');
        $ins->execute([$kind, $to, $subject, $relatedType, $relatedId, $status, $error, $body, json_encode($meta, JSON_UNESCAPED_UNICODE), $lang, $replyTo, $resentOf]);
        self::$lastId = (int) $ins->fetchColumn();
        return $status;
    }

    /** Reenvia um e-mail registado (mesmo destinatário, assunto, corpo e anexos guardados). */
    public static function resend(int $id): array
    {
        $s = db()->prepare('SELECT * FROM email_log WHERE id = ?');
        $s->execute([$id]);
        $e = $s->fetch() ?: throw new ApiError(404, 'not_found');
        if ($e['body'] === null) throw new ApiError(422, 'not_resendable');      // registos anteriores à Fase 7 não guardavam o corpo
        $att = array_values(array_filter(json_decode((string) $e['attachments'], true) ?: [], static fn ($a) => !empty($a['path'])));
        $status = self::send($e['kind'], $e['to_addr'], $e['subject'], $e['body'], $e['related_type'], $e['related_id'] !== null ? (int) $e['related_id'] : null, $e['reply_to'], $att, $e['lang'], $id);
        return ['status' => $status, 'id' => self::$lastId];
    }

    /** Cabeçalho RFC 2047 (UTF-8, base64) — não depende de mbstring. */
    private static function encode(string $s): string
    {
        return preg_match('/[^\x20-\x7E]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
    }
}
