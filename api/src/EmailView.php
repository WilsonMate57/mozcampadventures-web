<?php
/**
 * MOZ CAMP ADVENTURES — api/src/EmailView.php
 * Layout HTML dos e-mails, com a identidade da marca (turquesa, azul, amarelo e laranja; Inter;
 * saudação em Dancing Script). Tabelas e estilos em linha, para o Gmail, Outlook e Apple Mail;
 * 600 px, fluido no telemóvel. A versão em texto continua a ser enviada (multipart/alternative).
 *
 *  - render($o): blocos (estado, imagem, saudação, título, parágrafos, cartão-resumo, passos,
 *    botões, aviso, formas de pagamento, ajuda, rodapé).
 *  - fromText($text): qualquer e-mail em texto ganha o mesmo layout (convites, palavra-passe, testes).
 *  - Modelos: bookingReceived, teamBooking, notification, invoice.
 * Imagens: assets/images/_email/ (scripts/email-images.mjs), servidas a partir de app.site_url.
 */

declare(strict_types=1);

final class EmailView
{
    private const C = ['teal' => '#00c6c1', 'tealDark' => '#00807d', 'blue' => '#3c9bb6', 'yellow' => '#ffbe06', 'orange' => '#ff9a08',
        'ink' => '#1b2122', 'text' => '#4a5556', 'mute' => '#6b7678', 'line' => '#e3ecec', 'bg' => '#eef4f4', 'soft' => '#f4fafa', 'footer' => '#1e1e2e'];
    private const TONE = ['info' => ['#e6f7f6', '#00615e'], 'ok' => ['#e7f6ec', '#1b6e3c'], 'warn' => ['#fff4d6', '#7a5200'], 'bad' => ['#fdecec', '#a12626'], 'neutral' => ['#eef1f2', '#4a5556']];
    private const FONT = "'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
    private const SCRIPT = "'Dancing Script','Segoe Script',Georgia,serif";
    private const WA = '258844406543';
    private const MONTHS = ['pt' => ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
        'en' => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']];
    private const DAYS = ['pt' => ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
        'en' => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']];

    private static function lower(string $s): string
    {
        return strtr(strtolower($s), ['Ó' => 'ó', 'É' => 'é', 'Á' => 'á']);
    }

    private static function e(mixed $s): string
    {
        return htmlspecialchars((string) $s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    private static function site(): string
    {
        return rtrim((string) config('app.site_url'), '/');
    }

    /** URL absoluto de uma imagem de e-mail (com versão, para não ficar em cache depois de mudar). */
    public static function asset(string $file): ?string
    {
        $path = dirname(__DIR__, 2) . '/assets/images/_email/' . $file;
        return is_file($path) ? self::site() . '/assets/images/_email/' . rawurlencode($file) . '?v=' . substr(md5((string) filemtime($path)), 0, 6) : null;
    }

    public static function itemImage(?string $slug): ?string
    {
        return ($slug && preg_match('/^[a-z0-9-]+$/', $slug) ? self::asset("$slug.jpg") : null) ?? self::asset('default.jpg');
    }

    /** «sábado, 14 de novembro de 2026» / «Saturday, 14 November 2026» (sem depender da extensão intl). */
    public static function date(?string $iso, string $lang, bool $weekday = true): string
    {
        if (!$iso || !($t = strtotime($iso))) return '—';
        $l = $lang === 'en' ? 'en' : 'pt';
        $d = (int) date('j', $t);
        $m = self::MONTHS[$l][(int) date('n', $t) - 1];
        $y = date('Y', $t);
        $s = $l === 'en' ? "$d $m $y" : "$d de $m de $y";
        return $weekday ? self::DAYS[$l][(int) date('w', $t)] . ', ' . $s : $s;
    }

    /* ── Layout ─────────────────────────────────────────── */

    /**
     * @param array{lang?:string, preheader?:string, status?:array{0:string,1:string}, image?:?string, imageAlt?:string, greeting?:string, title?:string,
     *   paras?:list<string>, card?:array, steps?:list<array{0:string,1:string}>, cta?:array{0:string,1:string}, secondary?:list<array{0:string,1:string,2?:string}>,
     *   notice?:array{0:string,1?:string}, payment?:list<array{0:string,1:string}>, help?:bool, ref?:?string, footerNote?:string, team?:bool} $o
     */
    public static function render(array $o): string
    {
        $c = self::C;
        $lang = ($o['lang'] ?? 'pt') === 'en' ? 'en' : 'pt';
        $en = $lang === 'en';
        $f = self::FONT;
        $logo = self::asset('logo.png');
        $logoW = self::asset('logo-white.png');
        $site = self::site();
        $h = '';

        if (!empty($o['image'])) {
            $h .= '<tr><td style="padding:0;line-height:0;font-size:0"><img src="' . self::e($o['image']) . '" width="600" alt="' . self::e($o['imageAlt'] ?? '') . '" style="display:block;width:100%;max-width:600px;height:auto;border:0;background:' . $c['bg'] . '"></td></tr>';
        }
        $body = '';
        if (!empty($o['status'])) {
            [$bg, $fg] = self::TONE[$o['status'][1]] ?? self::TONE['info'];
            $body .= '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px"><tr><td style="background:' . $bg . ';color:' . $fg . ';font:700 11px/1 ' . $f . ';letter-spacing:.12em;text-transform:uppercase;padding:8px 12px;border-radius:999px">' . self::e($o['status'][0]) . '</td></tr></table>';
        }
        if (!empty($o['greeting'])) {
            $body .= '<p style="margin:0 0 4px;font-family:' . self::SCRIPT . ';font-size:30px;line-height:1.2;font-weight:700;color:' . $c['tealDark'] . '">' . self::e($o['greeting']) . '</p>';
        }
        if (!empty($o['title'])) {
            $body .= '<h1 style="margin:0 0 14px;font:700 24px/1.3 ' . $f . ';color:' . $c['ink'] . ';letter-spacing:-.01em">' . self::e($o['title']) . '</h1>';
        }
        foreach ($o['paras'] ?? [] as $p) $body .= self::para($p);
        if (!empty($o['card'])) $body .= self::card($o['card'], $lang);
        if (!empty($o['payment'])) $body .= self::payment($o['payment'], $en ? 'How to pay' : 'Como pagar');
        if (!empty($o['notice'])) {
            [$nbg, $nfg, $nbar] = ($o['notice'][1] ?? 'warn') === 'info' ? ['#eef7fa', '#1d4f63', $c['blue']] : ['#fff8e6', '#6b4a00', $c['yellow']];
            $body .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0"><tr><td style="background:' . $nbg . ';border-left:4px solid ' . $nbar . ';border-radius:8px;padding:14px 16px;font:400 14px/1.55 ' . $f . ';color:' . $nfg . '">' . self::inline($o['notice'][0]) . '</td></tr></table>';
        }
        if (!empty($o['cta']) || !empty($o['secondary'])) {
            $body .= '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 4px"><tr class="btns">';
            if (!empty($o['cta'])) $body .= '<td style="padding:0 10px 10px 0">' . self::button($o['cta'][0], $o['cta'][1], $c['tealDark'], '#ffffff') . '</td>';
            foreach ($o['secondary'] ?? [] as $s) {
                $body .= '<td style="padding:0 10px 10px 0">' . self::button($s[0], $s[1], ($s[2] ?? '') === 'wa' ? '#128c4a' : '#ffffff', ($s[2] ?? '') === 'wa' ? '#ffffff' : $c['tealDark'], ($s[2] ?? '') === 'wa' ? null : $c['tealDark']) . '</td>';
            }
            $body .= '</tr></table>';
        }
        if (!empty($o['steps'])) $body .= self::steps($o['steps'], $en ? 'What happens next' : 'Próximos passos');
        $h .= '<tr><td class="px" style="padding:34px 40px 30px;background:#ffffff">' . $body . '</td></tr>';

        if ($o['help'] ?? true) {
            $wa = 'https://wa.me/' . self::WA . (!empty($o['ref']) ? '?text=' . rawurlencode(($en ? 'Hello, about booking ' : 'Olá, sobre o pedido ') . $o['ref']) : '');
            $h .= '<tr><td class="px" style="padding:0 40px 30px;background:#ffffff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ' . $c['line'] . '"><tr>'
                . '<td style="padding:22px 0 0;font:400 14px/1.6 ' . $f . ';color:' . $c['text'] . '"><strong style="color:' . $c['ink'] . '">' . ($en ? 'Questions? We are here to help.' : 'Dúvidas? Estamos aqui para ajudar.') . '</strong><br>'
                . 'WhatsApp <a href="' . self::e($wa) . '" style="color:' . $c['tealDark'] . ';font-weight:600;text-decoration:none">+258 84 440 6543</a> &nbsp;·&nbsp; '
                . '<a href="mailto:booking@mozcampadventures.co.mz" style="color:' . $c['tealDark'] . ';font-weight:600;text-decoration:none">booking@mozcampadventures.co.mz</a>'
                . (!empty($o['ref']) ? '<br><span style="color:' . $c['mute'] . ';font-size:13px">' . ($en ? 'Please quote your reference ' : 'Indique a referência ') . '<strong>' . self::e($o['ref']) . '</strong>.</span>' : '')
                . '</td></tr></table></td></tr>';
        }

        $stripe = '<tr><td style="padding:0;line-height:0;font-size:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
            . '<td width="40%" height="5" style="background:' . $c['teal'] . ';height:5px;line-height:5px;font-size:0">&nbsp;</td><td width="25%" height="5" style="background:' . $c['blue'] . ';height:5px;line-height:5px;font-size:0">&nbsp;</td>'
            . '<td width="20%" height="5" style="background:' . $c['yellow'] . ';height:5px;line-height:5px;font-size:0">&nbsp;</td><td width="15%" height="5" style="background:' . $c['orange'] . ';height:5px;line-height:5px;font-size:0">&nbsp;</td></tr></table></td></tr>';

        $footer = '<tr><td class="px" style="background:' . $c['footer'] . ';padding:30px 40px;text-align:center;border-radius:0 0 14px 14px">'
            . ($logoW ? '<img src="' . self::e($logoW) . '" width="64" height="64" alt="Moz Camp Adventures" style="display:inline-block;width:64px;height:auto;border:0;opacity:.9">' : '')
            . '<p style="margin:12px 0 4px;font-family:' . self::SCRIPT . ';font-size:20px;color:' . $c['teal'] . '">' . ($en ? 'Islands, ocean and safaris from Maputo' : 'Ilhas, oceano e safaris a partir de Maputo') . '</p>'
            . '<p style="margin:0 0 14px;font:400 13px/1.6 ' . $f . ';color:rgba(255,255,255,.72)">Marina, Escola Náutica · ' . ($en ? 'Maputo, Mozambique' : 'Cidade de Maputo, Moçambique') . '<br>+258 84 440 6543 · booking@mozcampadventures.co.mz</p>'
            . '<p style="margin:0 0 16px;font:600 13px/1 ' . $f . '">'
            . '<a href="' . $site . ($en ? '/en/' : '/') . '" style="color:#ffffff;text-decoration:none">mozcampadventures.co.mz</a>&nbsp;&nbsp;<span style="color:rgba(255,255,255,.35)">|</span>&nbsp;&nbsp;'
            . '<a href="https://www.instagram.com/moz__camp_adventures_official/" style="color:#ffffff;text-decoration:none">Instagram</a>&nbsp;&nbsp;<span style="color:rgba(255,255,255,.35)">|</span>&nbsp;&nbsp;'
            . '<a href="https://www.facebook.com/mozcampadventures" style="color:#ffffff;text-decoration:none">Facebook</a></p>'
            . '<p style="margin:0;font:400 11.5px/1.6 ' . $f . ';color:rgba(255,255,255,.5)">' . self::e($o['footerNote'] ?? ($en ? 'You are receiving this e-mail about a request made at mozcampadventures.co.mz.' : 'Recebeu este e-mail sobre um pedido feito em mozcampadventures.co.mz.')) . '</p>'
            . '</td></tr>';

        $pre = self::e($o['preheader'] ?? '');
        return '<!DOCTYPE html><html lang="' . $lang . '" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>Moz Camp Adventures</title>'
            . '<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">'
            . '<style>body{margin:0;padding:0;background:' . $c['bg'] . '}a{color:' . $c['tealDark'] . '}img{-ms-interpolation-mode:bicubic}'
            . '@media (max-width:620px){.wrap{width:100%!important}.px{padding-left:22px!important;padding-right:22px!important}.stack td{display:block!important;width:100%!important;text-align:left!important;padding-right:0!important}.big{font-size:20px!important}.btns td{display:block!important;padding-right:0!important}.btns a{display:block!important;text-align:center!important;white-space:normal!important}.btns table{width:100%!important}}</style></head>'
            . '<body style="margin:0;padding:0;background:' . $c['bg'] . '">'
            . '<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">' . $pre . str_repeat('&#847;&zwnj;&nbsp;', 40) . '</div>'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' . $c['bg'] . '"><tr><td align="center" style="padding:28px 12px">'
            . '<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(16,40,40,.06)">'
            . '<tr><td align="center" style="padding:24px 24px 18px;background:#ffffff">' . ($logo ? '<a href="' . $site . ($en ? '/en/' : '/') . '"><img src="' . self::e($logo) . '" width="96" height="96" alt="Moz Camp Adventures" style="display:block;width:96px;height:auto;border:0"></a>' : '<strong style="font:700 18px ' . $f . ';color:' . $c['ink'] . '">Moz Camp Adventures</strong>') . '</td></tr>'
            . $stripe . $h . $footer
            . '</table></td></tr></table></body></html>';
    }

    /** Texto simples → HTML: escapa, liga URLs e e-mails, **negrito**. */
    private static function inline(string $s): string
    {
        $s = self::e($s);
        $s = preg_replace('#\*\*(.+?)\*\*#u', '<strong style="color:' . self::C['ink'] . '">$1</strong>', $s) ?? $s;
        $s = preg_replace('#(https?://[^\s<]+)#u', '<a href="$1" style="color:' . self::C['tealDark'] . ';word-break:break-all">$1</a>', $s) ?? $s;
        return nl2br($s, false);
    }

    private static function para(string $p): string
    {
        $lines = array_values(array_filter(explode("\n", $p), static fn ($l) => trim($l) !== ''));
        if ($lines && count(array_filter($lines, static fn ($l) => str_starts_with(trim($l), '•') || str_starts_with(trim($l), '- '))) === count($lines)) {
            return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px">' . implode('', array_map(static fn ($l) => '<tr><td width="18" valign="top" style="color:' . self::C['teal'] . ';font:700 15px/1.6 ' . self::FONT . '">•</td><td style="font:400 15px/1.6 ' . self::FONT . ';color:' . self::C['text'] . '">' . self::inline(ltrim(trim($l), '•- ')) . '</td></tr>', $lines)) . '</table>';
        }
        return '<p style="margin:0 0 14px;font:400 15px/1.65 ' . self::FONT . ';color:' . self::C['text'] . '">' . self::inline($p) . '</p>';
    }

    private static function button(string $label, string $url, string $bg, string $fg, ?string $border = null): string
    {
        $b = $border ? "border:2px solid $border;" : "border:2px solid $bg;";
        return '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:10px;background:' . $bg . '">'
            . '<a href="' . self::e($url) . '" style="display:inline-block;padding:13px 24px;' . $b . 'border-radius:10px;background:' . $bg . ';color:' . $fg . ';font:700 15px/1.2 ' . self::FONT . ';text-decoration:none;white-space:nowrap">' . self::e($label) . '</a></td></tr></table>';
    }

    /** Cartão-resumo: referência em destaque, linhas «chave: valor», linhas de preço e total. */
    private static function card(array $k, string $lang): string
    {
        $c = self::C;
        $f = self::FONT;
        $h = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px;background:' . $c['soft'] . ';border:1px solid #d7ecea;border-radius:12px"><tr><td style="padding:20px 22px">';
        if (!empty($k['ref'])) {
            $h .= '<p style="margin:0;font:700 11px/1 ' . $f . ';letter-spacing:.14em;text-transform:uppercase;color:' . $c['mute'] . '">' . self::e($k['refLabel'] ?? ($lang === 'en' ? 'Reference' : 'Referência')) . '</p>'
                . '<p class="big" style="margin:6px 0 14px;font:700 24px/1.2 ' . $f . ';letter-spacing:.04em;color:' . $c['ink'] . '">' . self::e($k['ref']) . '</p>';
        }
        if (!empty($k['title'])) $h .= '<p style="margin:0 0 10px;font:700 16px/1.35 ' . $f . ';color:' . $c['ink'] . '">' . self::e($k['title']) . '</p>';
        $h .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">';
        foreach ($k['rows'] ?? [] as [$label, $value]) {
            if ($value === null || $value === '') continue;
            $h .= '<tr class="stack"><td width="38%" valign="top" style="padding:9px 12px 9px 0;border-top:1px solid ' . $c['line'] . ';font:400 13.5px/1.5 ' . $f . ';color:' . $c['mute'] . '">' . self::e($label) . '</td>'
                . '<td valign="top" style="padding:9px 0;border-top:1px solid ' . $c['line'] . ';font:600 14.5px/1.5 ' . $f . ';color:' . $c['ink'] . '">' . self::inline((string) $value) . '</td></tr>';
        }
        $h .= '</table>';
        if (!empty($k['lines'])) {
            $h .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px">';
            foreach ($k['lines'] as [$label, $amount]) {
                $h .= '<tr><td style="padding:5px 12px 5px 0;font:400 13.5px/1.5 ' . $f . ';color:' . $c['text'] . '">' . self::e($label) . '</td><td align="right" style="padding:5px 0;font:600 13.5px/1.5 ' . $f . ';color:' . $c['ink'] . ';white-space:nowrap">' . self::e($amount) . '</td></tr>';
            }
            $h .= '</table>';
        }
        if (!empty($k['total'])) {
            $h .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;border-top:2px solid ' . $c['teal'] . '"><tr>'
                . '<td style="padding:14px 12px 0 0;font:700 14px/1.4 ' . $f . ';color:' . $c['ink'] . '">' . self::e($k['total'][0]) . (!empty($k['total'][2]) ? '<br><span style="font-weight:400;font-size:12.5px;color:' . $c['mute'] . '">' . self::e($k['total'][2]) . '</span>' : '') . '</td>'
                . '<td align="right" valign="top" class="big" style="padding:12px 0 0;font:700 24px/1.2 ' . $f . ';color:' . $c['tealDark'] . ';white-space:nowrap">' . self::e($k['total'][1]) . '</td></tr></table>';
        }
        return $h . '</td></tr></table>';
    }

    private static function steps(array $steps, string $title): string
    {
        $c = self::C;
        $f = self::FONT;
        $h = '<p style="margin:26px 0 12px;font:700 16px/1.3 ' . $f . ';color:' . $c['ink'] . '">' . self::e($title) . '</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">';
        foreach (array_values($steps) as $i => [$t, $d]) {
            $h .= '<tr><td width="44" valign="top" style="padding:0 0 14px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="30" height="30" align="center" style="width:30px;height:30px;border-radius:15px;background:' . ($i === 0 ? $c['teal'] : '#e0f5f4') . ';color:' . ($i === 0 ? '#ffffff' : $c['tealDark']) . ';font:700 14px/30px ' . $f . '">' . ($i + 1) . '</td></tr></table></td>'
                . '<td valign="top" style="padding:3px 0 14px;font:400 14px/1.55 ' . $f . ';color:' . $c['text'] . '"><strong style="color:' . $c['ink'] . ';font-size:14.5px">' . self::e($t) . '</strong><br>' . self::e($d) . '</td></tr>';
        }
        return $h . '</table>';
    }

    private static function payment(array $methods, string $title): string
    {
        $c = self::C;
        $f = self::FONT;
        $h = '<p style="margin:26px 0 10px;font:700 16px/1.3 ' . $f . ';color:' . $c['ink'] . '">' . self::e($title) . '</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ' . $c['line'] . ';border-radius:12px">';
        foreach (array_values($methods) as $i => [$name, $detail]) {
            $h .= '<tr class="stack"><td width="34%" valign="top" style="padding:12px 14px;' . ($i ? 'border-top:1px solid ' . $c['line'] . ';' : '') . 'font:700 14px/1.5 ' . $f . ';color:' . $c['ink'] . '">' . self::e($name) . '</td>'
                . '<td valign="top" style="padding:12px 14px;' . ($i ? 'border-top:1px solid ' . $c['line'] . ';' : '') . 'font:400 14px/1.5 ' . $f . ';color:' . $c['text'] . '">' . self::inline($detail) . '</td></tr>';
        }
        return $h . '</table>';
    }

    /* ── Qualquer e-mail em texto, com o mesmo layout ─────── */

    public static function fromText(string $text, string $subject, ?string $lang = null): string
    {
        $paras = preg_split('/\n\s*\n/', trim(str_replace("\r", '', $text))) ?: [];
        $greeting = null;
        if ($paras && preg_match('/^(Olá|Hello)\s+([^,\n]{1,60}),\s*$/u', trim($paras[0]), $m)) {
            $greeting = $m[1] . ', ' . $m[2] . '!';
            array_shift($paras);
        }
        /* Assinatura em texto: o rodapé do layout já a mostra */
        $paras = array_values(array_filter($paras, static fn ($p) => !preg_match('/^(Moz Camp Adventures|Obrigado,\s*\nMoz Camp|Thank you,\s*\nMoz Camp)/u', trim($p))));
        $cta = null;
        foreach ($paras as $i => $p) {          // primeiro link sozinho numa linha → botão
            $lines = explode("\n", trim($p));
            $last = trim((string) end($lines));
            if ($cta === null && preg_match('#^https?://\S+$#', $last)) {
                $label = count($lines) > 1 ? rtrim(trim($lines[count($lines) - 2]), ':') : '';
                $cta = [self::ctaLabel($last, $lang ?? lang_of(null)), $last];
                array_pop($lines);
                $paras[$i] = implode("\n", $lines);
                if ($label !== '' && trim($paras[$i]) === '') unset($paras[$i]);
            }
        }
        return self::render(['lang' => $lang ?? 'pt', 'preheader' => $subject, 'greeting' => $greeting, 'title' => preg_replace('/\s+—\s+Moz Camp Adventures$/u', '', $subject),
            'paras' => array_values(array_filter($paras, static fn ($p) => trim($p) !== '')), 'cta' => $cta, 'help' => true,
            'footerNote' => ($lang === 'en') ? 'Moz Camp Adventures · Maputo, Mozambique' : 'Moz Camp Adventures · Maputo, Moçambique']);
    }

    private static function ctaLabel(string $url, string $lang): string
    {
        $en = $lang === 'en';
        return match (true) {
            str_contains($url, 'definir-senha') => $en ? 'Set password' : 'Definir palavra-passe',
            str_contains($url, '#reset=') => $en ? 'Choose a new password' : 'Escolher nova palavra-passe',
            str_contains($url, '/pagamento') => $en ? 'Send proof of payment' : 'Enviar comprovativo',
            str_contains($url, '/reserva/') || str_contains($url, '/booking/') => $en ? 'View my booking' : 'Ver a minha reserva',
            str_contains($url, '/admin') => $en ? 'Open the panel' : 'Abrir o painel',
            default => $en ? 'Open link' : 'Abrir link',
        };
    }

    /* ── Modelos ────────────────────────────────────────── */

    /** Cliente: pedido de reserva recebido. $d: name, ref, item, slug, when, pax, lines[[label, amount]], total, to_confirm, area, lang */
    public static function bookingReceived(array $d): string
    {
        $en = $d['lang'] === 'en';
        $first = strtok((string) $d['name'], ' ') ?: $d['name'];
        return self::render([
            'lang' => $d['lang'], 'ref' => $d['ref'], 'image' => self::itemImage($d['slug'] ?? null), 'imageAlt' => $d['item'],
            'preheader' => $en ? "We received your request {$d['ref']} — our team will confirm availability shortly." : "Recebemos o seu pedido {$d['ref']} — a nossa equipa vai confirmar a disponibilidade em breve.",
            'status' => [$en ? 'Request received' : 'Pedido recebido', 'warn'],
            'greeting' => ($en ? 'Hello, ' : 'Olá, ') . $first . '!',
            'title' => $en ? 'Thank you — we have your booking request' : 'Obrigado! Recebemos o seu pedido de reserva',
            'paras' => [$en ? "Your request for **{$d['item']}** is with our team. We will confirm availability and send you the invoice with payment instructions."
                : "O seu pedido para **{$d['item']}** já está com a nossa equipa. Vamos confirmar a disponibilidade e enviar-lhe a factura com as instruções de pagamento."],
            'card' => ['ref' => $d['ref'], 'rows' => [[$en ? 'Experience' : 'Experiência', $d['item']], [$en ? 'Date' : 'Data', $d['when']], [$en ? 'Guests' : 'Participantes', $d['pax']]],
                'lines' => $d['lines'], 'total' => [$en ? 'Estimated total' : 'Total estimado', $d['total'], $d['to_confirm'] ? ($en ? 'To be confirmed by our team' : 'A confirmar pela equipa') : ($en ? 'Final amount on the invoice' : 'Valor final na factura')]],
            'steps' => $en ? [['We confirm availability', 'Our team checks the date and places for your group.'], ['You receive the invoice', 'With payment options: M-Pesa, e-Mola or bank transfer.'], ['Your booking is secured', 'Once payment is confirmed, you receive the final confirmation and receipt.']]
                : [['Confirmamos a disponibilidade', 'A nossa equipa verifica a data e os lugares para o seu grupo.'], ['Recebe a factura', 'Com as formas de pagamento: M-Pesa, e-Mola ou transferência bancária.'], ['Reserva garantida', 'Depois de confirmado o pagamento, recebe a confirmação final e o recibo.']],
            'notice' => [$en ? 'This is a **request**, not yet a confirmed booking.' : 'Isto é um **pedido**, ainda não é uma reserva confirmada.'],
            'cta' => [$en ? 'Follow my request' : 'Acompanhar o meu pedido', $d['area']],
        ]);
    }

    /** Equipa: novo pedido. $d: ref, item, slug, when, pax, lines, total, to_confirm, name, phone, email, message, lang */
    public static function teamBooking(array $d): string
    {
        $digits = preg_replace('/\D/', '', (string) $d['phone']) ?? '';
        if (strlen($digits) === 9 && $digits[0] === '8') $digits = '258' . $digits;
        $first = strtok((string) $d['name'], ' ') ?: $d['name'];
        $waText = ($d['lang'] === 'en' ? "Hello $first, this is Moz Camp Adventures about your booking request {$d['ref']} ({$d['item']})." : "Olá $first, fala a Moz Camp Adventures sobre o seu pedido {$d['ref']} ({$d['item']}).");
        $secondary = [];
        if (strlen($digits) >= 10) $secondary[] = ['WhatsApp do cliente', 'https://wa.me/' . $digits . '?text=' . rawurlencode($waText), 'wa'];
        if (!empty($d['email'])) $secondary[] = ['Responder por e-mail', 'mailto:' . $d['email'] . '?subject=' . rawurlencode("Pedido {$d['ref']} — {$d['item']}")];
        return self::render([
            'lang' => 'pt', 'ref' => null, 'help' => false, 'image' => self::itemImage($d['slug'] ?? null), 'imageAlt' => $d['item'],
            'preheader' => "Novo pedido {$d['ref']}: {$d['item']}, {$d['when']}, {$d['pax']} — {$d['name']}",
            'status' => ['Novo pedido de reserva', 'warn'], 'title' => $d['item'],
            'paras' => ['Um cliente fez um pedido no site. Confirme a disponibilidade e responda ao cliente; depois, confirme a reserva e emita a factura no painel.'],
            'card' => ['ref' => $d['ref'], 'rows' => [['Data', $d['when']], ['Participantes', $d['pax']], ['Cliente', $d['name']], ['Telefone', $d['phone']], ['E-mail', $d['email'] ?: '—'],
                ['Idioma', $d['lang'] === 'en' ? 'Inglês' : 'Português'], ['Mensagem', $d['message'] ?: null]],
                'lines' => $d['lines'], 'total' => ['Total estimado', $d['total'], $d['to_confirm'] ? 'Parte do valor a confirmar' : 'Calculado com as tarifas publicadas']],
            'cta' => ['Abrir no painel', self::site() . '/admin/#/reservas/' . $d['ref']], 'secondary' => $secondary,
            'footerNote' => 'Aviso automático do site para a equipa da Moz Camp Adventures.',
        ]);
    }

    private const NOTIF = [
        'booking_confirmed' => ['ok', 'Reserva confirmada', 'Booking confirmed', 'A sua reserva está confirmada!', 'Your booking is confirmed!'],
        'booking_cancelled' => ['bad', 'Reserva cancelada', 'Booking cancelled', 'A sua reserva foi cancelada', 'Your booking has been cancelled'],
        'booking_completed' => ['info', 'Obrigado', 'Thank you', 'Obrigado por viajar connosco', 'Thank you for travelling with us'],
        'payment_confirmed' => ['ok', 'Pagamento recebido', 'Payment received', 'Recebemos o seu pagamento', 'We received your payment'],
        'payment_refused' => ['bad', 'Comprovativo não confirmado', 'Proof not confirmed', 'Não conseguimos confirmar o pagamento', 'We could not confirm your payment'],
        'payment_reversed' => ['bad', 'Pagamento anulado', 'Payment cancelled', 'Um pagamento foi anulado', 'A payment has been cancelled'],
        'refund' => ['info', 'Reembolso', 'Refund', 'Reembolso efectuado', 'Refund issued'],
        'invoice_voided' => ['neutral', 'Factura anulada', 'Invoice cancelled', 'A factura foi anulada', 'The invoice has been cancelled'],
    ];

    /** Notificações ao cliente (Notify::deliver). $body = texto já preenchido; $b = reserva; $v = variáveis. */
    public static function notification(string $type, string $lang, array $b, string $body, array $v): string
    {
        $en = $lang === 'en';
        $n = self::NOTIF[$type] ?? ['info', $type, $type, $type, $type];
        $first = strtok((string) ($v['name'] ?? $b['customer_name']), ' ') ?: ($v['name'] ?? '');
        $isBooking = str_starts_with($type, 'booking_');
        $review = $v['review'] ?? null;
        /* Corpo: o texto do modelo, sem os links que passam a botões */
        $paras = array_values(array_filter(array_map(static function ($p) use ($review) {
            $lines = array_filter(explode("\n", $p), static fn ($l) => trim($l) !== '' && trim($l) !== $review);
            return implode("\n", $lines);
        }, preg_split('/\n\s*\n/', trim($body)) ?: []), static fn ($p) => trim($p) !== ''));
        $pax = (int) ($b['adults'] ?? 0) + (int) ($b['children'] ?? 0);
        $paxTxt = $pax ? $pax . ' (' . (int) $b['adults'] . ($en ? ' adults' : ' adultos') . ((int) $b['children'] ? ', ' . (int) $b['children'] . ($en ? ' children' : ' crianças') : '') . ')' : null;
        $when = $b['service_date'] ? self::date($b['service_date'], $lang) : self::date($b['checkin'], $lang, false) . ' – ' . self::date($b['checkout'], $lang, false);
        $rows = [[$en ? 'Experience' : 'Experiência', $b['item_name']], [$en ? 'Date' : 'Data', $when], [$en ? 'Guests' : 'Participantes', $paxTxt]];
        if (!empty($v['invoice'])) array_unshift($rows, [$en ? 'Invoice' : 'Factura', $v['invoice']]);
        $total = !empty($v['amount']) ? [$en ? 'Amount' : 'Valor', $v['amount'], ''] : null;
        $cta = $type === 'booking_completed' && $review ? [$en ? 'Leave a review' : 'Deixar a minha avaliação', $review] : [$en ? 'View my booking' : 'Ver a minha reserva', $v['link']];
        $secondary = $type === 'booking_completed' ? [[$en ? 'View my booking' : 'Ver a minha reserva', $v['link']]] : [];
        return self::render([
            'lang' => $lang, 'ref' => $b['reference'], 'image' => $isBooking ? self::itemImage($b['item_id'] ?? null) : null, 'imageAlt' => $b['item_name'],
            'preheader' => $en ? $n[4] . ' — ' . $b['reference'] : $n[3] . ' — ' . $b['reference'],
            'status' => [$en ? $n[2] : $n[1], $n[0]], 'greeting' => ($en ? 'Hello, ' : 'Olá, ') . $first . '!', 'title' => $en ? $n[4] : $n[3],
            'paras' => $paras, 'card' => ['ref' => $b['reference'], 'rows' => $rows, 'total' => $total],
            'cta' => $cta, 'secondary' => $secondary,
        ]);
    }

    /** Factura/pró-forma enviada ao cliente, com as formas de pagamento das Definições. */
    public static function invoice(array $d): string
    {
        $en = $d['lang'] === 'en';
        $first = strtok((string) $d['name'], ' ') ?: $d['name'];
        $methods = [];
        foreach (setting('payment')['methods'] ?? [] as $m) {
            if (!empty($m['pending'])) continue;
            $methods[] = [$m['label'], $m['type'] === 'bank' ? trim(($en ? 'Account ' : 'Conta ') . ($m['account'] ?? '') . (!empty($m['nib']) ? "\nNIB " . $m['nib'] : '')) : ($m['number'] ?? '')];
        }
        $note = trim((string) (setting('payment')['note'] ?? ''));
        return self::render([
            'lang' => $d['lang'], 'ref' => $d['ref'],
            'preheader' => ($en ? "{$d['label']} {$d['number']} — amount {$d['amount']}" : "{$d['label']} {$d['number']} — valor {$d['amount']}"),
            'status' => [$d['label'], 'info'], 'greeting' => ($en ? 'Hello, ' : 'Olá, ') . $first . '!',
            'title' => $en ? "Your " . strtolower($d['label']) . " {$d['number']}" : "A sua " . self::lower($d['label']) . " {$d['number']}",
            'paras' => [$en ? "Please find attached the document for booking **{$d['ref']}**. Please quote the invoice number when paying." : "Enviamos em anexo o documento referente ao pedido **{$d['ref']}**. Indique o número da factura no pagamento."],
            'card' => ['ref' => $d['number'], 'refLabel' => $d['label'], 'rows' => [[$en ? 'Booking' : 'Pedido', $d['ref']], [$en ? 'Experience' : 'Experiência', $d['item'] ?? null], [$en ? 'Document' : 'Documento', ($en ? 'PDF attached' : 'PDF em anexo')]],
                'total' => [$en ? 'Amount due' : 'Valor a pagar', $d['amount'], '']],
            'payment' => $methods, 'notice' => $note !== '' ? [$note, 'info'] : null,
            'cta' => $d['proof'] ? [$en ? 'Send proof of payment' : 'Enviar comprovativo de pagamento', $d['proof']] : [$en ? 'View my booking' : 'Ver a minha reserva', $d['area']],
            'secondary' => $d['proof'] ? [[$en ? 'View my booking' : 'Ver a minha reserva', $d['area']]] : [],
        ]);
    }
}
