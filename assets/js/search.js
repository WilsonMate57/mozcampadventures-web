/**
 * MOZ CAMP ADVENTURES — search.js
 * =====================================================
 * Package search system.
 * Initialises after 'mcaNavReady' (fired by components.js).
 *
 * Features:
 *  - Backdrop blur + scroll lock when overlay is open
 *  - Click outside to close
 *  - Results grouped by Tours / Alojamentos
 *  - Clear button with correct spacing
 *  - Works on every page
 * =====================================================
 */

(function () {
  'use strict';

  var _lang     = window.MCA_LANG || 'pt';
  var _isTours  = !!document.getElementById('search-results-section');
  var _debounce = null;

  /* ── Normalise: lowercase + strip accents ── */
  function normalise(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /* ── Searchable string from a package ── */
  function searchableText(pkg) {
    return normalise([
      pkg.name, pkg.subtitle, pkg.category,
      pkg.location, pkg.destinations,
      pkg.description, pkg.badge,
      (pkg.highlights || []).join(' ')
    ].join(' '));
  }

  /* ── Package detail URL ── */
  function packageUrl(pkg) {
    var slug = pkg.slug || pkg.id;
    var base = window.MCA_BASE || '';
    return _lang === 'en'
      ? base + 'en/pages/package.html?id=' + slug
      : base + 'pages/package.html?id=' + slug;
  }

  /* ── One result row ── */
  function makeResultCard(pkg, onClickExtra) {
    var a = document.createElement('a');
    a.className = 'search-result-card';
    a.href = packageUrl(pkg);
    if (typeof onClickExtra === 'function') {
      a.addEventListener('click', onClickExtra);
    }

    var meta = [pkg.location, pkg.duration].filter(Boolean).join(' · ');

    a.innerHTML =
      '<div class="search-result-info">' +
        '<div class="search-result-name">' + pkg.name + '</div>' +
        (meta ? '<div class="search-result-meta">' + meta + '</div>' : '') +
      '</div>' +
      '<div class="search-result-price">' + (pkg.price || '') + '</div>';

    return a;
  }

  /* ── Render grouped results ── */
  function renderGroups(tours, accom, onClickExtra) {
    var frag = document.createDocumentFragment();
    var labels = _lang === 'en'
      ? { tours: 'Tours', accom: 'Accommodations' }
      : { tours: 'Tours', accom: 'Alojamentos' };

    if (tours.length > 0) {
      var g = document.createElement('div');
      g.className = 'search-group';
      var lbl = document.createElement('div');
      lbl.className = 'search-group-label';
      lbl.textContent = labels.tours;
      g.appendChild(lbl);
      tours.forEach(function (pkg) { g.appendChild(makeResultCard(pkg, onClickExtra)); });
      frag.appendChild(g);
    }

    if (accom.length > 0) {
      var g2 = document.createElement('div');
      g2.className = 'search-group';
      var lbl2 = document.createElement('div');
      lbl2.className = 'search-group-label';
      lbl2.textContent = labels.accom;
      g2.appendChild(lbl2);
      accom.forEach(function (pkg) { g2.appendChild(makeResultCard(pkg, onClickExtra)); });
      frag.appendChild(g2);
    }

    return frag;
  }

  /* ── Init (runs after navbar is injected) ── */
  function init() {
    var overlayEl      = document.getElementById('search-overlay');
    var toggleBtn      = document.getElementById('nav-search-btn');
    var closeBtn       = document.getElementById('search-overlay-close');
    var inputDesk      = document.getElementById('pkg-search');
    var clearDesk      = document.getElementById('search-clear');
    var inputMob       = document.getElementById('pkg-search-mobile');
    var clearMob       = document.getElementById('search-clear-mobile');
    var dropdown       = document.getElementById('search-dropdown');
    var dropResults    = document.getElementById('search-dropdown-results');
    var dropEmpty      = document.getElementById('search-dropdown-empty');
    var queryLabel     = document.getElementById('search-query-label');
    var dropdownMob    = document.getElementById('search-dropdown-mobile');
    var dropResultsMob = document.getElementById('search-dropdown-results-mobile');
    var dropEmptyMob   = document.getElementById('search-dropdown-empty-mobile');
    var queryLabelMob  = document.getElementById('search-query-label-mobile');
    var mobileNav      = document.getElementById('mobile-nav');

    /* ── Open / Close ── */
    function openOverlay() {
      if (!overlayEl) return;
      overlayEl.classList.add('open');
      overlayEl.setAttribute('aria-hidden', 'false');
      if (toggleBtn) { toggleBtn.classList.add('active'); toggleBtn.setAttribute('aria-expanded', 'true'); }
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      setTimeout(function () { if (inputDesk) inputDesk.focus(); }, 50);
    }

    function closeOverlay() {
      if (!overlayEl) return;
      overlayEl.classList.remove('open');
      overlayEl.setAttribute('aria-hidden', 'true');
      if (toggleBtn) { toggleBtn.classList.remove('active'); toggleBtn.setAttribute('aria-expanded', 'false'); }
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        overlayEl.classList.contains('open') ? closeOverlay() : openOverlay();
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeOverlay();
    });

    /* ── Clear buttons ── */
    function updateClearBtn(input, btn) {
      if (btn) btn.style.display = (input && input.value.length > 0) ? 'block' : 'none';
    }

    if (clearDesk && inputDesk) {
      clearDesk.addEventListener('click', function () {
        inputDesk.value = '';
        syncInputs('');
        runSearch('');
        inputDesk.focus();
      });
    }
    if (clearMob && inputMob) {
      clearMob.addEventListener('click', function () {
        inputMob.value = '';
        syncInputs('');
        runSearch('');
        if (dropdownMob) dropdownMob.style.display = 'none';
        inputMob.focus();
      });
    }

    /* ── Sync both inputs ── */
    function syncInputs(val) {
      if (inputDesk && inputDesk.value !== val) inputDesk.value = val;
      if (inputMob  && inputMob.value  !== val) inputMob.value  = val;
      updateClearBtn(inputDesk, clearDesk);
      updateClearBtn(inputMob,  clearMob);
    }

    /* ── Input with debounce ── */
    function onInput(e) {
      syncInputs(e.target.value);
      clearTimeout(_debounce);
      _debounce = setTimeout(function () { runSearch(e.target.value); }, 220);
    }

    if (inputDesk) inputDesk.addEventListener('input', onInput);
    if (inputMob)  inputMob.addEventListener('input',  onInput);

    /* ── Close mobile nav ── */
    function closeMobileNav() {
      if (!mobileNav) return;
      var backdrop = document.getElementById('mobile-nav-backdrop');
      mobileNav.classList.remove('open');
      mobileNav.setAttribute('aria-hidden', 'true');
      if (backdrop) backdrop.classList.remove('visible');
      document.body.style.overflow = '';
    }

    /* ── Run search ── */
    function runSearch(query) {
      var q = normalise(query.trim());

      if (q.length === 0) {
        if (dropdown)    dropdown.style.display = 'none';
        if (dropdownMob) dropdownMob.style.display = 'none';
        if (_isTours) restoreTours();
        return;
      }

      window.mcaReady(function (data) {
        var tourMatches  = (data.tours         || []).filter(function (p) { return searchableText(p).indexOf(q) !== -1; });
        var accomMatches = (data.accommodation || []).filter(function (p) { return searchableText(p).indexOf(q) !== -1; });
        var total = tourMatches.length + accomMatches.length;

        /* Desktop dropdown */
        if (dropdown && dropResults) {
          dropdown.style.display = '';
          dropResults.innerHTML = '';
          dropResults.appendChild(renderGroups(tourMatches, accomMatches));
          if (queryLabel) queryLabel.textContent = query.trim();
          if (dropEmpty)  dropEmpty.style.display = total === 0 ? '' : 'none';
        }

        /* Mobile dropdown — close drawer on click */
        if (dropdownMob && dropResultsMob) {
          dropdownMob.style.display = '';
          dropResultsMob.innerHTML = '';
          dropResultsMob.appendChild(renderGroups(tourMatches, accomMatches, closeMobileNav));
          if (queryLabelMob) queryLabelMob.textContent = query.trim();
          if (dropEmptyMob)  dropEmptyMob.style.display = total === 0 ? '' : 'none';
        }

        /* tours.html in-page */
        if (_isTours) filterToursPage(q, tourMatches.concat(accomMatches));
      });
    }

    /* ── tours.html in-page filter ── */
    function filterToursPage(_q, matches) {
      var resultsSection = document.getElementById('search-results-section');
      var resultsRoot    = document.getElementById('search-results-root');
      var noResults      = document.getElementById('search-no-results');
      var catSections    = document.querySelectorAll('.cat-section');
      var catTabsWrap    = document.querySelector('.cat-tabs-wrap');
      if (!resultsSection) return;

      if (catTabsWrap) catTabsWrap.style.display = 'none';
      catSections.forEach(function (s) { s.style.display = 'none'; });
      resultsSection.style.display = '';
      resultsRoot.innerHTML = '';

      var anims = ['reveal-left', 'reveal-up', 'reveal-right'];
      matches.forEach(function (pkg, i) {
        resultsRoot.appendChild(window.makeTourCard(pkg, anims[i % anims.length]));
      });

      if (noResults) noResults.style.display = matches.length === 0 ? '' : 'none';
      if (typeof revealOnScroll === 'function') revealOnScroll();
    }

    function restoreTours() {
      var resultsSection = document.getElementById('search-results-section');
      var catSections    = document.querySelectorAll('.cat-section');
      var catTabsWrap    = document.querySelector('.cat-tabs-wrap');
      if (resultsSection) resultsSection.style.display = 'none';
      catSections.forEach(function (s) { s.style.display = ''; });
      if (catTabsWrap) catTabsWrap.style.display = '';
    }

    /* ── Handle ?search= on page load ── */
    var urlSearch = new URLSearchParams(window.location.search).get('search');
    if (urlSearch && urlSearch.trim().length > 0) {
      syncInputs(urlSearch.trim());
      openOverlay();
      runSearch(urlSearch.trim());
    }
  }

  document.addEventListener('mcaNavReady', init);

})();
