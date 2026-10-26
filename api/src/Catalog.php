<?php
/**
 * MOZ CAMP ADVENTURES — api/src/Catalog.php
 * Lê o catálogo (data/*.json) — a mesma fonte de verdade do site —
 * e calcula o preço de um pedido no servidor (mesmas regras de assets/js/site.js).
 */

declare(strict_types=1);

final class Catalog
{
    private static ?array $cache = null;

    private static function load(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $dir = config('app.data_dir') ?: dirname(__DIR__, 2) . '/data';
        $read = static function (string $f) use ($dir): array {
            $json = json_decode((string) file_get_contents("$dir/$f"), true);
            if (!is_array($json)) {
                throw new RuntimeException("Catálogo inválido: $f");
            }
            return $json;
        };
        $items = [];
        foreach ($read('tours.json') as $p) {
            $items[$p['slug'] ?? $p['id']] = $p + ['_kind' => 'tour'];
        }
        foreach ($read('accommodations.json') as $p) {
            $items[$p['slug'] ?? $p['id']] = $p + ['_kind' => 'stay'];
        }
        return self::$cache = ['items' => $items, 'en' => $read('en.json'), 'rules' => $read('booking-rules.json')];
    }

    /** Item localizado + regras, ou null. */
    public static function find(string $id, string $lang): ?array
    {
        $c = self::load();
        $item = $c['items'][$id] ?? null;
        if ($item === null) {
            return null;
        }
        if ($lang === 'en' && isset($c['en'][$id])) {
            $tr = $c['en'][$id];
            $item['name'] = $tr['name'] ?? $item['name'];
            foreach (['extras', 'privateBoatOptions', 'privateTransferOptions'] as $k) {
                if (!empty($item[$k]) && !empty($tr[$k])) {
                    $byId = array_column($tr[$k], null, 'id');
                    foreach ($item[$k] as &$o) {
                        $o['title'] = $byId[$o['id']]['title'] ?? $o['title'];
                    }
                    unset($o);
                }
            }
        }
        $item['_rules'] = $c['rules'][$id] ?? [];
        $item['_lang'] = $lang;
        return $item;
    }

    public static function defaultTransfers(string $lang): array
    {
        return array_map(static fn (array $o) => ['id' => $o['id'], 'price' => $o['price'], 'title' => $o[$lang]['title']], self::load()['rules']['_defaultTransfers'] ?? []);
    }
}

final class Pricing
{
    private const L = [
        'pt' => ['adults' => 'Adultos', 'children' => 'Crianças', 'night' => 'noite', 'nights' => 'noites', 'included' => 'Incluído', 'paidApart' => 'pago à parte'],
        'en' => ['adults' => 'Adults', 'children' => 'Children', 'night' => 'night', 'nights' => 'nights', 'included' => 'Included', 'paidApart' => 'paid separately'],
    ];

