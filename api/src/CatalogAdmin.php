<?php
/**
 * MOZ CAMP ADVENTURES — api/src/CatalogAdmin.php
 * Editor do catálogo (experiências e alojamentos) no painel.
 *
 *  - O painel edita um RASCUNHO (storage_dir/catalog-draft/, fora da pasta pública).
 *    O site e os preços cobrados nas reservas continuam a usar data/*.json até publicar.
 *  - «Publicar»: cópia de segurança do catálogo activo (storage_dir/catalog-history/),
 *    rascunho → data/, fotos optimizadas e site regenerado (node scripts/publish.mjs).
 *    Se a geração falhar, o catálogo anterior é reposto e o site regenerado de novo.
 *  - Fotos novas: assets/images/packages/<slug>/ (experiências) ou
 *    assets/images/accommodation/<slug>/ (alojamentos), nome aleatório; tipo verificado pelo conteúdo.
 *  - Pacotes não se apagam (os URLs e o SEO ficam protegidos): desactivam-se.
 */

declare(strict_types=1);

final class CatalogAdmin
{
    private const FILES = ['tours.json', 'accommodations.json', 'en.json', 'booking-rules.json', 'categories.json'];
    private const MAX_PHOTO = 8 * 1024 * 1024;
    private const KEEP_HISTORY = 20;
    private const PRICING = ['per-person', 'per-group', 'per-person-night', 'per-unit-night'];
    private const LOCATIONS = ['machangulo', 'inhaca'];

    /* Ordem dos campos no JSON (a mesma dos ficheiros actuais) */
    private const ORDER = ['id', 'slug', 'category', 'name', 'subtitle', 'badge', 'badgeClass', 'stars', 'image', 'heroImage', 'location', 'destinations',
        'duration', 'price', 'price_from', 'priceOld', 'priceLabel', 'price_child', 'priceChild', 'priceChildLabel', 'currency', 'cancelPolicy',
        'description', 'features', 'detailText', 'includes', 'excludes', 'highlights', 'itinerary', 'gallery', 'importantInfo', 'locationCategory', 'maxPeople',
        'privateBoatOptions', 'extras', 'menu', 'privateTransferOptions', 'disabled', 'bookingPeopleLabel', 'boatSelectionRequired', 'boatSelectionLabel', 'boatSelectionDescription'];
    /* Textos traduzíveis (en.json) */
    private const TEXT = ['name' => 120, 'subtitle' => 160, 'badge' => 40, 'duration' => 80, 'priceLabel' => 80, 'priceChildLabel' => 80, 'cancelPolicy' => 120,
        'description' => 400, 'bookingPeopleLabel' => 60, 'boatSelectionLabel' => 120, 'boatSelectionDescription' => 400];
    private const LISTS = ['detailText' => [20, 3000], 'includes' => [40, 300], 'excludes' => [40, 300], 'highlights' => [40, 300], 'importantInfo' => [40, 600], 'features' => [40, 120]];

    /* ── Ficheiros ──────────────────────────────────────── */
    private static function liveDir(): string
    {
        return rtrim((string) (config('app.data_dir') ?: dirname(__DIR__, 2) . '/data'), '/\\');
    }

    private static function storage(string $sub): string
    {
        $base = rtrim((string) config('app.storage_dir'), '/\\');
        if ($base === '') throw new RuntimeException('app.storage_dir não configurado');
        return "$base/$sub";
    }

    private static function draftDir(): string
    {
        return self::storage('catalog-draft');
    }

    private static function readJson(string $path): array
    {
        $j = json_decode((string) @file_get_contents($path), true);
        if (!is_array($j)) throw new RuntimeException('JSON inválido: ' . basename($path));
        return $j;
    }

