<?php
/**
 * MOZ CAMP ADVENTURES — api/src/WhatsApp.php
 * Avisos à equipa pelo WhatsApp (Meta WhatsApp Cloud API) quando chega um pedido de reserva.
 *
 *  - Mensagens iniciadas pela empresa têm de usar um MODELO aprovado pela Meta (categoria «Utility»).
 *    Modelo esperado (ver docs/NOTIFICACOES.md §6.3): 7 variáveis no corpo —
 *    {{1}} referência · {{2}} experiência · {{3}} data · {{4}} pessoas · {{5}} cliente · {{6}} telefone · {{7}} total.
 *    Opcional (whatsapp.button = true): botão de URL dinâmico com a referência como sufixo.
 *  - Token em WHATSAPP_TOKEN (variável de ambiente) ou whatsapp.token; id do número em whatsapp.phone_number_id.
 *  - Números da equipa e interruptor: Definições → WhatsApp (settings «whatsapp»).
 *  - whatsapp.mode = 'log' (desenvolvimento) regista sem enviar.
 *  - «sent» = aceite pela Meta (wamid guardado); a entrega/leitura não é seguida (exigiria webhook).
 *  - Nunca bloqueia o pedido de reserva: falhas ficam em whatsapp_log.
 */

declare(strict_types=1);

final class WhatsApp
{
    private const API = 'https://graph.facebook.com';

    /** Estado da configuração (sem segredos), para o painel. */
    public static function status(): array
    {
        $s = setting('whatsapp');
        return ['configured' => self::configured(), 'mode' => config('whatsapp.mode') === 'log' ? 'log' : 'api',
            'template' => (string) (config('whatsapp.template') ?: 'nova_reserva'), 'language' => (string) (config('whatsapp.language') ?: 'pt_PT'),
            'phone_number_id' => self::mask((string) config('whatsapp.phone_number_id')), 'enabled' => !empty($s['enabled']), 'recipients' => $s['recipients'] ?? []];
    }

    private static function configured(): bool
    {
        return config('whatsapp.mode') === 'log' || (secret('WHATSAPP_TOKEN', 'whatsapp.token') !== '' && (string) config('whatsapp.phone_number_id') !== '');
    }

    private static function mask(string $v): string
    {
        return $v === '' ? '' : str_repeat('•', max(0, strlen($v) - 4)) . substr($v, -4);
    }

    /** Número em formato internacional só com algarismos; 9 algarismos começados por 8 = Moçambique (+258). */
    public static function normalize(string $n): ?string
    {
        $d = preg_replace('/\D/', '', $n) ?? '';
        if (str_starts_with($d, '00')) $d = substr($d, 2);
        if (strlen($d) === 9 && $d[0] === '8') $d = '258' . $d;
        return strlen($d) >= 10 && strlen($d) <= 15 ? $d : null;
    }

    /** Parâmetros de texto: a Meta recusa quebras de linha, tabulações e mais de 4 espaços seguidos. */
    private static function param(string $s): string
    {
        $s = trim((string) preg_replace('/\s+/u', ' ', $s));
        return utf8_cut($s === '' ? '—' : $s, 250);
    }

    /** Novo pedido de reserva → mensagem a cada número da equipa. Devolve os estados por número. */
    public static function bookingTeam(string $ref, int $bookingId, string $item, string $when, string $pax, string $name, string $phone, string $total): array
    {
        $s = setting('whatsapp');
        if (empty($s['enabled']) || empty($s['recipients'])) return [];
        $out = [];
        foreach ($s['recipients'] as $to) {
            $out[$to] = self::send('booking_team', $to, [$ref, $item, $when, $pax, $name, $phone, $total], $ref, 'booking', $bookingId);
        }
        return $out;
    }

    /** Mensagem de teste (Definições) com dados fictícios, para validar o modelo e os números. */
    public static function test(array $u): array
    {
        $s = setting('whatsapp');
        if (empty($s['recipients'])) throw new ApiError(422, 'whatsapp_no_recipients');
        if (!self::configured()) throw new ApiError(422, 'whatsapp_not_configured');
        $out = [];
        foreach ($s['recipients'] as $to) {
            $st = self::send('test', $to, ['MCA-TESTE', 'Mensagem de teste do painel', date('Y-m-d'), '2', $u['name'], '+258 84 000 0000', '0 MZN'], 'MCA-TESTE');
            $out[] = ['to' => $to, 'status' => $st, 'error' => $st === 'failed' ? self::$lastError : null];
        }
        Audit::log('whatsapp_test', 'settings', 'whatsapp', ['results' => array_map(fn ($r) => $r['status'], $out)]);
        return ['results' => $out];
    }

