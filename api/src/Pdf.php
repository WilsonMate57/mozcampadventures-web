<?php
/**
 * MOZ CAMP ADVENTURES — api/src/Pdf.php
 * Gerador de PDF mínimo, sem dependências (PDF 1.4, A4, Helvetica e
 * Helvetica-Bold em WinAnsiEncoding — cobre os acentos do português),
 * com texto, linhas, rectângulos e imagens JPEG. Suficiente para facturas.
 * Coordenadas em pontos, origem no canto superior esquerdo.
 */

declare(strict_types=1);

final class Pdf
{
    public const W = 595.28;
    public const H = 841.89;

    /** Larguras AFM (1/1000 em) de Helvetica e Helvetica-Bold, ASCII 32–126. */
    private const WIDTHS = [
        'F1' => [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
        'F2' => [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584],
    ];

    private array $pages = [];
    private string $cur = '';
    private array $images = [];

    public function addPage(): void
    {
        if ($this->cur !== '') {
            $this->pages[] = $this->cur;
        }
        $this->cur = ' ';
    }

    /** Texto numa linha. $align: L|R|C (x é a referência). */
    public function text(float $x, float $y, string $s, float $size = 10, bool $bold = false, array $rgb = [0.11, 0.14, 0.14], string $align = 'L'): void
    {
        $font = $bold ? 'F2' : 'F1';
        if ($align !== 'L') {
            $w = $this->width($s, $size, $bold);
            $x -= $align === 'R' ? $w : $w / 2;
        }
        $this->cur .= sprintf("BT /%s %.2F Tf %.3F %.3F %.3F rg %.2F %.2F Td (%s) Tj ET\n", $font, $size, ...[...$rgb, $x, self::H - $y, $this->escape($s)]);
    }

    /** Texto com quebra de linha automática; devolve a altura ocupada. */
    public function paragraph(float $x, float $y, float $maxWidth, string $s, float $size = 10, bool $bold = false, array $rgb = [0.11, 0.14, 0.14], float $leading = 1.35): float
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

    /** Imagem JPEG (o logótipo é convertido para JPEG com fundo branco). */
    public function jpeg(string $path, float $x, float $y, float $w): void
    {
        $info = @getimagesize($path);
        if (!$info || $info[2] !== IMAGETYPE_JPEG) {
            return;
        }
        $name = 'Im' . (count($this->images) + 1);
        $this->images[$name] = ['data' => (string) file_get_contents($path), 'w' => $info[0], 'h' => $info[1], 'cs' => ($info['channels'] ?? 3) === 1 ? '/DeviceGray' : '/DeviceRGB'];
        $h = $w * $info[1] / $info[0];
        $this->cur .= sprintf("q %.2F 0 0 %.2F %.2F %.2F cm /%s Do Q\n", $w, $h, $x, self::H - $y - $h, $name);
    }

    public function width(string $s, float $size, bool $bold = false): float
    {
        $table = self::WIDTHS[$bold ? 'F2' : 'F1'];
        $sum = 0;
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
        $objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        $objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
        $n = 5;
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
            $objs[$n + 1] = sprintf('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2F %.2F] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << %s>> >> /Contents %d 0 R >>', self::W, self::H, $xobj, $n);
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

    /** UTF-8 → WinAnsi (Windows-1252), com escape de parênteses e barras. */
    private function escape(string $s): string
    {
        $w = @iconv('UTF-8', 'Windows-1252//TRANSLIT', $s);
        if ($w === false) {
            $w = self::fold($s);
        }
        return strtr($w, ['\\' => '\\\\', '(' => '\\(', ')' => '\\)', "\r" => '', "\n" => ' ']);
    }

    /** Remove acentos (para medir larguras). */
    private static function fold(string $s): string
    {
        $map = ['á'=>'a','à'=>'a','â'=>'a','ã'=>'a','ä'=>'a','é'=>'e','ê'=>'e','è'=>'e','í'=>'i','ì'=>'i','î'=>'i','ó'=>'o','ò'=>'o','ô'=>'o','õ'=>'o','ö'=>'o','ú'=>'u','ù'=>'u','û'=>'u','ü'=>'u','ç'=>'c','ñ'=>'n',
                'Á'=>'A','À'=>'A','Â'=>'A','Ã'=>'A','É'=>'E','Ê'=>'E','Í'=>'I','Ó'=>'O','Ô'=>'O','Õ'=>'O','Ú'=>'U','Ç'=>'C','—'=>'-','–'=>'-','×'=>'x','º'=>'o','ª'=>'a','’'=>"'",'“'=>'"','”'=>'"','€'=>'E','·'=>'.'];
        return strtr($s, $map);
    }
}
