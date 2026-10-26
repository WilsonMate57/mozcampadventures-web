/**
 * MOZ CAMP ADVENTURES — protótipo Fase 2 (proto.js)
 * =====================================================
 * Renderiza a home e a página de pacote do protótipo a partir
 * de data/tours.json e data/accommodations.json (fonte real).
 * O cálculo de preço replica as regras actuais de data-loader.js,
 * packages-extras.js e packages-transfer.js — nada é inventado.
 * =====================================================
 */

(function () {
  'use strict';

  var WA_PHONE = '258844406543';
  var DATA = '../data/';

  var CATS = [
    { id: 'island-tours',         label: 'Island Tours',           icon: 'bx-water',          img: '../assets/images/packages/package_1.webp' },
    { id: 'sunset-cruise',        label: 'Sunset Cruises',         icon: 'bxs-sun',           img: '../assets/images/packages/sunset_cruise_1.webp' },
    { id: 'beach-tours',          label: 'Beach Tours',            icon: 'bx-swim',           img: '../assets/images/packages/beach_day_1.webp' },
    { id: 'safaris',              label: 'Safaris',                icon: 'bxs-binoculars',    img: '../assets/images/packages/safari/maputo-park/safari-maputo-park-1.webp' },
    { id: 'ocean-activities',     label: 'Ocean Activities',       icon: 'bx-anchor',         img: '../assets/images/packages/whale-watching/observacao_baleias_1.webp' },
    { id: 'island-accommodation', label: 'Alojamento nas ilhas',   icon: 'bxs-home-heart',    img: '../assets/images/accommodation/mamas-lodge/mamas_lodge_3.webp', href: '../pages/accommodations.html' },
    { id: 'city-tour',            label: 'Maputo City Tour',       icon: 'bxs-buildings',     img: '../assets/images/packages/maputo-tour/maputo-tour-1.webp' },
    { id: 'transfers',            label: 'Transfers',              icon: 'bxs-car',           img: '../assets/images/packages/transfers/marina-hotel-transfer-1.webp' }
  ];

  /* Opções de transfer privado por omissão — iguais a packages-transfer.js (produção) */
  var DEFAULT_TRANSFER = [
    { id: 'day-trip-transfer',  title: 'Transfer Privado Day Trip', subtitle: 'Ida e volta no mesmo dia', price: 25000 },
    { id: 'one-night-transfer', title: 'Transfer Privado — 1 Noite', subtitle: 'Regresso no dia seguinte', price: 30000 }
  ];

  /* ── Helpers ─────────────────────────────────────────────── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' MZN'; }
  function catOf(id) { return CATS.find(function (c) { return c.id === id; }); }
  function pkgUrl(p) { return 'pacote.html?id=' + encodeURIComponent(p.slug || p.id); }
  function active(list) { return list.filter(function (p) { return !p.disabled; }); }
  function minPeople(p) {
    var txt = (p.importantInfo || []).join(' ');
    var m = txt.match(/m[ií]nimo de (?:pessoas por reserva é de )?(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  var store = { tours: [], accom: [], all: [] };

  function load() {
    return Promise.all([
      fetch(DATA + 'tours.json').then(function (r) { return r.json(); }),
      fetch(DATA + 'accommodations.json').then(function (r) { return r.json(); })
    ]).then(function (res) {
      store.tours = res[0] || [];
      store.accom = res[1] || [];
      store.all = store.tours.concat(store.accom);
      return store;
    });
  }

  function byCat(catId) {
    return active(catId === 'island-accommodation' ? store.accom : store.tours.filter(function (p) { return p.category === catId; }));
  }
  function catHref(c) { return c.href || '../pages/tours.html?cat=' + c.id; }

  /* ── Header: mega-menu + menu mobile + rodapé ───────────── */
  function initChrome() {
    var mega = $('[data-mega]');
    if (mega) {
      mega.innerHTML = CATS.map(function (c) {
        var n = byCat(c.id).length;
        return '<a href="' + catHref(c) + '"><img src="' + c.img + '" alt="" loading="lazy"><span><strong>' + esc(c.label) + '</strong><small>' + n + (n === 1 ? ' opção' : ' opções') + '</small></span></a>';
      }).join('') + '<a class="mega-all text-link" href="../pages/tours.html">Ver todas as experiências <i class="bx bx-right-arrow-alt"></i></a>';

      var li = mega.parentElement, btn = $('button', li), closeT;
      function set(open) { li.dataset.open = open; btn.setAttribute('aria-expanded', open); }
      li.addEventListener('mouseenter', function () { clearTimeout(closeT); set(true); });
      li.addEventListener('mouseleave', function () { closeT = setTimeout(function () { set(false); }, 120); });
      btn.addEventListener('click', function () { set(li.dataset.open !== 'true'); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
    }

    var mNav = $('[data-mobile-nav]');
    if (mNav) {
      mNav.innerHTML = CATS.map(function (c) {
        return '<a href="' + catHref(c) + '">' + esc(c.label) + ' <small>' + byCat(c.id).length + '</small></a>';
      }).join('') + '<a href="../pages/contact.html">Contacto</a>';
    }
    var menu = $('#mobile-menu');
    var openBtn = $('[data-menu-open]');
    if (menu && openBtn) {
      function setMenu(open) {
        menu.dataset.open = open; openBtn.setAttribute('aria-expanded', open);
        document.body.style.overflow = open ? 'hidden' : '';
        if (open) $('[data-menu-close]', menu).focus(); else openBtn.focus();
      }
      openBtn.addEventListener('click', function () { setMenu(true); });
      $('[data-menu-close]', menu).addEventListener('click', function () { setMenu(false); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.dataset.open === 'true') setMenu(false); });
    }

    $$('[data-footer-cats]').forEach(function (ul) {
      ul.innerHTML = CATS.map(function (c) { return '<li><a href="' + catHref(c) + '">' + esc(c.label) + '</a></li>'; }).join('');
    });
    $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
  }

  /* ── Cartões ─────────────────────────────────────────────── */
  function card(p) {
    var c = catOf(p.category);
    return '<a class="xcard" href="' + pkgUrl(p) + '">' +
      '<div class="xcard__media"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">' +
        (c ? '<span class="chip chip--white"><i class="bx ' + c.icon + '"></i>' + esc(c.label) + '</span>' : '') + '</div>' +
      '<div class="xcard__body">' +
        '<div class="xcard__meta"><span><i class="bx bxs-map"></i>' + esc(p.location) + '</span>' + (p.duration ? '<span><i class="bx bx-time-five"></i>' + esc(p.duration) + '</span>' : '') + '</div>' +
        '<h3>' + esc(p.name) + '</h3>' +
        '<p class="xcard__desc">' + esc(p.description) + '</p>' +
        '<div class="xcard__foot"><div class="price"><small>Desde</small><strong>' + fmt(p.price_from) + '</strong> <span>' + esc(p.priceLabel || '') + '</span></div>' +
        '<span class="xcard__go" aria-hidden="true"><i class="bx bx-right-arrow-alt"></i></span></div>' +
      '</div></a>';
  }

  function stayCard(p) {
    return '<a class="stay" href="' + pkgUrl(p) + '">' +
      '<div class="stay__media"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">' + (p.badge ? '<span class="chip chip--white">' + esc(p.badge) + '</span>' : '') + '</div>' +
      '<div class="stay__body">' +
        '<div class="xcard__meta"><span><i class="bx bxs-map"></i>' + esc(p.location) + '</span><span><i class="bx bx-moon"></i>' + esc(p.duration) + '</span></div>' +
        '<h3>' + esc(p.name) + '</h3>' +
        '<ul>' + (p.features || p.highlights || []).slice(0, 3).map(function (f) { return '<li class="chip">' + esc(typeof f === 'string' ? f : f.label || f.text || '') + '</li>'; }).join('') + '</ul>' +
        '<div class="xcard__foot"><div class="price"><small>Desde</small><strong>' + fmt(p.price_from) + '</strong> <span>' + esc(p.priceLabel || '') + '</span></div><span class="xcard__go" aria-hidden="true"><i class="bx bx-right-arrow-alt"></i></span></div>' +
      '</div></a>';
  }

  function pick(ids) {
    return ids.split(',').map(function (id) { return store.all.find(function (p) { return p.id === id; }); }).filter(function (p) { return p && !p.disabled; });
  }

  /* ── HOME ────────────────────────────────────────────────── */
  function initHome() {
    var sel = $('[data-cat-select]');
    if (sel) CATS.forEach(function (c) { if (c.href) return; sel.insertAdjacentHTML('beforeend', '<option value="' + c.id + '">' + esc(c.label) + '</option>'); });
    var d = $('#f-date'); if (d) d.min = new Date().toISOString().split('T')[0];

    $$('.tile[data-cat]').forEach(function (t) {
      var items = [];
      t.dataset.cat.split(',').forEach(function (id) { items = items.concat(byCat(id)); });
      var min = Math.min.apply(null, items.map(function (p) { return p.price_from; }));
      $('[data-cat-meta]', t).textContent = items.length + (items.length === 1 ? ' opção' : ' opções') + ' · desde ' + fmt(min);
    });

    var feat = $('[data-featured]');
    if (feat) feat.innerHTML = pick(feat.dataset.ids).map(card).join('');
    var stays = $('[data-stays]');
    if (stays) stays.innerHTML = pick(stays.dataset.ids).map(stayCard).join('');

    initDestinations();
  }

  function initDestinations() {
    var list = $('[data-dest-list]'), visual = $('[data-dest-visual]'), caption = $('[data-dest-caption]');
    if (!list || !visual) return;
    var items = $$('.dest__item', list);
    items.forEach(function (li, i) {
      var p = store.all.find(function (x) { return x.id === li.dataset.pkg; }) || {};
      var pid = 'dest-panel-' + i;
      li.innerHTML =
        '<button type="button" aria-expanded="false" aria-controls="' + pid + '"><span class="dest__num">0' + (i + 1) + '</span><span class="dest__name">' + esc(li.dataset.name) + '</span><i class="bx bx-plus"></i></button>' +
        '<div class="dest__panel" id="' + pid + '"><div><p>' + esc(p.description || '') + '</p><a class="text-link" href="' + li.dataset.href + '">Explorar ' + esc(li.dataset.name) + ' <i class="bx bx-right-arrow-alt"></i></a></div></div>';
      var img = document.createElement('img');
      img.src = p.image || ''; img.alt = p.name || li.dataset.name; img.loading = 'lazy';
      visual.insertBefore(img, caption);
      li.querySelector('button').addEventListener('click', function () { openDest(i); });
    });
    function openDest(i) {
      items.forEach(function (li, j) { li.dataset.open = i === j; li.querySelector('button').setAttribute('aria-expanded', i === j); });
      $$('img', visual).forEach(function (img, j) { img.classList.toggle('is-active', i === j); });
      var p = store.all.find(function (x) { return x.id === items[i].dataset.pkg; });
      if (caption) caption.innerHTML = '<i class="bx bx-camera"></i> ' + esc(p ? p.name : items[i].dataset.name);
    }
    openDest(0);
  }

  /* ── PACOTE ──────────────────────────────────────────────── */
  function initPackage() {
    var root = $('[data-pkg-root]');
    var id = new URLSearchParams(location.search).get('id') || 'island-hopping-experience';
    var p = store.all.find(function (x) { return (x.slug || x.id) === id; });
    var isAccom = store.accom.indexOf(p) !== -1;

    if (!p || p.disabled) {
      root.innerHTML = '<div style="padding:96px 0;text-align:center"><span class="eyebrow">Indisponível</span><h1 style="font-size:var(--fs-2xl);margin:12px 0">Esta experiência não está disponível</h1><p class="lead">Pode ter sido removida ou estar temporariamente suspensa.</p><p style="margin-top:24px"><a class="btn-x btn-x--teal" href="../pages/tours.html">Ver experiências disponíveis</a></p></div>';
      return;
    }

    document.title = p.name + ' | Moz Camp Adventures';
    var c = catOf(p.category);
    var gallery = (p.gallery && p.gallery.length ? p.gallery : p.images && p.images.length ? p.images : [p.image]);
    var minPax = minPeople(p);
    var en = $('[data-en-link]'); if (en) en.href = '../en/pages/package.html?id=' + encodeURIComponent(id);

    var facts = [
      { i: 'bx-time-five', k: 'Duração', v: p.duration },
      { i: 'bxs-map', k: 'Local', v: p.location },
      { i: 'bx-map-alt', k: 'Destinos', v: p.destinations },
      { i: 'bx-group', k: 'Mínimo', v: minPax ? minPax + ' participantes' : 'Sem mínimo indicado' },
      { i: 'bx-child', k: 'Crianças', v: p.price_child ? (p.priceChildLabel || 'Crianças') + ' · ' + fmt(p.price_child) : 'Sem tarifa de criança' },
      { i: 'bx-calendar-x', k: 'Cancelamento', v: p.cancelPolicy ? 'Gratuito ' + p.cancelPolicy : 'Política a confirmar', pending: !p.cancelPolicy }
    ].filter(function (f) { return f.v; });

    var sections = [
      { id: 'visao', label: 'Visão geral' },
      p.itinerary && p.itinerary.length ? { id: 'itinerario', label: 'Itinerário' } : null,
      { id: 'inclui', label: 'Inclui' },
      p.menu && p.menu.length ? { id: 'menu', label: 'Menu' } : null,
      p.importantInfo && p.importantInfo.length ? { id: 'info', label: 'Informações' } : null,
      { id: 'reservar', label: 'Reservar' }
    ].filter(Boolean);

    root.innerHTML =
      '<nav class="crumbs" aria-label="Caminho"><a href="index.html">Início</a><span aria-hidden="true">/</span>' +
        '<a href="' + (isAccom ? '../pages/accommodations.html' : '../pages/tours.html?cat=' + p.category) + '">' + esc(c ? c.label : 'Tours') + '</a><span aria-hidden="true">/</span><span>' + esc(p.name) + '</span></nav>' +
      '<div class="pkg-title"><div>' +
        (c ? '<span class="chip"><i class="bx ' + c.icon + '"></i>' + esc(c.label) + '</span> ' : '') + (p.badge ? '<span class="chip chip--sun">' + esc(p.badge) + '</span>' : '') +
        '<h1>' + esc(p.name) + '</h1><p class="lead">' + esc(p.subtitle || '') + '</p>' +
        '<div class="pkg-meta"><span class="chip"><i class="bx bxs-map"></i>' + esc(p.location) + '</span><span class="chip"><i class="bx bx-time-five"></i>' + esc(p.duration) + '</span>' +
        '<span class="chip" data-rating hidden></span></div>' +
      '</div></div>' +

      '<div class="gallery">' + gallery.slice(0, 5).map(function (src, i) {
        return '<button type="button" class="' + (i === 0 ? 'gallery__main' : 'gallery__thumb') + '" data-gal="' + i + '" aria-label="Abrir fotografia ' + (i + 1) + ' de ' + gallery.length + '"><img src="' + esc(src) + '" alt="' + esc(p.name) + ' — fotografia ' + (i + 1) + '"' + (i ? ' loading="lazy"' : ' fetchpriority="high"') + '></button>';
      }).join('') +
      (gallery.length > 1 ? '<button type="button" class="btn-x btn-x--light btn-x--sm gallery__all" data-gal="0"><i class="bx bx-grid-alt"></i> Ver ' + gallery.length + ' fotos</button>' : '') + '</div>' +

      '<div class="pkg-layout"><div>' +
        '<nav class="anchor-nav" aria-label="Secções"><ul>' + sections.map(function (s) { return '<li><a href="#' + s.id + '">' + s.label + '</a></li>'; }).join('') + '</ul></nav>' +

        '<section class="pkg-block" id="visao"><h2>Visão geral</h2><div class="prose">' + (p.detailText || [p.description]).map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') + '</div>' +
          '<div class="facts">' + facts.map(function (f) { return '<div class="fact' + (f.pending ? ' is-pending' : '') + '"><i class="bx ' + f.i + '"></i><div><small>' + f.k + '</small><strong>' + esc(f.v) + '</strong></div></div>'; }).join('') + '</div>' +
          ((p.highlights || []).length ? '<h3 style="font-size:var(--fs-base);margin:32px 0 16px">Destaques</h3><ul class="checks checks--2">' + p.highlights.map(function (h) { return '<li><i class="bx bx-check"></i>' + esc(h) + '</li>'; }).join('') + '</ul>' : '') +
        '</section>' +

        (p.itinerary && p.itinerary.length ? '<section class="pkg-block" id="itinerario"><h2>Itinerário</h2><ol class="timeline">' + p.itinerary.map(function (s) {
          return '<li><time>' + esc(s.time) + '</time><div><h3>' + esc(s.title) + '</h3><p>' + esc(s.body) + '</p>' +
            (s.checklist && s.checklist.length ? '<ul class="checks">' + s.checklist.map(function (x) { return '<li><i class="bx bx-check"></i>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</div></li>';
        }).join('') + '</ol></section>' : '') +

        '<section class="pkg-block" id="inclui"><h2>O que está incluído</h2><div class="incexc">' +
          '<div><h3>Inclui</h3><ul class="checks">' + (p.includes || []).map(function (x) { return '<li><i class="bx bx-check"></i>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +
          '<div><h3>Não inclui</h3><ul class="checks checks--no">' + (p.excludes || []).map(function (x) { return '<li><i class="bx bx-x"></i>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +
        '</div></section>' +

        (p.menu && p.menu.length ? '<section class="pkg-block" id="menu"><h2>Menu</h2>' + p.menu.map(function (b) {
          return '<h3 style="font-size:var(--fs-base);margin-bottom:12px">' + esc(b.title) + '</h3><div class="menu-grid">' + (b.categories || []).map(function (cat) {
            return '<div class="menu-card"><h3>' + esc(cat.name) + '</h3><ul>' + (cat.items || []).map(function (it) { return '<li>' + esc(it) + '</li>'; }).join('') + '</ul></div>';
          }).join('') + '</div>';
        }).join('') + '</section>' : '') +

        (p.importantInfo && p.importantInfo.length ? '<section class="pkg-block" id="info"><h2>Informações importantes</h2><div class="notice"><i class="bx bx-info-circle"></i><ul>' + p.importantInfo.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div></section>' : '') +

              '</div>' +

      '<aside id="reservar" aria-labelledby="bk-title">' + bookingHtml(p, isAccom) + '</aside>' +
      '</div>' +
      '<section class="section" style="padding-bottom:0"><h2 style="font-size:var(--fs-xl);margin-bottom:24px">Também pode gostar</h2><div class="cards" data-related></div></section>';

    var related = active(store.all.filter(function (x) { return x !== p && x.category === p.category; })).slice(0, 3);
    $('[data-related]').innerHTML = related.map(card).join('') || '<p class="lead">Veja outras experiências no <a href="../pages/tours.html">catálogo</a>.</p>';
    $('[data-related]').parentElement.hidden = !related.length;

    initGallery(gallery);
    initAnchors();
    initBooking(p, minPax);

    var bar = $('[data-book-bar]');
    if (bar) { bar.hidden = false; $('[data-bar-price]').textContent = fmt(p.price_from); $('[data-bar-unit]').textContent = p.priceLabel || ''; }
  }

  function bookingHtml(p, isAccom) {
    var boats = p.privateBoatOptions || [];
    var extras = p.extras || [];
    var transfers = p.category === 'beach-tours' ? (p.privateTransferOptions || DEFAULT_TRANSFER) : [];
    var step = 1;
    function label(t) { return '<div class="bk-step__label"><b>' + (step++) + '</b>' + t + '</div>'; }

    return '<div class="booking">' +
      '<div class="booking__head"><div class="price"><small>Desde</small><strong>' + fmt(p.price_from) + '</strong> <span>' + esc(p.priceLabel || '') + '</span></div>' +
      '<h2 id="bk-title" class="visually-hidden">Pedir reserva</h2></div>' +
      '<form class="booking__body" novalidate data-booking>' +

        '<div class="bk-step">' + label(isAccom ? 'Data de entrada' : 'Data pretendida') +
          '<div class="field"><label for="bk-date">Data</label><input id="bk-date" type="date" required><span class="field__error">Escolha uma data.</span></div></div>' +

        '<div class="bk-step">' + label('Participantes') +
          '<div><div class="pax"><div><strong>' + esc(p.bookingPeopleLabel || 'Adultos') + '</strong><small>' + fmt(p.price_from) + ' ' + esc(p.priceLabel || '') + '</small></div>' +
            '<div class="stepper"><button type="button" data-step="adults:-1" aria-label="Menos adultos"><i class="bx bx-minus"></i></button><output data-out="adults">1</output><button type="button" data-step="adults:1" aria-label="Mais adultos"><i class="bx bx-plus"></i></button></div></div>' +
          (p.price_child ? '<div class="pax"><div><strong>Crianças</strong><small>' + esc(p.priceChildLabel || '') + ' · ' + fmt(p.price_child) + '</small></div>' +
            '<div class="stepper"><button type="button" data-step="children:-1" aria-label="Menos crianças"><i class="bx bx-minus"></i></button><output data-out="children">0</output><button type="button" data-step="children:1" aria-label="Mais crianças"><i class="bx bx-plus"></i></button></div></div>' : '') +
          '</div></div>' +

        (boats.length || extras.length || transfers.length ? '<div class="bk-step">' + label('Opções') +
          (boats.length ? '<fieldset style="display:grid;gap:8px"><legend class="visually-hidden">' + esc(p.boatSelectionLabel || 'Barco privado') + '</legend>' +
            (p.boatSelectionRequired ? '' : '<label class="opt"><input type="radio" name="boat" value="" checked><span><strong>Barco partilhado</strong><small>Preço por pessoa</small></span></label>') +
            boats.map(function (b, i) { return '<label class="opt"><input type="radio" name="boat" value="' + esc(b.id) + '"' + (p.boatSelectionRequired && i === 0 ? ' checked' : '') + '><span><strong>' + esc(b.title) + '</strong><small>' + esc(b.desc || '') + '</small></span><em>' + fmt(b.price) + '</em></label>'; }).join('') + '</fieldset>' : '') +
          (transfers.length ? '<fieldset style="display:grid;gap:8px"><legend class="visually-hidden">Transfer privado</legend>' +
            '<label class="opt"><input type="radio" name="transfer" value="" checked><span><strong>Sem transfer privado</strong><small>Transporte incluído no pacote</small></span></label>' +
            transfers.map(function (t) { return '<label class="opt"><input type="radio" name="transfer" value="' + esc(t.id) + '"><span><strong>' + esc(t.title) + '</strong><small>' + esc(t.subtitle || '') + '</small></span><em>+' + fmt(t.price) + '</em></label>'; }).join('') + '</fieldset>' : '') +
          extras.map(function (x) {
            var usd = x.currency === 'USD';
            var price = x.price ? (usd ? '$ ' + x.price : '+' + fmt(x.price)) + (x.priceUnit ? ' ' + esc(x.priceUnit) : x.perPerson ? '/pax' : '') : 'Incluído';
            return '<label class="opt"><input type="checkbox" name="extra" value="' + esc(x.id) + '"><span><strong>' + esc(x.title) + '</strong><small>' + esc(x.desc || '') + '</small></span><em>' + price + '</em></label>';
          }).join('') +
        '</div>' : '') +

        '<div class="bk-step">' + label('Os seus dados') +
          '<div class="field"><label for="bk-name">Nome completo</label><input id="bk-name" autocomplete="name" required><span class="field__error">Indique o seu nome.</span></div>' +
          '<div class="field-row"><div class="field"><label for="bk-phone">Telefone / WhatsApp</label><input id="bk-phone" type="tel" autocomplete="tel" placeholder="+258 84 000 0000" required><span class="field__error">Indique um contacto.</span></div>' +
          '<div class="field"><label for="bk-email">E-mail <span style="font-weight:400">(opcional)</span></label><input id="bk-email" type="email" autocomplete="email"></div></div>' +
        '</div>' +

        '<div class="summary" data-summary aria-live="polite"></div>' +
        '<button type="submit" class="btn-x btn-x--primary btn-x--block"><i class="bx bxl-whatsapp"></i> Enviar pedido de reserva</button>' +
        '<p class="booking__note"><i class="bx bx-info-circle"></i><span>Isto é um <strong>pedido</strong>, não uma reserva confirmada. A equipa confirma a disponibilidade e envia as instruções de pagamento (M-Pesa, e-Mola ou transferência).</span></p>' +
        '<p class="booking__alt">Prefere e-mail? <a href="mailto:booking@mozcampadventures.co.mz?subject=' + encodeURIComponent('Pedido de reserva — ' + p.name) + '">booking@mozcampadventures.co.mz</a></p>' +
      '</form></div>';
  }

  /* Cálculo — mesmas regras de data-loader.js:updateBookingTotal */
  function initBooking(p, minPax) {
    var form = $('[data-booking]');
    if (!form) return;
    var st = { adults: 1, children: 0 };
    var boats = p.privateBoatOptions || [];
    var transfers = p.category === 'beach-tours' ? (p.privateTransferOptions || DEFAULT_TRANSFER) : [];
    var date = $('#bk-date', form);
    date.min = new Date().toISOString().split('T')[0];

    function calc() {
      var boatId = (form.querySelector('input[name=boat]:checked') || {}).value || '';
      var boat = boats.find(function (b) { return b.id === boatId; });
      var capacity = boat && boat.capacity ? boat.capacity : 20;
      st.adults = Math.max(1, Math.min(capacity - st.children, st.adults));
      st.children = Math.max(0, Math.min(Math.min(10, capacity - st.adults), st.children));

      var lines = [], total = 0;
      if (boat) { total += boat.price; lines.push([boat.title, fmt(boat.price)]); }
      else {
        total += st.adults * p.price_from; lines.push(['Adultos ' + st.adults + ' × ' + fmt(p.price_from), fmt(st.adults * p.price_from)]);
        if (st.children) { total += st.children * p.price_child; lines.push(['Crianças ' + st.children + ' × ' + fmt(p.price_child), fmt(st.children * p.price_child)]); }
      }
      $$('input[name=extra]:checked', form).forEach(function (el) {
        var x = (p.extras || []).find(function (e) { return e.id === el.value; });
        if (!x) return;
        var amount = x.perPerson ? x.price * st.adults : x.price;
        if (x.currency === 'USD') { lines.push([x.title, '$ ' + amount + ' (pago à parte)']); return; }
        total += amount; lines.push([x.title, amount ? '+' + fmt(amount) : 'Incluído']);
      });
      var tId = (form.querySelector('input[name=transfer]:checked') || {}).value || '';
      var tr = transfers.find(function (t) { return t.id === tId; });
      if (tr) { total += tr.price; lines.push([tr.title, '+' + fmt(tr.price)]); }

      $$('[data-out]', form).forEach(function (o) { o.textContent = st[o.dataset.out]; });
      $$('[data-step]', form).forEach(function (b) {
        var parts = b.dataset.step.split(':'), k = parts[0], d = +parts[1];
        b.disabled = d < 0 ? st[k] <= (k === 'adults' ? 1 : 0) : (st.adults + st.children >= capacity || (k === 'children' && st.children >= 10));
      });

      var pax = st.adults + st.children;
      var warn = minPax && pax < minPax ? '<div class="is-warn"><span><i class="bx bx-error-circle"></i> Mínimo indicado: ' + minPax + ' participantes. A equipa confirma se é possível.</span></div>' : '';
      $('[data-summary]', form).innerHTML = lines.map(function (l) { return '<div><span>' + esc(l[0]) + '</span><span>' + esc(l[1]) + '</span></div>'; }).join('') + warn +
        '<div class="summary__total"><span>Total estimado</span><span>' + fmt(total) + '</span></div>';
      return { total: total, lines: lines, boat: boat, pax: pax };
    }

    form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-step]'); if (!b) return;
      var parts = b.dataset.step.split(':'); st[parts[0]] += +parts[1]; calc();
    });
    form.addEventListener('change', calc);
    calc();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      ['bk-date', 'bk-name', 'bk-phone'].forEach(function (id) {
        var el = $('#' + id, form), bad = !el.value.trim();
        el.closest('.field').classList.toggle('has-error', bad);
        el.setAttribute('aria-invalid', bad);
        if (bad && ok) { el.focus(); ok = false; }
      });
      if (!ok) return;
      var r = calc();
      var dateFmt = new Date(date.value + 'T00:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
      var msg = 'Olá Moz Camp Adventures 👋\n\nGostaria de pedir a reserva de:\n\n' +
        'Experiência: ' + p.name + '\nData: ' + dateFmt + '\nParticipantes: ' + r.pax + ' (' + st.adults + ' adultos' + (st.children ? ', ' + st.children + ' crianças' : '') + ')\n\n' +
        r.lines.map(function (l) { return '• ' + l[0] + ': ' + l[1]; }).join('\n') +
        '\n\nTotal estimado: ' + fmt(r.total) + '\n\nNome: ' + $('#bk-name', form).value.trim() + '\nTelefone: ' + $('#bk-phone', form).value.trim() +
        '\n\nPor favor, confirmem a disponibilidade.';
      window.open('https://wa.me/' + WA_PHONE + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    });
  }

  function initGallery(images) {
    var lb = $('[data-lightbox]'); if (!lb) return;
    var img = $('[data-lb-img]', lb), count = $('[data-lb-count]', lb), cur = 0, opener;
    function show(i) { cur = (i + images.length) % images.length; img.src = images[cur]; count.textContent = (cur + 1) + ' / ' + images.length; }
    function open(i, from) { opener = from; show(i); lb.dataset.open = 'true'; document.body.style.overflow = 'hidden'; $('[data-lb-close]', lb).focus(); }
    function close() { lb.dataset.open = 'false'; document.body.style.overflow = ''; if (opener) opener.focus(); }
    $$('[data-gal]').forEach(function (b) { b.addEventListener('click', function () { open(+b.dataset.gal, b); }); });
    $('[data-lb-close]', lb).addEventListener('click', close);
    $('[data-lb-prev]', lb).addEventListener('click', function () { show(cur - 1); });
    $('[data-lb-next]', lb).addEventListener('click', function () { show(cur + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    document.addEventListener('keydown', function (e) {
      if (lb.dataset.open !== 'true') return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(cur - 1);
      if (e.key === 'ArrowRight') show(cur + 1);
    });
  }

  function initAnchors() {
    var links = $$('.anchor-nav a');
    if (!('IntersectionObserver' in window) || !links.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id); });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    links.forEach(function (a) { var t = $(a.getAttribute('href')); if (t) io.observe(t); });
  }

  /* ── Init ───────────────────────────────────────────────── */
  load().then(function () {
    initChrome();
    if (document.body.dataset.page === 'home') initHome();
    if (document.body.dataset.page === 'package') initPackage();
  }).catch(function (err) {
    console.error('[MCA proto] Falha ao carregar dados:', err);
  });

})();