    private static ?string $lastError = null;

    private static function send(string $kind, string $to, array $params, string $buttonSuffix, ?string $relatedType = null, ?int $relatedId = null): string
    {
        $template = (string) (config('whatsapp.template') ?: 'nova_reserva');
        $params = array_map([self::class, 'param'], $params);
        $status = 'failed';
        $error = null;
        $wamid = null;
        if (config('whatsapp.mode') === 'log') {
            $status = 'logged';
        } elseif (!self::configured()) {
            $error = 'WhatsApp não configurado (WHATSAPP_TOKEN e whatsapp.phone_number_id)';
        } else {
            $components = [['type' => 'body', 'parameters' => array_map(static fn ($p) => ['type' => 'text', 'text' => $p], $params)]];
            if (config('whatsapp.button')) $components[] = ['type' => 'button', 'sub_type' => 'url', 'index' => '0', 'parameters' => [['type' => 'text', 'text' => $buttonSuffix]]];
            $payload = ['messaging_product' => 'whatsapp', 'recipient_type' => 'individual', 'to' => $to, 'type' => 'template',
                'template' => ['name' => $template, 'language' => ['code' => (string) (config('whatsapp.language') ?: 'pt_PT')], 'components' => $components]];
            $url = rtrim((string) (config('whatsapp.api_base') ?: self::API), '/') . '/' . (config('whatsapp.api_version') ?: 'v21.0') . '/' . rawurlencode((string) config('whatsapp.phone_number_id')) . '/messages';
            $r = http_post_json($url, $payload, ['Authorization' => 'Bearer ' . secret('WHATSAPP_TOKEN', 'whatsapp.token')]);
            if ($r['status'] >= 200 && $r['status'] < 300 && !empty($r['body']['messages'][0]['id'])) {
                $status = 'sent';
                $wamid = (string) $r['body']['messages'][0]['id'];
            } else {
                $e = $r['body']['error'] ?? [];
                $error = utf8_cut('Meta HTTP ' . $r['status'] . ' — ' . ($r['error'] ?? (($e['code'] ?? '?') . ': ' . ($e['error_data']['details'] ?? $e['message'] ?? 'resposta inesperada'))), 500);
            }
        }
        self::$lastError = $error;
        db()->prepare('INSERT INTO whatsapp_log (kind, to_number, template, params, related_type, related_id, status, error, provider_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$kind, $to, $template, json_encode($params, JSON_UNESCAPED_UNICODE), $relatedType, $relatedId, $status, $error, $wamid]);
        return $status;
    }

    /** Registo para o painel (E-mails e WhatsApp). */
    public static function log(): array
    {
        $rows = db()->query('SELECT id, kind, to_number, template, params, related_type, related_id, status, error, provider_id, created_at FROM whatsapp_log ORDER BY id DESC LIMIT 200')->fetchAll();
        return ['messages' => array_map(static fn ($r) => ['params' => json_decode((string) $r['params'], true)] + $r, $rows), 'status' => self::status()];
    }

    /** Definições → WhatsApp: interruptor e números da equipa (até 5). */
    public static function saveSettings(array $in): array
    {
        $nums = [];
        foreach (array_slice(is_array($in['recipients'] ?? null) ? $in['recipients'] : [], 0, 5) as $n) {
            if (!is_string($n) || trim($n) === '') continue;
            $d = self::normalize($n) ?? throw new ApiError(422, 'whatsapp_invalid_number', '', ['number' => clean_text($n, 30)]);
            if (!in_array($d, $nums, true)) $nums[] = $d;
        }
        $enabled = !empty($in['enabled']);
        if ($enabled && !$nums) throw new ApiError(422, 'whatsapp_no_recipients');
        return ['enabled' => $enabled, 'recipients' => $nums];
    }
}
