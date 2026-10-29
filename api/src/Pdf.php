<?php
/**
 * MOZ CAMP ADVENTURES — api/src/Pdf.php
 * Gerador de PDF mínimo, sem dependências (PDF 1.4, A4), com texto, linhas,
 * rectângulos e imagens JPEG. Suficiente para facturas e recibos.
 * Fonte: Inter (a mesma do site), embebida como TrueType em WinAnsiEncoding
 * a partir de api/assets/fonts/inter-{400,700,800}.ttf (subconjunto latino,
 * cobre os acentos do português). Sem esses ficheiros, usa Helvetica.
 * Coordenadas em pontos, origem no canto superior esquerdo.
 */

declare(strict_types=1);

final class Pdf
{
    public const W = 595.28;
    public const H = 841.89;

    /** Larguras AFM (1/1000 em) de Helvetica e Helvetica-Bold, ASCII 32–126 (recurso sem a Inter). */
    private const WIDTHS = [
        'F1' => [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
        'F2' => [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584],
    ];
    /** F1 texto (400) · F2 negrito (700) · F3 títulos (800) */
    private const FONTS = ['F1' => ['inter-400.ttf', 'Inter-Regular', 'Helvetica'], 'F2' => ['inter-700.ttf', 'Inter-Bold', 'Helvetica-Bold'], 'F3' => ['inter-800.ttf', 'Inter-ExtraBold', 'Helvetica-Bold']];

    private array $pages = [];
    private string $cur = '';
    private array $images = [];
    /** @var array<string, PdfTtf|null> */
    private array $ttf = [];

    public function __construct(?string $fontDir = null)
    {
        $fontDir ??= dirname(__DIR__) . '/assets/fonts';
        foreach (self::FONTS as $id => [$file, $name]) {
            $this->ttf[$id] = is_file("$fontDir/$file") ? new PdfTtf("$fontDir/$file", $name) : null;
        }
    }

    public function addPage(): void
    {
        if ($this->cur !== '') {
            $this->pages[] = $this->cur;
        }
        $this->cur = ' ';
    }

    /** Texto numa linha. $bold: false (400), true (700) ou 'black' (800). $align: L|R|C (x é a referência). */
    public function text(float $x, float $y, string $s, float $size = 10, bool|string $bold = false, array $rgb = [0.11, 0.14, 0.14], string $align = 'L'): void
    {
        $font = self::fontId($bold);
        if ($align !== 'L') {
            $w = $this->width($s, $size, $bold);
            $x -= $align === 'R' ? $w : $w / 2;
        }
        $this->cur .= sprintf("BT /%s %.2F Tf %.3F %.3F %.3F rg %.2F %.2F Td (%s) Tj ET\n", $font, $size, ...[...$rgb, $x, self::H - $y, $this->escape($s)]);
    }

    /** Texto com quebra de linha automática; devolve a altura ocupada. */
    public function paragraph(float $x, float $y, float $maxWidth, string $s, float $size = 10, bool|string $bold = false, array $rgb = [0.11, 0.14, 0.14], float $leading = 1.35): float
    {
        $lines = [];
        foreach (preg_split('/\R/u', $s) as $para) {
            $line = '';
            foreach (preg_split('/\s+/u', trim($para)) as $word) {
                $try = $line === '' ? $word : "$line $word";
                if ($line !== '' && $this->width($try, $size, $bold) > $maxWidth) {
                    $lines[] = $line;
                    $line = $word;
                } else {
                    $line = $try;
                }
            }
            $lines[] = $line;
        }
        foreach ($lines as $i => $l) {
            $this->text($x, $y + $i * $size * $leading, $l, $size, $bold, $rgb);
        }
        return count($lines) * $size * $leading;
    }

    public function rect(float $x, float $y, float $w, float $h, ?array $fill = null, ?array $stroke = null, float $lineWidth = 0.6): void
    {
        $op = $fill && $stroke ? 'B' : ($fill ? 'f' : 'S');
        $this->cur .= sprintf("q %.2F w %s%s%.2F %.2F %.2F %.2F re %s Q\n", $lineWidth,
            $fill ? sprintf('%.3F %.3F %.3F rg ', ...$fill) : '',
            $stroke ? sprintf('%.3F %.3F %.3F RG ', ...$stroke) : '',
            $x, self::H - $y - $h, $w, $h, $op);
    }

    public function line(float $x1, float $y1, float $x2, float $y2, array $rgb = [0.85, 0.88, 0.88], float $w = 0.6): void
    {
        $this->cur .= sprintf("q %.2F w %.3F %.3F %.3F RG %.2F %.2F m %.2F %.2F l S Q\n", $w, ...[...$rgb, $x1, self::H - $y1, $x2, self::H - $y2]);
    }

    /** Imagem JPEG (o logótipo é convertido para JPEG com o fundo da página). */
    public function jpeg(string $path, float $x, float $y, float $w): void
    {
        $info = @getimagesize($path);
        if (!$info || $info[2] !== IMAGETYPE_JPEG) {
            return;
        }
        $name = array_search($path, array_column($this->images, 'path', 'name'), true);   // a mesma imagem é embebida uma só vez
        if ($name === false) {
            $name = 'Im' . (count($this->images) + 1);
            $this->images[$name] = ['name' => $name, 'path' => $path, 'data' => (string) file_get_contents($path), 'w' => $info[0], 'h' => $info[1], 'cs' => ($info['channels'] ?? 3) === 1 ? '/DeviceGray' : '/DeviceRGB'];
        }
        $h = $w * $info[1] / $info[0];
        $this->cur .= sprintf("q %.2F 0 0 %.2F %.2F %.2F cm /%s Do Q\n", $w, $h, $x, self::H - $y - $h, $name);
    }

    public function width(string $s, float $size, bool|string $bold = false): float
    {
        $id = self::fontId($bold);
        $sum = 0;
        if ($ttf = $this->ttf[$id] ?? null) {
            foreach (str_split(self::winAnsi($s)) as $byte) {
                $sum += $ttf->widths[ord($byte)] ?? 0;
            }
            return $sum * $size / 1000;
        }
        $table = self::WIDTHS[$id === 'F1' ? 'F1' : 'F2'];
        /* Caracteres não-ASCII com larguras próprias em WinAnsi; os acentuados medem como a letra base */
        foreach (['—' => 1000, '–' => 556, '×' => 584, '·' => 278, '’' => 222, '“' => 333, '”' => 333, 'º' => 365, 'ª' => 370] as $ch => $w) {
            $n = substr_count($s, $ch);
            if ($n) {
                $sum += $n * $w;
                $s = str_replace($ch, '', $s);
            }
        }
        foreach (preg_split('//u', self::fold($s), -1, PREG_SPLIT_NO_EMPTY) as $ch) {
            $o = ord($ch);
            $sum += ($o >= 32 && $o <= 126) ? $table[$o - 32] : 556;
        }
        return $sum * $size / 1000;
    }

    public function output(array $meta = []): string
    {
        if ($this->cur !== '') {
            $this->pages[] = $this->cur;
            $this->cur = '';
        }
        $objs = [];
        $objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        $n = 3;
        $fontRefs = '';
        foreach (self::FONTS as $id => [, , $fallback]) {
            $ttf = $this->ttf[$id];
            if ($ttf === null) {
                $objs[$n] = "<< /Type /Font /Subtype /Type1 /BaseFont /$fallback /Encoding /WinAnsiEncoding >>";
                $fontRefs .= "/$id $n 0 R ";
                $n++;
                continue;
            }
            $file = function_exists('gzcompress') ? gzcompress($ttf->data) : $ttf->data;
            $objs[$n] = sprintf("<< /Length %d /Length1 %d %s>>\nstream\n%s\nendstream", strlen($file), strlen($ttf->data), function_exists('gzcompress') ? '/Filter /FlateDecode ' : '', $file);
            $d = $ttf->desc;
            $objs[$n + 1] = sprintf('<< /Type /FontDescriptor /FontName /%s /Flags 32 /FontBBox [%d %d %d %d] /ItalicAngle 0 /Ascent %d /Descent %d /CapHeight %d /StemV %d /FontFile2 %d 0 R >>',
                $ttf->name, ...[...$d['bbox'], $d['asc'], $d['desc'], $d['cap'], $d['stemv'], $n]);
            $objs[$n + 2] = sprintf('<< /Type /Font /Subtype /TrueType /BaseFont /%s /FirstChar 32 /LastChar 255 /Widths [%s] /Encoding /WinAnsiEncoding /FontDescriptor %d 0 R >>',
                $ttf->name, implode(' ', array_map(static fn ($c) => $ttf->widths[$c], range(32, 255))), $n + 1);
            $fontRefs .= "/$id " . ($n + 2) . ' 0 R ';
            $n += 3;
        }
        $xobj = '';
        foreach ($this->images as $name => $im) {
            $objs[$n] = sprintf("<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace %s /BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n%s\nendstream", $im['w'], $im['h'], $im['cs'], strlen($im['data']), $im['data']);
            $xobj .= "/$name $n 0 R ";
            $n++;
        }
        $kids = [];
        foreach ($this->pages as $content) {
            $stream = function_exists('gzcompress') ? gzcompress($content) : $content;
            $filter = function_exists('gzcompress') ? '/Filter /FlateDecode ' : '';
            $objs[$n] = sprintf("<< %s/Length %d >>\nstream\n%s\nendstream", $filter, strlen($stream), $stream);
            $objs[$n + 1] = sprintf('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2F %.2F] /Resources << /Font << %s>> /XObject << %s>> >> /Contents %d 0 R >>', self::W, self::H, $fontRefs, $xobj, $n);
            $kids[] = ($n + 1) . ' 0 R';
            $n += 2;
        }
        $objs[2] = sprintf('<< /Type /Pages /Kids [%s] /Count %d >>', implode(' ', $kids), count($kids));
        $info = $n;
        $objs[$info] = sprintf('<< /Producer (MCA) /Title (%s) /Author (%s) /CreationDate (D:%s) >>', $this->escape($meta['title'] ?? ''), $this->escape($meta['author'] ?? ''), date('YmdHis'));
        ksort($objs);

        $out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        $offsets = [];
        foreach ($objs as $i => $body) {
            $offsets[$i] = strlen($out);
            $out .= "$i 0 obj\n$body\nendobj\n";
        }
        $xref = strlen($out);
        $out .= 'xref' . "\n0 " . ($info + 1) . "\n0000000000 65535 f \n";
        for ($i = 1; $i <= $info; $i++) {
            $out .= sprintf("%010d 00000 n \n", $offsets[$i]);
        }
        $out .= sprintf("trailer\n<< /Size %d /Root 1 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n", $info + 1, $info, $xref);
        return $out;
    }

    private static function fontId(bool|string $bold): string
    {
        return $bold === 'black' ? 'F3' : ($bold ? 'F2' : 'F1');
    }

    /** UTF-8 → WinAnsi (Windows-1252). */
    private static function winAnsi(string $s): string
    {
        $w = @iconv('UTF-8', 'Windows-1252//TRANSLIT', $s);
        return $w === false ? self::fold($s) : $w;
    }

    /** WinAnsi com escape de parênteses e barras. */
    private function escape(string $s): string
    {
        return strtr(self::winAnsi($s), ['\\' => '\\\\', '(' => '\\(', ')' => '\\)', "\r" => '', "\n" => ' ']);
    }

    /** Remove acentos (para medir larguras com Helvetica). */
    private static function fold(string $s): string
    {
        $map = ['á'=>'a','à'=>'a','â'=>'a','ã'=>'a','ä'=>'a','é'=>'e','ê'=>'e','è'=>'e','í'=>'i','ì'=>'i','î'=>'i','ó'=>'o','ò'=>'o','ô'=>'o','õ'=>'o','ö'=>'o','ú'=>'u','ù'=>'u','û'=>'u','ü'=>'u','ç'=>'c','ñ'=>'n',
                'Á'=>'A','À'=>'A','Â'=>'A','Ã'=>'A','É'=>'E','Ê'=>'E','Í'=>'I','Ó'=>'O','Ô'=>'O','Õ'=>'O','Ú'=>'U','Ç'=>'C','—'=>'-','–'=>'-','×'=>'x','º'=>'o','ª'=>'a','’'=>"'",'“'=>'"','”'=>'"','€'=>'E','·'=>'.'];
        return strtr($s, $map);
    }
}

/**
 * Fonte TrueType para embeber em WinAnsiEncoding (códigos 32–255): larguras,
 * caixa e métricas lidas das tabelas head, hhea, OS/2, cmap (3,1) e hmtx.
 */
final class PdfTtf
{
    /** Códigos 0x80–0x9F do Windows-1252 → Unicode (os restantes coincidem com Latin-1). */
    private const CP1252 = [0x80 => 0x20AC, 0x82 => 0x201A, 0x83 => 0x0192, 0x84 => 0x201E, 0x85 => 0x2026, 0x86 => 0x2020, 0x87 => 0x2021, 0x88 => 0x02C6, 0x89 => 0x2030, 0x8A => 0x0160,
        0x8B => 0x2039, 0x8C => 0x0152, 0x8E => 0x017D, 0x91 => 0x2018, 0x92 => 0x2019, 0x93 => 0x201C, 0x94 => 0x201D, 0x95 => 0x2022, 0x96 => 0x2013, 0x97 => 0x2014,
        0x98 => 0x02DC, 0x99 => 0x2122, 0x9A => 0x0161, 0x9B => 0x203A, 0x9C => 0x0153, 0x9E => 0x017E, 0x9F => 0x0178];