    /**
     * Valida o pedido e calcula o total. Lança ApiError(422) com o código do problema.
     * @return array{lines: list<array{label:string, amount:?int, note?:string}>, total:int, to_confirm:bool, nights:?int, pax:int, options:array, dates:array}
     */
    public static function quote(array $item, array $in): array
    {
        $lang = $item['_lang'];
        $t = self::L[$lang];
        $rules = $item['_rules'];
        $isStay = $item['_kind'] === 'stay';
        if (!empty($item['disabled'])) {
            throw new ApiError(422, 'item_unavailable');
        }

        /* Datas (fuso Africa/Maputo) */
        $today = new DateTimeImmutable('today');
        $limit = $today->modify('+2 years');
        $date = static function ($v, string $code) use ($today, $limit): DateTimeImmutable {
            $d = is_string($v) ? DateTimeImmutable::createFromFormat('!Y-m-d', $v) : false;
            if (!$d || $d->format('Y-m-d') !== $v) {
                throw new ApiError(422, $code);
            }
            if ($d < $today || $d > $limit) {
                throw new ApiError(422, 'date_out_of_range');
            }
            return $d;
        };
        $dates = [];
        $nights = null;
        if ($isStay) {
            $in1 = $date($in['checkin'] ?? null, 'invalid_checkin');
            $out = $date($in['checkout'] ?? null, 'invalid_checkout');
            $nights = (int) $in1->diff($out)->format('%r%a');
            if ($nights < 1) {
                throw new ApiError(422, 'invalid_checkout');
            }
            $minNights = (int) ($rules['minNights'] ?? 1);
            if ($nights < $minNights) {
                throw new ApiError(422, 'min_nights', '', ['min' => $minNights]);
            }
            $dates = ['checkin' => $in1->format('Y-m-d'), 'checkout' => $out->format('Y-m-d')];
        } else {
            $dates = ['service_date' => $date($in['date'] ?? null, 'invalid_date')->format('Y-m-d')];
        }

        /* Participantes */
        $adults = filter_var($in['adults'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100]]);
        $children = filter_var($in['children'] ?? 0, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 10]]);
        if ($adults === false || $children === false) {
            throw new ApiError(422, 'invalid_people');
        }
        if (empty($item['price_child'])) {
            $children = 0;
        }

        /* Opções: só as que existem para este item */
        $boats = array_column($item['privateBoatOptions'] ?? [], null, 'id');
        $boat = null;
        if (!empty($in['boat'])) {
            $boat = $boats[$in['boat']] ?? throw new ApiError(422, 'invalid_option', '', ['field' => 'boat']);
        } elseif (!empty($item['boatSelectionRequired'])) {
            throw new ApiError(422, 'boat_required');
        }
        $transfers = ($item['category'] ?? '') === 'beach-tours'
            ? array_column($item['privateTransferOptions'] ?? Catalog::defaultTransfers($lang), null, 'id') : [];
        $transfer = null;
        if (!empty($in['transfer'])) {
            $transfer = $transfers[$in['transfer']] ?? throw new ApiError(422, 'invalid_option', '', ['field' => 'transfer']);
        }
        $extrasById = array_column($item['extras'] ?? [], null, 'id');
        $extras = [];
        foreach (array_unique(array_filter((array) ($in['extras'] ?? []), 'is_string')) as $eid) {
            $extras[] = $extrasById[$eid] ?? throw new ApiError(422, 'invalid_option', '', ['field' => 'extras']);
        }

        $cap = $boat && !empty($boat['capacity']) ? (int) $boat['capacity'] : (int) ($rules['maxPeople'] ?? $item['maxPeople'] ?? 20);
        $pax = $adults + $children;
        if ($pax > $cap) {
            throw new ApiError(422, 'capacity', '', ['max' => $cap]);
        }
        $min = (int) ($rules['minPeople'] ?? 0);
        if ($min && $pax < $min) {
            throw new ApiError(422, 'min_people', '', ['min' => $min]);
        }

        /* Preço */
        $price = (int) $item['price_from'];
        $child = (int) ($item['price_child'] ?? 0);
        $pricing = $rules['pricing'] ?? ($isStay ? 'per-person-night' : 'per-person');
        $nLabel = $nights === null ? '' : ($nights === 1 ? "1 {$t['night']}" : "$nights {$t['nights']}");
        $lines = [];
        $total = 0;
        $toConfirm = false;

        if ($boat) {
            $total = (int) $boat['price'];
            $lines[] = ['label' => $boat['title'], 'amount' => $total];
        } elseif ($pricing === 'per-group') {
            $total = $price;
            $lines[] = ['label' => $item['name'] . (!empty($item['priceLabel']) ? " ({$item['priceLabel']})" : ''), 'amount' => $price];
        } elseif ($pricing === 'per-unit-night') {
            $total = $price * $nights;
            $lines[] = ['label' => self::fmt($price) . " × $nLabel", 'amount' => $total];
        } elseif ($isStay && !empty($rules['nightRates'])) {
            $rate = self::nightRate($rules['nightRates'], $nights);
            if ($rate) {
                $total = $adults * $rate[0];
                $lines[] = ['label' => "{$t['adults']} $adults × " . self::fmt($rate[0]) . " ($nLabel)", 'amount' => $adults * $rate[0]];
                if ($children) {
                    $total += $children * $rate[1];
                    $lines[] = ['label' => "{$t['children']} $children × " . self::fmt($rate[1]) . " ($nLabel)", 'amount' => $children * $rate[1]];
                }
            } else {
                $toConfirm = true;
                $lines[] = ['label' => "$nLabel · $adults {$t['adults']}" . ($children ? ", $children {$t['children']}" : ''), 'amount' => null];
            }
        } else {
            $mult = $isStay ? $nights : 1;
            $suffix = $isStay ? " × $nLabel" : '';
            $total = $adults * $price * $mult;
            $lines[] = ['label' => "{$t['adults']} $adults × " . self::fmt($price) . $suffix, 'amount' => $total];
            if ($children) {
                $total += $children * $child * $mult;
                $lines[] = ['label' => "{$t['children']} $children × " . self::fmt($child) . $suffix, 'amount' => $children * $child * $mult];
            }
        }
        foreach ($extras as $x) {
            $amount = !empty($x['perPerson']) ? (int) $x['price'] * $adults : (int) $x['price'];
            if (($x['currency'] ?? 'MZN') === 'USD') {
                $lines[] = ['label' => $x['title'], 'amount' => null, 'note' => "USD $amount ({$t['paidApart']})"];
                continue;
            }
            $total += $amount;
            $lines[] = ['label' => $x['title'], 'amount' => $amount];
        }
        if ($transfer) {
            $total += (int) $transfer['price'];
            $lines[] = ['label' => $transfer['title'], 'amount' => (int) $transfer['price']];
        }

        return [
            'lines' => $lines, 'total' => $total, 'to_confirm' => $toConfirm, 'nights' => $nights, 'pax' => $pax,
            'adults' => $adults, 'children' => $children, 'dates' => $dates,
            'options' => ['boat' => $boat['id'] ?? null, 'transfer' => $transfer['id'] ?? null, 'extras' => array_column($extras, 'id')],
        ];
    }

    /** Tarifas publicadas para 1 e 2 noites; cada noite adicional soma a tarifa de 1 noite. */
    public static function nightRate(array $rates, int $nights): ?array
    {
        if (isset($rates[(string) $nights])) {
            return $rates[(string) $nights];
        }
        $top = max(array_map('intval', array_keys($rates)));
        if ($nights > $top && isset($rates['1'])) {
            $extra = $nights - $top;
            return [$rates[(string) $top][0] + $extra * $rates['1'][0], $rates[(string) $top][1] + $extra * $rates['1'][1]];
        }
        return null;
    }

    public static function fmt(int|float $n): string
    {
        return number_format((float) $n, 0, ',', '.') . ' MZN';
    }
}
