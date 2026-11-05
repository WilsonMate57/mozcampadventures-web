/**
 * MOZ CAMP ADVENTURES — site.js
 * =====================================================
 * Comportamento do site público (páginas geradas por scripts/build.mjs):
 *   1. Cabeçalho: mega-menu, menu mobile, idioma
 *   2. Datas mínimas, barra de procura da home
 *   3. Catálogo / alojamentos: filtros, pesquisa, ordenação
 *   4. Destinos (acordeão), galeria + lightbox, menu de secções
 *   5. Pedido de reserva (cálculo + regras → POST /api/bookings → referência;
 *      sem API disponível, envio directo por WhatsApp/e-mail)
 *   6. Formulário de contacto (POST /api/contact ou WhatsApp)
 *   7. Analytics (eventos mcaTrack existentes)
 * O preço calculado aqui é uma ESTIMATIVA para o cliente; o servidor
 * recalcula-o a partir do catálogo (api/src/Catalog.php).
 * =====================================================
 */

(function () {
  'use strict';

  var WA = '258844406543';

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function track(ev, params) { if (typeof window.mcaTrack === 'function') window.mcaTrack(ev, params || {}); }
  function fmt(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' MZN'; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function localISO(d) { var z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }
  function addDays(iso, n) { var d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return localISO(d); }

  /* ── 1. Cabeçalho ───────────────────────────────────────── */
  function initHeader() {
    var mega = $('.has-mega');
    if (mega) {
      var btn = $('button', mega), timer;
      var set = function (open) { mega.dataset.open = open; btn.setAttribute('aria-expanded', open); };
      mega.addEventListener('mouseenter', function () { clearTimeout(timer); set(true); });
      mega.addEventListener('mouseleave', function () { timer = setTimeout(function () { set(false); }, 120); });
      btn.addEventListener('click', function () { set(mega.dataset.open !== 'true'); });
      mega.addEventListener('focusout', function (e) { if (!mega.contains(e.relatedTarget)) set(false); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mega.dataset.open === 'true') { set(false); btn.focus(); } });
    }

    var menu = $('#mobile-menu'), open = $('[data-menu-open]');
    if (menu && open) {
      var setMenu = function (v) {
        menu.dataset.open = v; open.setAttribute('aria-expanded', v);
        document.body.style.overflow = v ? 'hidden' : '';
        (v ? $('[data-menu-close]', menu) : open).focus();
      };
      open.addEventListener('click', function () { setMenu(true); });
      $('[data-menu-close]', menu).addEventListener('click', function () { setMenu(false); });
      $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.dataset.open === 'true') setMenu(false); });
    }

    /* Mudar de idioma mantém filtros (?cat=, ?loc=, ?q=) e âncora */
    $$('[data-lang-link]').forEach(function (a) {
      a.addEventListener('click', function () {
        if (location.search || location.hash) a.href = a.getAttribute('href').split(/[?#]/)[0] + location.search + location.hash;
      });
    });
  }

  /* ── 2. Datas e procura ─────────────────────────────────── */
  function initDates() {
    var today = localISO(new Date());
    $$('[data-min-today]').forEach(function (el) { el.min = today; });
  }

  function initFinder() {
    var f = $('[data-finder]');
    if (!f) return;
    f.addEventListener('submit', function (e) {
      var cat = f.elements.cat.value;
      track('click_hero_cta', { cta_text: 'finder', cta_link: cat || 'all' });
      if (cat === 'island-accommodation') {
        e.preventDefault();
        location.href = (document.documentElement.lang === 'en' ? '/en' : '') + '/pages/accommodations.html';
      } else if (!cat) {
        f.elements.cat.disabled = true;
      }
      if (!f.elements.date.value) f.elements.date.disabled = true;
    });
  }

  /* Slider do topo da home: avança a cada 6 s; pára com o rato, o foco ou o separador escondido; botão de pausa;
     setas, pontos, teclado (← →) e deslizar no telemóvel. Com «reduzir movimento», não avança sozinho. */
  function initHeroSlider() {
    var root = $('[data-hero]');
    if (!root) return;
    var slides = $$('[data-slide]', root), dots = $$('[data-hero-dot]', root), pauseBtn = $('[data-hero-pause]', root);
    if (slides.length < 2) return;
    var cur = 0, timer = null, hovering = false, focused = false;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var paused = reduced;   // pausa escolhida pelo utilizador (ou movimento reduzido)

    function show(i) {
      cur = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) {
        var on = k === cur;
        s.classList.toggle('is-active', on);
        if (on) { s.removeAttribute('aria-hidden'); s.removeAttribute('inert'); }
        else { s.setAttribute('aria-hidden', 'true'); s.setAttribute('inert', ''); }
      });
      dots.forEach(function (d, k) { if (k === cur) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    }
    function stop() { clearInterval(timer); timer = null; }
    function sync() {
      stop();
      if (!paused && !hovering && !focused && !document.hidden) timer = setInterval(function () { show(cur + 1); }, 6000);
      pauseBtn.setAttribute('aria-label', paused ? pauseBtn.dataset.labelPlay : pauseBtn.dataset.labelPause);
      pauseBtn.innerHTML = '<i class="bx ' + (paused ? 'bx-play' : 'bx-pause') + '"></i>';
    }
    function go(i, how) { show(i); sync(); track('hero_slide', { slide: cur + 1, via: how }); }

    $('[data-hero-prev]', root).addEventListener('click', function () { go(cur - 1, 'arrow'); });
    $('[data-hero-next]', root).addEventListener('click', function () { go(cur + 1, 'arrow'); });
    dots.forEach(function (d) { d.addEventListener('click', function () { go(+d.dataset.heroDot, 'dot'); }); });
    pauseBtn.addEventListener('click', function () { paused = !paused; sync(); });
    root.addEventListener('mouseenter', function () { hovering = true; sync(); });
    root.addEventListener('mouseleave', function () { hovering = false; sync(); });
    root.addEventListener('focusin', function () { focused = true; sync(); });
    root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) { focused = false; sync(); } });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1, 'key'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1, 'key'); }
    });
    document.addEventListener('visibilitychange', sync);
    /* Deslizar (toque): mais de 40 px na horizontal e mais horizontal do que vertical */
    var x0 = null, y0 = 0;
    root.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(cur + (dx < 0 ? 1 : -1), 'swipe');
    }, { passive: true });
    $$('[data-slide-cta]', root).forEach(function (a) { a.addEventListener('click', function () { track('click_hero_cta', { cta_text: 'slide', cta_link: a.dataset.slideCta }); }); });
    sync();
  }

  /* Pacotes de férias (/holiday-packages/): «Expand all days» e pedidos por WhatsApp/e-mail */
  function initHolidayPackages() {
    $$('[data-hp-days]').forEach(function (btn) {
      var list = document.getElementById(btn.getAttribute('aria-controls'));
      if (!list) return;
      var days = $$('details', list);
      function label() {
        var all = days.every(function (d) { return d.open; });
        btn.textContent = all ? 'Collapse all days' : 'Expand all days';
        btn.setAttribute('aria-expanded', String(all));
      }
      btn.addEventListener('click', function () {
        var open = !days.every(function (d) { return d.open; });
        days.forEach(function (d) { d.open = open; });
        label();
      });
      days.forEach(function (d) { d.addEventListener('toggle', label); });
      label();
    });
    $$('[data-hp-cta]').forEach(function (a) {
      a.addEventListener('click', function () { track('holiday_package_enquiry', { channel: a.dataset.hpCta, package: a.dataset.hpPackage }); });
    });
  }

  /* ── 3. Catálogo ────────────────────────────────────────── */
  function initCatalog() {
    var root = $('[data-catalog]');
    if (!root) return;
    var key = root.dataset.key || 'cat';
    var grid = $('[data-grid]', root), cards = $$('[data-card]', grid);
    var chips = $$('[data-filter]', root), search = $('[data-search]', root), sort = $('[data-sort]', root);
    var count = $('[data-count]', root), empty = $('[data-empty]', root);
    var tpl = count ? JSON.parse(count.dataset.countTpl) : null;
    cards.forEach(function (c, i) { c.dataset.order = i; });

    var params = new URLSearchParams(location.search);
    var state = { f: params.get(key) || '', q: params.get('q') || params.get('search') || '', s: '' };
    if (state.f && !chips.some(function (c) { return c.dataset.filter === state.f; })) state.f = '';
    if (search) search.value = state.q;

    function apply(push) {
      var q = norm(state.q).trim(), n = 0;
      chips.forEach(function (c) { c.setAttribute('aria-pressed', c.dataset.filter === state.f); });
      cards.forEach(function (c) {
        var okF = !state.f || c.dataset[key] === state.f;
        var okQ = !q || norm(c.dataset.search || c.textContent).indexOf(q) !== -1;
        c.hidden = !(okF && okQ);
        if (!c.hidden) n++;
      });
      var sorted = cards.slice().sort(function (a, b) {
        if (state.s === 'asc') return a.dataset.price - b.dataset.price;
        if (state.s === 'desc') return b.dataset.price - a.dataset.price;
        return a.dataset.order - b.dataset.order;
      });
      sorted.forEach(function (c) { grid.appendChild(c); });
      if (count && tpl) count.textContent = n === 1 ? tpl.one : tpl.many.replace('{n}', n);
      if (empty) empty.hidden = n > 0;
      if (push) {
        var p = new URLSearchParams(location.search);
        state.f ? p.set(key, state.f) : p.delete(key);
        state.q ? p.set('q', state.q) : p.delete('q');
        p.delete('search');
        history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash);
      }
    }

    chips.forEach(function (c) { c.addEventListener('click', function () { state.f = c.dataset.filter; apply(true); }); });
    if (search) {
      var t;
      search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { state.q = search.value; apply(true); }, 150); });
    }
    if (sort) sort.addEventListener('change', function () { state.s = sort.value; apply(false); });
    var reset = $('[data-reset]', root);
    if (reset) reset.addEventListener('click', function () { state.f = ''; state.q = ''; if (search) search.value = ''; apply(true); });
    if (location.hash === '#procurar' && search) setTimeout(function () { search.focus(); }, 50);
    apply(false);
  }

  /* ── 4. Destinos, galeria, secções ──────────────────────── */
  function initDestinations() {
    var list = $('[data-dest]');
    if (!list) return;
    var items = $$('.dest__item', list), imgs = $$('.dest__visual img'), cap = $('[data-dest-caption]');
    items.forEach(function (li, i) {
      $('button', li).addEventListener('click', function () {
        items.forEach(function (x, j) { x.dataset.open = i === j; $('button', x).setAttribute('aria-expanded', i === j); });
        imgs.forEach(function (im, j) { im.classList.toggle('is-active', i === j); });
        if (cap) cap.innerHTML = '<i class="bx bx-camera"></i> ' + esc(li.dataset.caption);
      });
    });
  }

  function initGallery() {
    var lb = $('[data-lightbox]'), data = $('#gallery-data');
    if (!lb || !data) return;
    var images = JSON.parse(data.textContent), img = $('[data-lb-img]', lb), count = $('[data-lb-count]', lb), cur = 0, opener;
    var show = function (i) { cur = (i + images.length) % images.length; img.src = images[cur]; count.textContent = (cur + 1) + ' / ' + images.length; };
    var close = function () { lb.dataset.open = 'false'; document.body.style.overflow = ''; if (opener) opener.focus(); };
    $$('[data-gal]').forEach(function (b) {
      b.addEventListener('click', function () { opener = b; show(+b.dataset.gal); lb.dataset.open = 'true'; document.body.style.overflow = 'hidden'; $('[data-lb-close]', lb).focus(); });
    });
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
    var tx = 0;
    lb.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) { var dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1)); }, { passive: true });
  }

  function initAnchors() {
    var links = $$('.anchor-nav a');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id); });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    links.forEach(function (a) { var s = $(a.getAttribute('href')); if (s) io.observe(s); });
  }

  /* ── 5. Pedido de reserva ───────────────────────────────── */
  function initBooking() {
    var form = $('[data-booking]'), dataEl = $('#booking-data');
    if (!form || !dataEl) return;
    var d = JSON.parse(dataEl.textContent), t = d.t;
    var isStay = d.kind === 'stay';
    var st = { adults: Math.max(1, d.minPeople || 1), children: 0 };
    var errBox = $('[data-booking-error]', form);
    var inEl = $('#bk-in', form), outEl = $('#bk-out', form), dateEl = $('#bk-date', form);
    var lastTrack = '';

    /* Disponibilidade real: calendário no lugar do campo de data; sem API, fica o campo normal (o servidor valida sempre) */
    var av = { on: false, days: {}, month: null, today: '', session: '', sessions: [], left: null, stayBad: false };
    function avFetch(from, to) {
      return fetch('/api/availability?item=' + encodeURIComponent(d.id) + '&from=' + from + '&to=' + to, { credentials: 'same-origin', cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('api')); });
    }
    function monthRange(m) {
      var y = +m.slice(0, 4), mo = +m.slice(5, 7), last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      return [m + '-01', m + '-' + String(last).padStart(2, '0')];
    }
    function avLoad(m) {
      var r = monthRange(m);
      return avFetch(r[0], r[1]).then(function (x) {
        av.today = x.today;
        Object.keys(x.days).forEach(function (k) { av.days[k] = x.days[k]; });
        return x;
      });
    }
    function avMonthShift(m, n) {
      var dt = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1));
      return dt.toISOString().slice(0, 7);
    }
    function avLabel(s) { return { available: t.avAvailable, limited: t.avLimited, sold_out: t.avSoldOut }[s] || t.avUnavailable; }
    function avRender() {
      var box = $('[data-avail]', form);
      if (!box) return;
      var loc = d.lang === 'en' ? 'en-GB' : 'pt-PT', m = av.month, r = monthRange(m);
      var first = new Date(r[0] + 'T12:00:00Z'), pad = (first.getUTCDay() + 6) % 7, n = +r[1].slice(8);
      var title = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);
      title = title.charAt(0).toUpperCase() + title.slice(1);
      var heads = [], cells = [];
      for (var w = 0; w < 7; w++) heads.push('<span aria-hidden="true">' + esc(new Intl.DateTimeFormat(loc, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + w)))) + '</span>');
      for (var p = 0; p < pad; p++) cells.push('<span></span>');
      for (var i = 1; i <= n; i++) {
        var iso = m + '-' + String(i).padStart(2, '0'), v = av.days[iso] || { status: 'closed' }, ok = v.status === 'available' || v.status === 'limited';
        var long = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
        cells.push('<button type="button" class="avail__day is-' + v.status + '" data-av-day="' + iso + '"' + (ok ? '' : ' disabled') + (dateEl.value === iso ? ' aria-pressed="true"' : ' aria-pressed="false"') + ' aria-label="' + esc(long + ': ' + avLabel(v.status)) + '">' + i + '</button>');
      }
      box.innerHTML = '<div class="avail__head"><button type="button" data-av-go="-1" aria-label="' + esc(t.avPrev) + '"' + (m <= av.today.slice(0, 7) ? ' disabled' : '') + '><i class="bx bx-chevron-left"></i></button><strong aria-live="polite">' + esc(title) + '</strong><button type="button" data-av-go="1" aria-label="' + esc(t.avNext) + '"><i class="bx bx-chevron-right"></i></button></div>' +
        '<div class="avail__grid" role="group" aria-label="' + esc(t.dateLabel) + '">' + heads.join('') + cells.join('') + '</div>' +
        '<ul class="avail__legend"><li class="is-available">' + esc(t.avAvailable) + '</li><li class="is-limited">' + esc(t.avLimited) + '</li><li class="is-sold_out">' + esc(t.avSoldOut) + '</li></ul>' +
        '<div data-av-sessions></div><p class="avail__note" data-av-note aria-live="polite"></p>';
      avDetail();
    }
    function avDetail() {
      var v = av.days[dateEl.value], box = $('[data-av-sessions]', form), note = $('[data-av-note]', form);
      if (!box) return;
      av.sessions = v && v.sessions ? v.sessions : [];
      if (av.sessions.length === 1 && av.sessions[0].status !== 'sold_out') av.session = av.sessions[0].time;
      if (!av.sessions.some(function (s) { return s.time === av.session; })) av.session = '';
      box.innerHTML = av.sessions.length ? '<p class="avail__sub">' + esc(t.avSession) + '</p><div class="avail__sessions">' + av.sessions.map(function (s) {
        var ok = s.status === 'available' || s.status === 'limited';
        return '<label class="avail__session' + (ok ? '' : ' is-off') + '"><input type="radio" name="bk-session" value="' + esc(s.time) + '"' + (ok ? '' : ' disabled') + (av.session === s.time ? ' checked' : '') + '><span>' + esc(s.time) + '</span>' + (ok ? '' : '<small>' + esc(avLabel(s.status)) + '</small>') + '</label>';
      }).join('') + '</div>' : '';
      var cur = av.sessions.filter(function (s) { return s.time === av.session; })[0];
      av.left = cur ? cur.left : (v && !av.sessions.length ? v.left : null);
      note.textContent = av.left === null || av.left === undefined ? '' : (av.left === 1 ? t.avLeft1 : t.avLeftN.replace('{n}', av.left));
      calc();
    }
    /* Reconsulta o mês: se a data escolhida deixou de estar disponível, retira-a e avisa */
    function avRefresh() {
      if (!av.on) return Promise.resolve();
      return avLoad(av.month).then(function () {
        var v = av.days[dateEl.value], gone = dateEl.value && (!v || (v.status !== 'available' && v.status !== 'limited'));
        if (gone) { dateEl.value = ''; av.session = ''; }
        avRender();
        if (gone) $('[data-av-note]', form).textContent = t.avGone;
      }).catch(function () {});
    }
    function avStayCheck() {
      if (!inEl.value || !outEl.value || outEl.value <= inEl.value) { av.stayBad = false; calc(); return; }
      avFetch(inEl.value, addDays(outEl.value, -1)).then(function (x) {
        av.stayBad = Object.keys(x.days).some(function (k) { var s = x.days[k].status; return s !== 'available' && s !== 'limited'; });
        calc();
      }).catch(function () {});
    }
    function initAvailability() {
      if (isStay) {
        [inEl, outEl].forEach(function (el) { el.addEventListener('change', avStayCheck); });
        return;
      }
      if (!dateEl) return;
      av.month = localISO(new Date()).slice(0, 7);
      avLoad(av.month).then(function () {
        av.month = av.today.slice(0, 7);
        av.on = true;
        var box = document.createElement('div');
        box.className = 'avail';
        box.setAttribute('data-avail', '');
        dateEl.parentNode.insertBefore(box, dateEl.nextSibling);
        dateEl.hidden = true;
        box.addEventListener('click', function (e) {
          var b = e.target.closest('[data-av-day]'), g = e.target.closest('[data-av-go]');
          if (b && !b.disabled) {
            dateEl.value = b.dataset.avDay;
            av.session = '';
            var f = dateEl.closest('.field'); if (f) f.classList.remove('has-error');
            $$('[data-av-day]', box).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
            avDetail();
          } else if (g && !g.disabled) {
            av.month = avMonthShift(av.month, +g.dataset.avGo);
            avLoad(av.month).then(avRender).catch(function () {});
          }
        });
        box.addEventListener('change', function (e) { if (e.target.name === 'bk-session') { av.session = e.target.value; avDetail(); } });
        dateEl.addEventListener('change', function () { if (dateEl.value) { av.month = dateEl.value.slice(0, 7); avLoad(av.month).then(avRender).catch(function () {}); } });
        window.addEventListener('focus', avRefresh);
        avRender();
      }).catch(function () { /* sem API: fica o campo de data normal */ });
    }

    /* Cliente com sessão iniciada: preenche os dados (a reserva aparece na conta pelo e-mail) */
    if (/(?:^|; )mca_in=1/.test(document.cookie)) {
      fetch('/api/account/me', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (a) {
        if (!a || !a.customer) return;
        [['#bk-name', a.customer.name], ['#bk-phone', a.customer.phone], ['#bk-email', a.customer.email]].forEach(function (x) {
          var el = $(x[0], form);
          if (el && !el.value && x[1]) el.value = x[1];
        });
        var step = ($('#bk-name', form) || form).closest('.bk-step');
        if (step && t.accountAs) {
          var note = document.createElement('p');
          note.className = 'booking__account';
          note.innerHTML = '<i class="bx bx-user"></i>';
          note.appendChild(document.createTextNode(' ' + t.accountAs));
          step.appendChild(note);
        }
      }).catch(function () {});
    }

    if (inEl && outEl) {
      inEl.addEventListener('change', function () {
        if (!inEl.value) return;
        var minOut = addDays(inEl.value, d.minNights || 1);
        outEl.min = addDays(inEl.value, 1);
        if (!outEl.value || outEl.value < minOut) outEl.value = minOut;
      });
    }

    function nights() {
      if (!isStay || !inEl.value || !outEl.value) return 0;
      return Math.round((new Date(outEl.value + 'T00:00:00') - new Date(inEl.value + 'T00:00:00')) / 864e5);
    }

    function calc() {
      var boatId = (form.querySelector('input[name=boat]:checked') || {}).value || '';
      var boat = d.boats.filter(function (b) { return b.id === boatId; })[0];
      var cap = boat && boat.capacity ? boat.capacity : (d.maxPeople || 20);
      st.adults = Math.max(1, Math.min(cap - st.children, st.adults));
      st.children = Math.max(0, Math.min(Math.min(10, cap - st.adults), st.children));

      var n = nights(), nEst = isStay ? (n > 0 ? n : (d.minNights || 1)) : 1;
      var nLabel = nEst === 1 ? t.night1 : t.nightsN.replace('{n}', nEst);
      var lines = [], total = 0, issues = [], unknown = false;

      if (boat) {
        total = boat.price; lines.push([boat.title, fmt(boat.price)]);
      } else if (d.pricing === 'per-group') {
        total = d.price; lines.push([d.name + (d.unit ? ' (' + d.unit + ')' : ''), fmt(d.price)]);
      } else if (d.pricing === 'per-unit-night') {
        total = d.price * nEst; lines.push([fmt(d.price) + ' × ' + nLabel, fmt(total)]);
      } else if (isStay && d.nightRates) {
        /* Tarifas totais por pessoa publicadas para 1 e 2 noites; cada noite adicional
           acrescenta a tarifa de 1 noite (decisão de 28/10/2026). */
        var rate = d.nightRates[String(nEst)];
        var top = Math.max.apply(null, Object.keys(d.nightRates).map(Number));
        if (!rate && nEst > top && d.nightRates['1']) {
          var extra = nEst - top, base = d.nightRates[String(top)], one = d.nightRates['1'];
          rate = [base[0] + extra * one[0], base[1] + extra * one[1]];
        }
        if (rate) {
          total = st.adults * rate[0];
          lines.push([(d.peopleLabel || t.adults) + ' ' + st.adults + ' × ' + fmt(rate[0]) + ' (' + nLabel + ')', fmt(st.adults * rate[0])]);
          if (st.children) { total += st.children * rate[1]; lines.push([t.childrenL + ' ' + st.children + ' × ' + fmt(rate[1]) + ' (' + nLabel + ')', fmt(st.children * rate[1])]); }
        } else {
          unknown = true;
          lines.push([nLabel + ' · ' + st.adults + ' ' + t.waAdults + (st.children ? ', ' + st.children + ' ' + t.waChildren : ''), t.toConfirm]);
        }
      } else {
        var mult = isStay ? nEst : 1, suffix = isStay ? ' × ' + nLabel : '';
        total = st.adults * d.price * mult;
        lines.push([(d.peopleLabel || t.adults) + ' ' + st.adults + ' × ' + fmt(d.price) + suffix, fmt(st.adults * d.price * mult)]);
        if (st.children) { total += st.children * d.child * mult; lines.push([t.childrenL + ' ' + st.children + ' × ' + fmt(d.child) + suffix, fmt(st.children * d.child * mult)]); }
      }
      $$('input[name=extra]:checked', form).forEach(function (el) {
        var x = d.extras.filter(function (e) { return e.id === el.value; })[0];
        if (!x) return;
        var amount = x.perPerson ? x.price * st.adults : x.price;
        if (x.currency === 'USD') { lines.push([x.title, '$ ' + amount + ' (' + t.paidApart + ')']); return; }
        total += amount; lines.push([x.title, amount ? '+' + fmt(amount) : t.included]);
      });
      var trId = (form.querySelector('input[name=transfer]:checked') || {}).value || '';
      var tr = d.transfers.filter(function (x) { return x.id === trId; })[0];
      if (tr) { total += tr.price; lines.push([tr.title, '+' + fmt(tr.price)]); }

      var pax = st.adults + st.children;
      if (d.minPeople && pax < d.minPeople) issues.push(t.minBlock.replace('{n}', d.minPeople));
      if (isStay && n > 0 && n < (d.minNights || 1)) issues.push(t.minNightsMsg.replace('{n}', d.minNights));
      if (av.stayBad) issues.push(t.avStay);
      if (av.left !== null && av.left !== undefined && pax > av.left) issues.push(t.avOnly.replace('{n}', av.left));
      if (pax >= cap && (boat || d.maxPeople)) issues.push(null); /* só desactiva o botão + */

      $$('[data-out]', form).forEach(function (o) { o.textContent = st[o.dataset.out]; });
      $$('[data-step]', form).forEach(function (b) {
        var p = b.dataset.step.split(':'), k = p[0], dir = +p[1];
        b.disabled = dir < 0 ? st[k] <= (k === 'adults' ? 1 : 0) : (pax >= cap || (k === 'children' && st.children >= 10));
      });

      var warn = issues.filter(Boolean);
      $('[data-summary]', form).innerHTML =
        lines.map(function (l) { return '<div><span>' + esc(l[0]) + '</span><span>' + esc(l[1]) + '</span></div>'; }).join('') +
        warn.map(function (w) { return '<div class="is-warn"><span><i class="bx bx-error-circle"></i> ' + esc(w) + '</span></div>'; }).join('') +
        (pax >= cap && (boat || d.maxPeople) ? '<div><span class="text-soft">' + esc(t.maxReached.replace('{n}', cap)) + '</span></div>' : '') +
        '<div class="summary__total"><span>' + esc(t.total) + '</span><span>' + (unknown ? esc(t.toConfirm) : fmt(total)) + '</span></div>';

      var sig = [st.adults, st.children, total].join('|');
      if (sig !== lastTrack) { lastTrack = sig; track('calculate_price', { package_id: d.id, package_name: d.name, adults: st.adults, children: st.children, total_price: total }); }
      return { total: total, unknown: unknown, lines: lines, pax: pax, nights: n, issues: warn };
    }

    form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-step]');
      if (!b || b.disabled) return;
      var p = b.dataset.step.split(':'); st[p[0]] += +p[1]; calc();
    });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'transfer') track('select_transfer', { transfer_id: e.target.value || 'none' });
      calc();
    });
    calc();
    initAvailability();

    function fieldError(el, bad) {
      var f = el.closest('.field');
      if (f) f.classList.toggle('has-error', bad);
      el.setAttribute('aria-invalid', bad ? 'true' : 'false');
      return bad;
    }

    var result = $('[data-booking-result]'), submitBtn = $('[data-submit]', form), idemKey = uuid(), busy = false;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var first = null;
      var check = function (el, bad) { if (el && fieldError(el, bad) && !first) first = el; };
      if (isStay) { check(inEl, !inEl.value); check(outEl, !outEl.value || (inEl.value && outEl.value <= inEl.value)); }
      else check(dateEl, !dateEl.value || (av.sessions.length > 0 && !av.session));
      var nameEl = $('#bk-name', form), phoneEl = $('#bk-phone', form), emailEl = $('#bk-email', form);
      check(nameEl, !nameEl.value.trim());
      check(phoneEl, phoneEl.value.replace(/\D/g, '').length < 7);
      var r = calc();
      if (r.issues.length) {
        errBox.textContent = r.issues.join(' ');
        errBox.hidden = false;
        errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      errBox.hidden = true;
      if (first) { first.focus(); return; }

      var fmtDate = function (v) { return new Date(v + 'T00:00:00').toLocaleDateString(t.locale, { day: 'numeric', month: 'long', year: 'numeric' }); };
      var when = isStay
        ? t.waIn + ': ' + fmtDate(inEl.value) + '\n' + t.waOut + ': ' + fmtDate(outEl.value) + ' (' + (r.nights === 1 ? t.night1 : t.nightsN.replace('{n}', r.nights)) + ')'
        : t.waDate + ': ' + fmtDate(dateEl.value);
      var msg = t.waHello + '\n\n' + t.waIntro + '\n\n' +
        t.waExp + ': ' + d.name + '\n' + when + '\n' +
        t.waPax + ': ' + r.pax + ' (' + st.adults + ' ' + t.waAdults + (st.children ? ', ' + st.children + ' ' + t.waChildren : '') + ')\n\n' +
        r.lines.map(function (l) { return '• ' + l[0] + ': ' + l[1]; }).join('\n') +
        '\n\n' + t.total + ': ' + (r.unknown ? t.toConfirm : fmt(r.total)) + '\n\n' +
        t.waName + ': ' + nameEl.value.trim() + '\n' + t.waPhone + ': ' + phoneEl.value.trim() +
        (emailEl.value.trim() ? '\n' + t.waEmail + ': ' + emailEl.value.trim() : '') +
        '\n\n' + t.waEnd;

      var payload = {
        idempotency_key: idemKey, item: d.id, lang: d.lang,
        adults: st.adults, children: st.children,
        boat: (form.querySelector('input[name=boat]:checked') || {}).value || null,
        transfer: (form.querySelector('input[name=transfer]:checked') || {}).value || null,
        extras: $$('input[name=extra]:checked', form).map(function (x) { return x.value; }),
        name: nameEl.value.trim(), phone: phoneEl.value.trim(), email: emailEl.value.trim(),
        website: (form.elements.mca_hp || {}).value || '',
        whatsapp_opt_in: !!($('#bk-wa', form) || {}).checked
      };
      if (isStay) { payload.checkin = inEl.value; payload.checkout = outEl.value; } else { payload.date = dateEl.value; if (av.session) payload.session = av.session; }

      setBusy(true);
      api('/api/bookings', payload).then(function (res) {
        setBusy(false);
        if (res.ok) {
          track('submit_booking', { package_id: d.id, package_name: d.name, reference: res.data.reference, total_price: res.data.total });
          showSuccess(res.data, payload);
          idemKey = uuid();
        } else if (res.status === 422 || res.status === 429) {
          var code = res.data.error, tpl = (t.errors || {})[code];
          errBox.textContent = tpl ? tpl.replace('{min}', res.data.min).replace('{max}', res.data.max).replace('{left}', res.data.left) : t.failTitle;
          errBox.hidden = false;
          if (/^(sold_out|not_enough_places|date_blocked|date_closed|session_required|invalid_session)$/.test(code || '')) avRefresh();
          if (res.status === 429) showFallback(msg);
        } else {
          showFallback(msg);
        }
      });
    });

    function setBusy(v) {
      busy = v;
      submitBtn.disabled = v;
      $('span', submitBtn).textContent = v ? t.sending : t.submit;
    }

    function showSuccess(data, p) {
      var waMsg = t.waRef.replace('{ref}', data.reference).replace('{item}', d.name).replace('{name}', p.name);
      // Ticket do pedido com QR code (ticket.js); sem ele, mostra a referência e o resumo simples
      var ticket = window.MCATicket
        ? window.MCATicket.html({ reference: data.reference, status: data.status, item: d.name, service_date: p.date, checkin: p.checkin, checkout: p.checkout,
            adults: p.adults, children: p.children, name: p.name.split(' ')[0], lines: data.lines, total: data.total, to_confirm: data.to_confirm, url: data.client_url, lang: d.lang })
        : '<p class="result-ref"><small>' + esc(t.okRef) + '</small><strong data-reference>' + esc(data.reference) + '</strong></p>' +
          '<div class="summary">' + (data.lines || []).map(function (l) { return '<div><span>' + esc(l.label) + '</span><span>' + (l.amount === null ? esc(l.note || t.toConfirm) : fmt(l.amount)) + '</span></div>'; }).join('') +
          '<div class="summary__total"><span>' + esc(t.total) + '</span><span>' + (data.to_confirm ? esc(t.toConfirm) : fmt(data.total)) + '</span></div></div>';
      result.innerHTML =
        '<div class="result-ok"><i class="bx bxs-check-circle"></i><h3>' + esc(t.okTitle) + '</h3>' +
        '<p>' + esc(t.okLead) + '</p>' + ticket +
        (data.email && data.email.client === 'sent' ? '<p class="text-soft">' + esc(t.okMail.replace('{email}', p.email)) + '</p>' : '') +
        '<a class="btn-x btn-x--wa btn-x--block" target="_blank" rel="noopener" href="https://wa.me/' + WA + '?text=' + encodeURIComponent(waMsg) + '"><i class="bx bxl-whatsapp"></i> ' + esc(t.okWa) + '</a>' +
        '<button type="button" class="btn-x btn-x--ghost btn-x--block" data-again>' + esc(t.again) + '</button></div>';
      form.hidden = true;
      result.hidden = false;
      result.focus();
      $('[data-again]', result).addEventListener('click', function () { result.hidden = true; form.hidden = false; });
    }

    function showFallback(msg) {
      track('booking_api_unavailable', { package_id: d.id });
      result.innerHTML =
        '<div class="result-fail"><h3>' + esc(t.failTitle) + '</h3><p>' + esc(t.failLead) + '</p>' +
        '<a class="btn-x btn-x--wa btn-x--block" target="_blank" rel="noopener" href="https://wa.me/' + WA + '?text=' + encodeURIComponent(msg) + '" data-fallback-wa><i class="bx bxl-whatsapp"></i> WhatsApp</a>' +
        '<a class="btn-x btn-x--ghost btn-x--block" href="mailto:booking@mozcampadventures.co.mz?subject=' + encodeURIComponent(t.mailSubject + ' — ' + d.name) + '&body=' + encodeURIComponent(msg) + '"><i class="bx bx-envelope"></i> ' + esc(t.orMail) + '</a></div>';
      result.hidden = false;
    }
  }

  /* Pedido JSON à API; nunca lança — devolve {ok, status, data}. */
  function api(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok, status: r.status, data: data }; });
      })
      .catch(function () { return { ok: false, status: 0, data: {} }; });
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /* ── 6. Contacto ────────────────────────────────────────── */
  function initContact() {
    var form = $('[data-contact]');
    if (!form) return;
    var tt = JSON.parse(form.dataset.t), msgEl = $('[data-contact-msg]', form), btn = $('[data-submit]', form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var via = e.submitter && e.submitter.value === 'wa' ? 'wa' : 'api';
      var el = form.elements, first = null;
      var bad = function (input, cond) {
        input.closest('.field').classList.toggle('has-error', cond);
        input.setAttribute('aria-invalid', cond ? 'true' : 'false');
        if (cond && !first) first = input;
      };
      bad(el.name, !el.name.value.trim());
      bad(el.email, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.email.value.trim()));
      bad(el.subject, !el.subject.value);
      bad(el.message, !el.message.value.trim());
      if (first) { first.focus(); return; }
      var subj = el.subject.options[el.subject.selectedIndex].text;
      var body = el.message.value.trim() + '\n\n— ' + el.name.value.trim() + '\n' + el.email.value.trim() + (el.phone.value.trim() ? '\n' + el.phone.value.trim() : '');
      var waUrl = 'https://wa.me/' + form.dataset.wa + '?text=' + encodeURIComponent(subj + '\n\n' + body);
      var mailUrl = 'mailto:' + form.dataset.mail + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
      if (via === 'wa') {
        track('submit_contact_wa', { subject: el.subject.value });
        window.open(waUrl, '_blank', 'noopener');
        return;
      }
      btn.disabled = true; $('span', btn).textContent = tt.sending; msgEl.className = 'form-msg'; msgEl.textContent = '';
      api('/api/contact', { name: el.name.value.trim(), email: el.email.value.trim(), phone: el.phone.value.trim(), subject: subj, message: el.message.value.trim(), lang: form.dataset.lang, website: (el.mca_hp || {}).value || '' })
        .then(function (res) {
          btn.disabled = false; $('span', btn).textContent = tt.send;
          if (res.ok) {
            track('submit_contact', { subject: el.subject.value });
            form.reset();
            msgEl.className = 'form-msg is-ok'; msgEl.textContent = tt.ok;
          } else {
            msgEl.className = 'form-msg is-err';
            msgEl.innerHTML = esc(res.status === 429 ? tt.tooMany : tt.fail) + ' <a href="' + waUrl + '" target="_blank" rel="noopener">WhatsApp</a> · <a href="' + mailUrl + '">' + esc(form.dataset.mail) + '</a>';
          }
        });
    });
  }

  /* ── 7. Analytics globais ───────────────────────────────── */
  function initTracking() {
    var view = document.getElementById('track-view');   // evento de página (bloco JSON, compatível com CSP)
    if (view) {
      var v = JSON.parse(view.textContent);
      track(v.event, v);
    }
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href*="wa.me/"]');
      if (a && !a.closest('[data-booking]')) track('click_whatsapp', { source: location.pathname, link_text: (a.textContent || '').trim().slice(0, 60) });
    });
  }

  function init() {
    initHeader(); initDates(); initFinder(); initHeroSlider(); initHolidayPackages(); initCatalog(); initDestinations();
    initGallery(); initAnchors(); initBooking(); initContact(); initTracking();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