    public string $data;
    public array $widths = [];
    public array $desc = [];

    public function __construct(string $path, public string $name)
    {
        $d = $this->data = (string) file_get_contents($path);
        $u16 = static fn (int $o): int => unpack('n', $d, $o)[1];
        $s16 = static fn (int $o): int => ($v = unpack('n', $d, $o)[1]) >= 0x8000 ? $v - 0x10000 : $v;
        $t = [];
        for ($i = 0, $n = $u16(4); $i < $n; $i++) {
            $r = unpack('a4tag/Nsum/Noffset/Nlength', $d, 12 + 16 * $i);
            $t[$r['tag']] = $r['offset'];
        }
        $k = 1000 / $u16($t['head'] + 18);
        $asc = $s16($t['hhea'] + 4);
        $nhm = $u16($t['hhea'] + 34);
        $os2 = $t['OS/2'];

        // cmap (3,1) formato 4
        $sub = null;
        for ($i = 0, $n = $u16($t['cmap'] + 2); $i < $n; $i++) {
            if ($u16($t['cmap'] + 4 + 8 * $i) === 3 && $u16($t['cmap'] + 6 + 8 * $i) === 1) {
                $sub = $t['cmap'] + unpack('N', $d, $t['cmap'] + 8 + 8 * $i)[1];
            }
        }
        if ($sub === null || $u16($sub) !== 4) {
            throw new RuntimeException("Fonte sem cmap Unicode (3,1) formato 4: $path");
        }
        $seg = $u16($sub + 6) / 2;
        $ends = $sub + 14; $starts = $ends + 2 * $seg + 2; $deltas = $starts + 2 * $seg; $ranges = $deltas + 2 * $seg;
        $glyph = static function (int $cp) use ($u16, $seg, $ends, $starts, $deltas, $ranges): int {
            for ($i = 0; $i < $seg; $i++) {
                if ($cp > $u16($ends + 2 * $i)) continue;
                $start = $u16($starts + 2 * $i);
                if ($cp < $start) return 0;
                $delta = $u16($deltas + 2 * $i);
                $ro = $u16($ranges + 2 * $i);
                if ($ro === 0) return ($cp + $delta) & 0xFFFF;
                $g = $u16($ranges + 2 * $i + $ro + 2 * ($cp - $start));
                return $g ? ($g + $delta) & 0xFFFF : 0;
            }
            return 0;
        };
        for ($c = 32; $c <= 255; $c++) {
            $cp = ($c >= 0x80 && $c <= 0x9F) ? (self::CP1252[$c] ?? 0) : $c;
            $g = $cp ? $glyph($cp) : 0;
            $this->widths[$c] = (int) round($u16($t['hmtx'] + 4 * min($g, $nhm - 1)) * $k);
        }
        $this->desc = [
            'bbox' => array_map(static fn ($o) => (int) round($s16($t['head'] + $o) * $k), [36, 38, 40, 42]),
            'asc' => (int) round($asc * $k), 'desc' => (int) round($s16($t['hhea'] + 6) * $k),
            'cap' => (int) round(($u16($os2) >= 2 ? $s16($os2 + 88) : $asc) * $k),
            'stemv' => $u16($os2 + 4) >= 700 ? 140 : 80,
        ];
    }
}