    /** Escrita atómica (ficheiro temporário + rename), no formato dos ficheiros actuais. */
    private static function writeJson(string $path, array $data): void
    {
        $dir = dirname($path);
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) throw new RuntimeException("Não foi possível criar $dir");
        $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
        if (file_put_contents($tmp, str_replace('    ', '  ', $json)) === false || !rename($tmp, $path)) {
            @unlink($tmp);
            throw new RuntimeException('Não foi possível gravar ' . basename($path));
        }
    }

    private static function copyFile(string $from, string $to): void
    {
        $tmp = $to . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (!copy($from, $tmp) || !rename($tmp, $to)) {
            @unlink($tmp);
            throw new RuntimeException('Não foi possível copiar ' . basename($from));
        }
    }

    /** Rascunho completo; criado a partir do catálogo activo na primeira edição. */
    private static function draft(bool $create = false): array
    {
        $dir = self::draftDir();
        $src = is_file("$dir/tours.json") ? $dir : self::liveDir();
        if ($create && $src !== $dir) {
            if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) throw new RuntimeException("Não foi possível criar $dir");
            foreach (self::FILES as $f) self::copyFile(self::liveDir() . "/$f", "$dir/$f");
            $src = $dir;
        }
        $d = [];
        foreach (self::FILES as $f) $d[$f] = self::readJson("$src/$f");
        return $d;
    }

    private static function live(): array
    {
        $d = [];
        foreach (self::FILES as $f) $d[$f] = self::readJson(self::liveDir() . "/$f");
        return $d;
    }

    private static function lock(): mixed
    {
        $fh = fopen(self::storage('catalog.lock'), 'c');
        if (!$fh || !flock($fh, LOCK_EX | LOCK_NB)) throw new ApiError(409, 'catalog_busy');
        return $fh;
    }

    private static function meta(): array
    {
        return is_file(self::draftDir() . '/meta.json') ? (json_decode((string) file_get_contents(self::draftDir() . '/meta.json'), true) ?: []) : [];
    }

    private static function touch(array $u, string $id): void
    {
        $m = self::meta();
        $m['updated_at'] = date('c');
        $m['updated_by'] = $u['name'];
        $m['items'] = array_values(array_unique([...($m['items'] ?? []), $id]));
        self::writeJson(self::draftDir() . '/meta.json', $m);
    }

    /** Índice: id → [ficheiro, posição]. */
    private static function index(array $d): array
    {
        $ix = [];
        foreach (['tours.json' => 'tour', 'accommodations.json' => 'stay'] as $f => $kind) {
            foreach ($d[$f] as $i => $p) $ix[$p['slug'] ?? $p['id']] = [$f, $i, $kind];
        }
        return $ix;
    }

    /** Assinatura de um item (PT + EN + regras) para saber o que mudou no rascunho. */
    private static function sig(array $d, string $id): ?string
    {
        $ix = self::index($d)[$id] ?? null;
        return $ix ? hash('sha256', json_encode([$d[$ix[0]][$ix[1]], $d['en.json'][$id] ?? null, $d['booking-rules.json'][$id] ?? null])) : null;
    }

    private static function changed(array $draft, array $live): array
    {
        $out = [];
        foreach (array_keys(self::index($draft)) as $id) {
            $a = self::sig($draft, $id);
            $b = self::sig($live, $id);
            if ($a !== $b) $out[$id] = $b === null ? 'novo' : 'alterado';
        }
        foreach (array_diff_key(self::index($live), self::index($draft)) as $id => $_) $out[$id] = 'removido';   // só ao repor uma versão anterior
        if ($draft['categories.json'] != $live['categories.json']) $out['_categories'] = 'alterado';
        return $out;
    }

    /* ── Leitura ────────────────────────────────────────── */
    public static function list(array $u): array
    {
        $draft = self::draft();
        $live = self::live();
        $changed = self::changed($draft, $live);
        $items = [];
        foreach (self::index($draft) as $id => [$f, $i, $kind]) {
            $p = $draft[$f][$i];
            $items[] = ['id' => $id, 'name' => $p['name'], 'kind' => $kind, 'category' => $p['category'] ?? null, 'location' => $p['location'] ?? null,
                'price_from' => (float) ($p['price_from'] ?? 0), 'price_label' => $p['priceLabel'] ?? null, 'active' => empty($p['disabled']),
                'image' => self::publicPath($p['image'] ?? null), 'photos' => count($p['gallery'] ?? []), 'has_en' => !empty($draft['en.json'][$id]),
                'change' => $changed[$id] ?? null];
        }
        $m = self::meta();
        return ['items' => $items, 'categories' => self::categories($draft),
            'draft' => ['changes' => count($changed), 'items' => array_keys($changed), 'updated_at' => $changed ? ($m['updated_at'] ?? null) : null, 'updated_by' => $changed ? ($m['updated_by'] ?? null) : null],
            'can_publish' => Auth::has('catalog.publish')];
    }

    public static function get(string $id, array $u): array
    {
        $d = self::draft();
        [$f, $i, $kind] = self::index($d)[$id] ?? throw new ApiError(404, 'not_found');
        $live = self::live();
        return ['item' => $d[$f][$i], 'en' => (object) ($d['en.json'][$id] ?? []), 'rules' => (object) ($d['booking-rules.json'][$id] ?? []),
            'kind' => $kind, 'published' => isset(self::index($live)[$id]), 'change' => self::changed($d, $live)[$id] ?? null,
            'categories' => self::categories($d), 'default_transfers' => $kind === 'tour' && ($d[$f][$i]['category'] ?? '') === 'beach-tours' ? ($d['booking-rules.json']['_defaultTransfers'] ?? []) : []];
    }

    private static function categories(array $d): array
    {
        $out = [];
        foreach ($d['categories.json'] as $k => $c) if ($k !== '_comment') $out[] = ['id' => $k, 'pt' => $c['pt'], 'en' => $c['en'], 'icon' => $c['icon']];
        return $out;
    }

    private static function publicPath(?string $p): ?string
    {
        return is_string($p) ? preg_replace('#^\.\./#', '/', $p) : null;
    }

    /* ── Criar e gravar ─────────────────────────────────── */
    public static function create(array $in, array $u): array
    {
        $kind = ($in['kind'] ?? '') === 'stay' ? 'stay' : 'tour';
        $name = clean_text($in['name'] ?? '', 120);
        if ($name === '') throw new ApiError(422, 'name_required');
        $lock = self::lock();
        $d = self::draft(true);
        $slug = self::slugify(is_string($in['slug'] ?? null) && $in['slug'] !== '' ? $in['slug'] : $name);
        if ($slug === '' || strlen($slug) < 3) throw new ApiError(422, 'invalid_slug');
        if (isset(self::index($d)[$slug]) || isset($d['en.json'][$slug])) throw new ApiError(409, 'slug_taken');
        $cats = array_column(self::categories($d), 'id');
        $category = $kind === 'stay' ? 'island-accommodation' : (string) ($in['category'] ?? '');
        if (!in_array($category, $cats, true)) throw new ApiError(422, 'invalid_category');
        /* Novo pacote começa desactivado: só aparece no site depois de completo e activado */
        $item = ['id' => $slug, 'slug' => $slug, 'category' => $category, 'name' => $name, 'stars' => 5, 'price' => '', 'price_from' => 0,
            'priceLabel' => $kind === 'stay' ? 'por pessoa / noite' : 'por pessoa', 'currency' => 'MZN', 'description' => '', 'gallery' => [], 'disabled' => true];
        if ($kind === 'stay') $item['locationCategory'] = 'machangulo';
        $f = $kind === 'stay' ? 'accommodations.json' : 'tours.json';
        $d[$f][] = $item;
        self::writeJson(self::draftDir() . "/$f", $d[$f]);
        self::touch($u, $slug);
        Audit::log('catalog_item_created', 'catalog', $slug, ['name' => $name, 'kind' => $kind]);
        flock($lock, LOCK_UN);
        return ['ok' => true, 'id' => $slug];
    }

    public static function slugify(string $s): string
    {
        $s = strtolower(strtr(trim($s), ['á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'Á' => 'a', 'À' => 'a', 'Â' => 'a', 'Ã' => 'a',
            'é' => 'e', 'ê' => 'e', 'è' => 'e', 'É' => 'e', 'Ê' => 'e', 'í' => 'i', 'Í' => 'i', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'Ó' => 'o', 'Ô' => 'o', 'Õ' => 'o',
            'ú' => 'u', 'ü' => 'u', 'Ú' => 'u', 'ç' => 'c', 'Ç' => 'c', 'ñ' => 'n']));
        return substr(trim((string) preg_replace('/[^a-z0-9]+/', '-', $s), '-'), 0, 60);
    }

    /** Grava o item no rascunho: {item, en, rules}. O id/slug e o tipo não mudam depois de criados. */
    public static function save(string $id, array $in, array $u): array
    {
        $lock = self::lock();
        $d = self::draft(true);
        [$f, $i, $kind] = self::index($d)[$id] ?? throw new ApiError(404, 'not_found');
        $old = $d[$f][$i];
        $errors = [];
        $item = self::validateItem(is_array($in['item'] ?? null) ? $in['item'] : [], $old, $kind, $d, $errors);
        $en = self::validateEn(is_array($in['en'] ?? null) ? $in['en'] : [], $item, $errors);
        $rules = self::validateRules(is_array($in['rules'] ?? null) ? $in['rules'] : [], $d['booking-rules.json'][$id] ?? [], $kind, $errors);
        if ($errors) throw new ApiError(422, 'validation_failed', '', ['fields' => $errors]);

        $d[$f][$i] = $item;
        self::writeJson(self::draftDir() . "/$f", $d[$f]);
        if ($en) $d['en.json'][$id] = $en; else unset($d['en.json'][$id]);
        self::writeJson(self::draftDir() . '/en.json', $d['en.json']);
        if ($rules) $d['booking-rules.json'][$id] = $rules; else unset($d['booking-rules.json'][$id]);
        self::writeJson(self::draftDir() . '/booking-rules.json', $d['booking-rules.json']);
        self::touch($u, $id);
        Audit::log('catalog_item_saved', 'catalog', $id, ['fields' => array_keys(array_filter($item, fn ($v, $k) => ($old[$k] ?? null) !== $v, ARRAY_FILTER_USE_BOTH))]);
        flock($lock, LOCK_UN);
        return ['ok' => true] + self::get($id, $u);
    }

    private static function text(mixed $v, int $max): string
    {
        return is_string($v) || is_int($v) || is_float($v) ? clean_text((string) $v, $max) : '';
    }

    private static function lines(mixed $v, int $maxItems, int $maxLen): array
    {
        if (!is_array($v)) return [];
        $out = [];
        foreach ($v as $x) {
            $t = self::text($x, $maxLen);
            if ($t !== '') $out[] = $t;
        }
        return array_slice($out, 0, $maxItems);
    }

    private static function money(mixed $v): ?int
    {
        if ($v === null || $v === '') return null;
        if (!is_numeric($v) || (float) $v < 0 || (float) $v > 100000000) return -1;
        return (int) round((float) $v);
    }

    public static function fmt(int $n): string
    {
        return number_format($n, 0, ',', '.') . ' MZN';
    }

    private static function validateItem(array $in, array $old, string $kind, array $d, array &$err): array
    {
        $p = ['id' => $old['id'], 'slug' => $old['slug'] ?? $old['id']];
        $cats = array_column(self::categories($d), 'id');
        $p['category'] = $kind === 'stay' ? 'island-accommodation' : (string) ($in['category'] ?? '');
        if (!in_array($p['category'], $cats, true)) $err['category'] = 'invalid';
        foreach (['name' => 120, 'subtitle' => 160, 'badge' => 40, 'location' => 120, 'destinations' => 80, 'duration' => 80, 'priceLabel' => 80,
                  'priceChildLabel' => 80, 'cancelPolicy' => 120, 'description' => 400, 'bookingPeopleLabel' => 60, 'boatSelectionLabel' => 120, 'boatSelectionDescription' => 400] as $k => $max) {
            $p[$k] = self::text($in[$k] ?? '', $max);
        }
        if ($p['name'] === '') $err['name'] = 'required';
        $p['badgeClass'] = $p['badge'] !== '' ? 'popular' : '';
        $stars = (int) ($in['stars'] ?? 5);
        $p['stars'] = max(0, min(5, $stars));

        $price = self::money($in['price_from'] ?? null);
        if ($price === -1) $err['price_from'] = 'invalid';
        elseif (!$price && empty($in['disabled'])) $err['price_from'] = 'required';     // um rascunho desactivado pode ficar sem preço
        $oldPrice = self::money($in['price_old'] ?? null);
        $child = self::money($in['price_child'] ?? null);
        if ($oldPrice === -1 || ($oldPrice !== null && $price > 0 && $oldPrice <= $price)) $err['price_old'] = 'invalid';
        if ($child === -1) $err['price_child'] = 'invalid';
        $p['price_from'] = max(0, (int) $price);
        $p['price'] = $p['price_from'] ? self::fmt($p['price_from']) : '';
        $p['priceOld'] = $oldPrice > 0 ? self::fmt($oldPrice) : '';
        $p['price_child'] = $child > 0 ? $child : null;
        $p['priceChild'] = $child > 0 ? self::fmt($child) : '';
        $p['currency'] = 'MZN';

        foreach (self::LISTS as $k => [$n, $len]) $p[$k] = self::lines($in[$k] ?? [], $n, $len);
        $p['itinerary'] = self::itinerary($in['itinerary'] ?? []);

        /* Galeria: só ficheiros de imagem existentes dentro de assets/images */
        $root = dirname(__DIR__, 2);
        $gallery = [];
        foreach (is_array($in['gallery'] ?? null) ? $in['gallery'] : [] as $g) {
            $g = is_string($g) ? '../' . ltrim((string) preg_replace('#^(\.\./|/)#', '', $g), '/') : '';
            if (!preg_match('#^\.\./assets/images/(?!_opt/)[A-Za-z0-9 _.()/-]+\.(webp|jpe?g|png)$#i', $g) || str_contains(substr($g, 3), '..') || !is_file($root . '/' . substr($g, 3))) {
                $err['gallery'] = 'invalid_photo';
                continue;
            }
            if (!in_array($g, $gallery, true)) $gallery[] = $g;
        }
        $gallery = array_slice($gallery, 0, 40);
        $p['gallery'] = $gallery;
        $pick = static function ($v) use ($gallery) {
            $v = is_string($v) ? '../' . ltrim((string) preg_replace('#^(\.\./|/)#', '', $v), '/') : '';
            return in_array($v, $gallery, true) ? $v : ($gallery[0] ?? '');
        };
        $p['image'] = $pick($in['image'] ?? '');
        $p['heroImage'] = $pick($in['heroImage'] ?? ($in['image'] ?? ''));
        $p['disabled'] = !empty($in['disabled']);
        if (!$p['disabled'] && !$gallery) $err['gallery'] ??= 'required_to_activate';
        if (!$p['disabled'] && $p['description'] === '') $err['description'] = 'required_to_activate';

        if ($kind === 'stay') {
            $p['locationCategory'] = in_array($in['locationCategory'] ?? '', self::LOCATIONS, true) ? $in['locationCategory'] : 'machangulo';
            $max = (int) ($in['maxPeople'] ?? 0);
            $p['maxPeople'] = $max > 0 ? min($max, 200) : null;
        } else {
            $p['privateBoatOptions'] = self::options($in['privateBoatOptions'] ?? [], 'boat', $err);
            $p['extras'] = self::options($in['extras'] ?? [], 'extra', $err);
            $p['privateTransferOptions'] = self::options($in['privateTransferOptions'] ?? [], 'transfer', $err);
            $p['menu'] = self::menu($in['menu'] ?? []);
            $p['boatSelectionRequired'] = !empty($in['boatSelectionRequired']) && $p['privateBoatOptions'];
        }
        return self::compact($p, $old);
    }

    /** Remove campos vazios e mantém a ordem dos ficheiros; campos desconhecidos do item antigo são preservados. */
    private static function compact(array $p, array $old): array
    {
        foreach ($old as $k => $v) if (!array_key_exists($k, $p) && !in_array($k, self::ORDER, true)) $p[$k] = $v;
        $out = [];
        foreach ([...self::ORDER, ...array_keys($p)] as $k) {
            if (!array_key_exists($k, $p) || array_key_exists($k, $out)) continue;
            $v = $p[$k];
            $keep = in_array($k, ['id', 'slug', 'category', 'name', 'price', 'price_from', 'currency', 'gallery', 'description', 'priceLabel', 'stars'], true);
            if (!$keep && ($v === null || $v === '' || $v === [] || $v === false)) continue;
            $out[$k] = $v;
        }
        return $out;
    }

    private static function itinerary(mixed $v): array
    {
        $out = [];
        foreach (is_array($v) ? array_slice($v, 0, 30) : [] as $s) {
            if (!is_array($s)) continue;
            $x = ['time' => self::text($s['time'] ?? '', 20), 'title' => self::text($s['title'] ?? '', 160), 'body' => self::text($s['body'] ?? '', 2000),
                'checklist' => self::lines($s['checklist'] ?? [], 20, 200)];
            if ($x['title'] === '' && $x['body'] === '') continue;
            if (!$x['checklist']) unset($x['checklist']);
            if ($x['time'] === '') unset($x['time']);
            $out[] = $x;
        }
        return $out;
    }

    private static function menu(mixed $v): array
    {
        $out = [];
        foreach (is_array($v) ? array_slice($v, 0, 10) : [] as $m) {
            if (!is_array($m)) continue;
            $cats = [];
            foreach (is_array($m['categories'] ?? null) ? array_slice($m['categories'], 0, 20) : [] as $c) {
                if (!is_array($c)) continue;
                $name = self::text($c['name'] ?? '', 120);
                $items = self::lines($c['items'] ?? [], 40, 200);
                if ($name !== '' || $items) $cats[] = ['name' => $name, 'items' => $items];
            }
            $title = self::text($m['title'] ?? '', 160);
            if ($title !== '' || $cats) $out[] = ['title' => $title, 'categories' => $cats];
        }
        return $out;
    }

    /** Opções com preço (barcos, extras, transfers). O id identifica a opção na reserva e nas traduções. */
    private static function options(mixed $v, string $type, array &$err): array
    {
        $out = [];
        $ids = [];
        foreach (is_array($v) ? array_slice($v, 0, 20) : [] as $n => $o) {
            if (!is_array($o)) continue;
            $title = self::text($o['title'] ?? '', 120);
            if ($title === '') continue;
            $id = self::slugify(self::text($o['id'] ?? '', 60) ?: $title);
            while (isset($ids[$id])) $id .= '-2';
            $ids[$id] = true;
            $price = self::money($o['price'] ?? 0);
            if ($price === null || $price < 0) { $err["$type.$n.price"] = 'invalid'; $price = 0; }
            $x = ['id' => $id];
            if ($type === 'extra') $x['icon'] = self::text($o['icon'] ?? 'plus', 40) ?: 'plus';
            $x['title'] = $title;
            if ($type === 'transfer') $x['subtitle'] = self::text($o['subtitle'] ?? '', 160);
            else $x['desc'] = self::text($o['desc'] ?? '', 300);
            $x['price'] = $price;
            if ($type === 'boat') {
                $cap = (int) ($o['capacity'] ?? 0);
                if ($cap < 1 || $cap > 500) $err["$type.$n.capacity"] = 'invalid';
                $x['capacity'] = max(1, min($cap, 500));
            }
            if ($type === 'extra') {
                $x['perPerson'] = !empty($o['perPerson']);
                foreach (['currency', 'priceUnit'] as $k) if (!empty($o[$k])) $x[$k] = $k === 'currency' ? (in_array($o[$k], ['MZN', 'USD'], true) ? $o[$k] : 'MZN') : self::text($o[$k], 40);
            }
            if ($type === 'transfer') $x['notes'] = self::lines($o['notes'] ?? [], 10, 300);
            $out[] = $x;
        }
        return $out;
    }

    /** Tradução inglesa: só os textos; opções ligadas pelo id. Vazio = o site EN mostra o texto PT. */
    private static function validateEn(array $in, array $item, array &$err): array
    {
        $en = [];
        foreach (self::TEXT as $k => $max) {
            $t = self::text($in[$k] ?? '', $max);
            if ($t !== '') $en[$k] = $t;
        }
        foreach (self::LISTS as $k => [$n, $len]) {
            $l = self::lines($in[$k] ?? [], $n, $len);
            if ($l) $en[$k] = $l;
        }
        $it = self::itinerary($in['itinerary'] ?? []);
        if ($it) $en['itinerary'] = $it;
        $menu = self::menu($in['menu'] ?? []);
        if ($menu) $en['menu'] = $menu;
        foreach (['privateBoatOptions' => ['title', 'desc'], 'extras' => ['title', 'desc'], 'privateTransferOptions' => ['title', 'subtitle']] as $k => $fields) {
            $ids = array_column($item[$k] ?? [], 'id');
            $tr = [];
            foreach (is_array($in[$k] ?? null) ? $in[$k] : [] as $o) {
                if (!is_array($o) || !in_array($o['id'] ?? null, $ids, true)) continue;
                $x = ['id' => $o['id']];
                foreach ($fields as $fld) if (($t = self::text($o[$fld] ?? '', $fld === 'title' ? 120 : 300)) !== '') $x[$fld] = $t;
                if ($k === 'privateTransferOptions' && ($notes = self::lines($o['notes'] ?? [], 10, 300))) $x['notes'] = $notes;
                if (count($x) > 1) $tr[] = $x;
            }
            if ($tr) $en[$k] = $tr;
        }
        return $en;
    }

    /** Regras de reserva (booking-rules.json): mínimos, máximo, forma de cobrança e tarifas por noite. */
    private static function validateRules(array $in, array $old, string $kind, array &$err): array
    {
        $r = [];
        foreach (['minPeople' => 100, 'maxPeople' => 500, 'minNights' => 60] as $k => $max) {
            if (($in[$k] ?? '') === '' || $in[$k] === null) continue;
            $n = filter_var($in[$k], FILTER_VALIDATE_INT);
            if ($n === false || $n < 1 || $n > $max) { $err["rules.$k"] = 'invalid'; continue; }
            $r[$k] = $n;
        }
        if (isset($r['minPeople'], $r['maxPeople']) && $r['minPeople'] > $r['maxPeople']) $err['rules.maxPeople'] = 'below_min';
        $pricing = $in['pricing'] ?? '';
        if ($pricing !== '' && $pricing !== null) {
            if (!in_array($pricing, self::PRICING, true)) $err['rules.pricing'] = 'invalid';
            elseif ($pricing !== ($kind === 'stay' ? 'per-person-night' : 'per-person')) $r['pricing'] = $pricing;   // a omissão não se grava
        }
        if ($kind === 'stay' && is_array($in['nightRates'] ?? null)) {
            $rates = [];
            foreach ($in['nightRates'] as $nights => $pair) {
                $nn = filter_var($nights, FILTER_VALIDATE_INT);
                if ($nn === false || $nn < 1 || $nn > 30 || !is_array($pair)) { $err['rules.nightRates'] = 'invalid'; continue; }
                $a = self::money($pair[0] ?? null);
                $c = self::money($pair[1] ?? null);
                if ($a === null && $c === null) continue;
                if ($a === null || $a <= 0 || $c === -1) { $err['rules.nightRates'] = 'invalid'; continue; }
                $rates[(string) $nn] = [$a, max(0, (int) $c)];
            }
            ksort($rates, SORT_NUMERIC);
            if ($rates) $r['nightRates'] = $rates;
        }
        foreach (['_source', '_note'] as $k) if (isset($old[$k])) $r[$k] = $old[$k];   // notas internas da migração
        return array_filter($r, fn ($k) => !str_starts_with($k, '_'), ARRAY_FILTER_USE_KEY) ? $r : [];
    }

    /* ── Fotos ──────────────────────────────────────────── */
    /** Carrega uma foto (multipart, campo «photo») e acrescenta-a à galeria do rascunho. */
    public static function upload(string $id, array $u): array
    {
        $f = $_FILES['photo'] ?? null;
        if ($f && in_array($f['error'] ?? 0, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) throw new ApiError(413, 'photo_too_large');
        if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) throw new ApiError(422, 'photo_missing');
        if ($f['size'] > self::MAX_PHOTO) throw new ApiError(413, 'photo_too_large');
        $info = @getimagesize($f['tmp_name']);          // tipo real pelo conteúdo, não pela extensão
        $ext = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'][$info[2] ?? 0] ?? throw new ApiError(415, 'photo_invalid_type');
        if ($info[0] < 600 || $info[1] < 400) throw new ApiError(422, 'photo_too_small', '', ['min' => '600×400']);
        if ($info[0] * $info[1] > 40_000_000) throw new ApiError(422, 'photo_too_big_dimensions');

        $lock = self::lock();
        $d = self::draft(true);
        [$file, $i, $kind] = self::index($d)[$id] ?? throw new ApiError(404, 'not_found');
        if (count($d[$file][$i]['gallery'] ?? []) >= 40) throw new ApiError(422, 'gallery_full');
        $rel = 'assets/images/' . ($kind === 'stay' ? 'accommodation' : 'packages') . "/$id";
        $dir = dirname(__DIR__, 2) . "/$rel";
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) throw new RuntimeException("Não foi possível criar $rel");
        $name = $id . '-' . bin2hex(random_bytes(5)) . ".$ext";
        if (!move_uploaded_file($f['tmp_name'], "$dir/$name")) throw new RuntimeException('Não foi possível gravar a foto');
        @chmod("$dir/$name", 0644);
        $path = "../$rel/$name";
        $d[$file][$i]['gallery'] = [...($d[$file][$i]['gallery'] ?? []), $path];
        if (empty($d[$file][$i]['image'])) $d[$file][$i]['image'] = $d[$file][$i]['heroImage'] = $path;
        self::writeJson(self::draftDir() . "/$file", $d[$file]);
        self::touch($u, $id);
        Audit::log('catalog_photo_uploaded', 'catalog', $id, ['file' => $name, 'width' => $info[0], 'height' => $info[1]]);
        flock($lock, LOCK_UN);
        return ['ok' => true, 'path' => $path, 'url' => "/$rel/$name", 'width' => $info[0], 'height' => $info[1]];
    }

    /* ── Rascunho: descartar, publicar, histórico ───────── */
    public static function discard(array $u): array
    {
        $lock = self::lock();
        $dir = self::draftDir();
        $changes = is_file("$dir/tours.json") ? array_keys(self::changed(self::draft(), self::live())) : [];
        foreach ([...self::FILES, 'meta.json'] as $f) @unlink("$dir/$f");
        Audit::log('catalog_draft_discarded', 'catalog', null, ['items' => $changes]);
        flock($lock, LOCK_UN);
        return ['ok' => true];
    }

    public static function publish(array $u): array
    {
        $lock = self::lock();
        $dir = self::draftDir();
        if (!is_file("$dir/tours.json")) throw new ApiError(409, 'no_changes');
        $draft = self::draft();
        $changes = self::changed($draft, self::live());
        if (!$changes) throw new ApiError(409, 'no_changes');

        /* Cópia de segurança do catálogo activo */
        $id = date('Ymd-His') . '-' . bin2hex(random_bytes(2));
        $bak = self::storage("catalog-history/$id");
        if (!mkdir($bak, 0750, true)) throw new RuntimeException('Não foi possível criar a cópia de segurança');
        foreach (self::FILES as $f) self::copyFile(self::liveDir() . "/$f", "$bak/$f");
        self::writeJson("$bak/meta.json", ['created_at' => date('c'), 'by' => $u['name'], 'replaced_by' => array_keys($changes)]);

        foreach (self::FILES as $f) self::copyFile("$dir/$f", self::liveDir() . "/$f");
        [$ok, $log, $secs] = self::runBuild();
        if (!$ok) {
            foreach (self::FILES as $f) self::copyFile("$bak/$f", self::liveDir() . "/$f");
            [$restored] = self::runBuild();
            Audit::log('catalog_publish_failed', 'catalog', null, ['items' => array_keys($changes), 'restored' => $restored]);
            error_log('[MCA catálogo] publicação falhou: ' . $log);
            throw new ApiError(500, 'publish_failed', '', ['log' => $log, 'restored' => $restored]);
        }
        foreach ([...self::FILES, 'meta.json'] as $f) @unlink("$dir/$f");
        /* Cópia do catálogo publicado: um deploy por Git substitui data/*.json (api/bin/catalog-restore.php repõe-a) */
        $snap = self::storage('catalog-live');
        if (!is_dir($snap)) @mkdir($snap, 0750, true);
        foreach (self::FILES as $f) self::copyFile(self::liveDir() . "/$f", "$snap/$f");
        self::prune();
        Audit::log('catalog_published', 'catalog', null, ['items' => array_keys($changes), 'backup' => $id, 'seconds' => $secs]);
        flock($lock, LOCK_UN);
        return ['ok' => true, 'items' => array_keys($changes), 'backup' => $id, 'seconds' => $secs, 'log' => $log];
    }

    /** node scripts/publish.mjs (fotos + site). Devolve [ok, últimas linhas do registo, segundos]. */
    private static function runBuild(): array
    {
        @set_time_limit(330);
        $root = dirname(__DIR__, 2);
        $node = (string) (config('app.node_bin') ?: 'node');
        $t0 = microtime(true);
        $p = proc_open([$node, "$root/scripts/publish.mjs"], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $root);
        if (!is_resource($p)) return [false, 'Não foi possível executar o Node.js (app.node_bin).', 0];
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);
        $out = '';
        while (true) {
            $out .= stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
            $st = proc_get_status($p);
            if (!$st['running']) break;
            if (microtime(true) - $t0 > 300) { proc_terminate($p); $out .= "\nTempo esgotado (300 s)."; break; }
            usleep(100000);
        }
        $out .= stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $code = $st['running'] ? -1 : $st['exitcode'];
        proc_close($p);
        $tail = implode("\n", array_slice(preg_split('/\r?\n/', trim($out)) ?: [], -12));
        return [$code === 0, utf8_cut($tail, 2000), round(microtime(true) - $t0, 1)];
    }

    private static function prune(): void
    {
        $all = glob(self::storage('catalog-history') . '/*', GLOB_ONLYDIR) ?: [];
        rsort($all);
        foreach (array_slice($all, self::KEEP_HISTORY) as $old) {
            foreach (glob("$old/*") ?: [] as $f) @unlink($f);
            @rmdir($old);
        }
    }

    public static function history(array $u): array
    {
        $out = [];
        $all = glob(self::storage('catalog-history') . '/*', GLOB_ONLYDIR) ?: [];
        rsort($all);
        foreach ($all as $dir) {
            $m = is_file("$dir/meta.json") ? (json_decode((string) file_get_contents("$dir/meta.json"), true) ?: []) : [];
            $out[] = ['id' => basename($dir), 'created_at' => $m['created_at'] ?? null, 'by' => $m['by'] ?? null, 'replaced_by' => $m['replaced_by'] ?? []];
        }
        return ['versions' => $out];
    }

    /** Carrega uma versão anterior para o rascunho (para rever e publicar; não altera o site directamente). */
    public static function restore(string $id, array $u): array
    {
        if (!preg_match('/^\d{8}-\d{6}-[a-f0-9]{4}$/', $id)) throw new ApiError(404, 'not_found');
        $src = self::storage("catalog-history/$id");
        if (!is_dir($src)) throw new ApiError(404, 'not_found');
        $lock = self::lock();
        $dir = self::draftDir();
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) throw new RuntimeException("Não foi possível criar $dir");
        foreach (self::FILES as $f) {
            self::readJson("$src/$f");
            self::copyFile("$src/$f", "$dir/$f");
        }
        /* Pacotes criados depois dessa versão ficam desactivados (o URL mostra «indisponível»), não desaparecem */
        $d = self::draft();
        $live = self::live();
        $have = self::index($d);
        foreach (self::index($live) as $sid => [$f, $i]) {
            if (isset($have[$sid])) continue;
            $d[$f][] = ['disabled' => true] + $live[$f][$i];
            self::writeJson("$dir/$f", $d[$f]);
            if (isset($live['en.json'][$sid])) {
                $d['en.json'][$sid] = $live['en.json'][$sid];
                self::writeJson("$dir/en.json", $d['en.json']);
            }
        }
        self::writeJson("$dir/meta.json", ['updated_at' => date('c'), 'updated_by' => $u['name'], 'restored_from' => $id]);
        Audit::log('catalog_version_loaded', 'catalog', $id);
        flock($lock, LOCK_UN);
        return ['ok' => true, 'changes' => array_keys(self::changed(self::draft(), self::live()))];
    }
}
