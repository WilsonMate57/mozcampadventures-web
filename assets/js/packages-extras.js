/**
 * MOZ CAMP ADVENTURES — packages-extras.js
 * =====================================================
 * "Personalize a sua experiência" customization section.
 * Manages selectable extras and integrates with the
 * booking sidebar via window._mcaExtrasTotal.
 * =====================================================
 */

(function () {
  'use strict';

  /* ── Options data ──────────────────────────────────────── */

  var EXPERIENCE_TYPES = [
    {
      id: 'shared', icon: 'people-fill',
      title: 'Partilhada', desc: 'Com outros viajantes',
      price: 0, perPerson: false
    },
    {
      id: 'private', icon: 'person-fill',
      title: 'Privada', desc: 'Grupo exclusivo',
      price: 5000, perPerson: false
    },
    {
      id: 'premium', icon: 'gem',
      title: 'Premium', desc: 'Experiência exclusiva',
      price: 10000, perPerson: false
    }
  ];

  var DESTINATIONS = [
    {
      id: 'ilha-portuguesa', icon: 'water',
      title: 'Ilha Portuguesa', desc: 'Paragem adicional',
      price: 0, perPerson: false
    },
    {
      id: 'inhaca-village', icon: 'houses-fill',
      title: 'Inhaca Village', desc: 'Tour cultural local',
      price: 500, perPerson: true
    },
    {
      id: 'santa-maria', icon: 'umbrella',
      title: 'Praia Santa Maria', desc: 'Paragem na praia',
      price: 0, perPerson: false
    }
  ];

  var ACTIVITIES = [
    {
      id: 'snorkeling', icon: 'eye-fill',
      title: 'Snorkeling', desc: 'Equipamento incluído',
      price: 500, perPerson: true
    },
    {
      id: 'beach-bbq', icon: 'fire',
      title: 'Beach BBQ', desc: 'Refeição na praia',
      price: 1500, perPerson: true
    },
    {
      id: 'cultural-tour', icon: 'building-fill',
      title: 'Tour Cultural', desc: 'Com guia local',
      price: 800, perPerson: true
    },
    {
      id: 'safari', icon: 'binoculars-fill',
      title: 'Safari Guiado', desc: 'Parque Nacional',
      price: 2000, perPerson: true
    }
  ];

  var SERVICES = [
    {
      id: 'private-guide', icon: 'person-badge-fill',
      title: 'Guia Privado', desc: 'Exclusivo para si',
      price: 2500, perPerson: false
    },
    {
      id: 'premium-drinks', icon: 'cup-straw',
      title: 'Bebidas Premium', desc: 'Selecção exclusiva',
      price: 750, perPerson: true
    },
    {
      id: 'photographer', icon: 'camera-fill',
      title: 'Fotógrafo', desc: 'Memórias para sempre',
      price: 3000, perPerson: false
    },
    {
      id: 'private-boat', icon: 'wind',
      title: 'Barco Privado', desc: 'Upgrade exclusivo',
      price: 8000, perPerson: false
    }
  ];

  /* ── State ──────────────────────────────────────────────── */
  var _checked        = {};
  var _typeId         = 'shared';
  var _pkgExtras      = null; // set in per-package mode; null = use global data
  var _boatOptions    = [];   // privateBoatOptions for this package
  var _selectedBoatId = null; // currently selected boat option id

  /* ── Helpers ─────────────────────────────────────────────── */
  function fmt(n) {
    if (n === 0) return 'Incluído';
    return Number(n).toLocaleString('pt-MZ') + ' MT';
  }

  function fmtDiff(n, perPerson, currency, priceUnit) {
    if (n === 0) return '<span class="cz-price-free">Incluído</span>';
    var isUsd  = currency === 'USD';
    var valStr = isUsd
      ? '$ ' + Number(n).toLocaleString('en-US')
      : Number(n).toLocaleString('pt-MZ') + ' MT';
    var unit = priceUnit
      ? '<span class="cz-price-pax">' + priceUnit + '</span>'
      : (perPerson ? '<span class="cz-price-pax">/pax</span>' : '');
    return '<span class="cz-price-add">+' + valStr + '</span>' + unit;
  }

  function getAdults() {
    var el = document.getElementById('book-adults-val');
    return el ? (parseInt(el.textContent, 10) || 1) : 1;
  }

  /* ── Render: private boat options (radio) ───────────────── */
  function renderBoatCards() {
    var container = document.getElementById('cz-boat-cards');
    if (!container) return;

    container.innerHTML = _boatOptions.map(function (opt) {
      var sel = opt.id === _selectedBoatId;
      return (
        '<div class="cz-boat-card' + (sel ? ' selected' : '') + '" ' +
            'data-boat-id="' + opt.id + '" role="radio" aria-checked="' + sel + '" tabindex="0">' +
          '<div class="cz-boat-card-inner">' +
            '<div class="cz-boat-card-icon"><i class="bx bxs-ship"></i></div>' +
            '<div class="cz-boat-card-info">' +
              '<div class="cz-boat-card-title">' + opt.title + '</div>' +
              '<div class="cz-boat-card-desc">' + opt.desc + '</div>' +
            '</div>' +
            '<div class="cz-boat-card-price">' +
              '<span class="cz-boat-price-val">' + Number(opt.price).toLocaleString('pt-MZ') + ' MT</span>' +
              '<span class="cz-boat-price-note">tudo incluído</span>' +
            '</div>' +
          '</div>' +
          (sel ? '<div class="cz-boat-selected-badge"><i class="bx bxs-check-circle"></i> Seleccionado</div>' : '') +
        '</div>'
      );
    }).join('');

    /* Deselect option */
    var deselEl = document.getElementById('cz-boat-deselect');
    if (deselEl) deselEl.style.display = _selectedBoatId ? '' : 'none';

    container.querySelectorAll('.cz-boat-card').forEach(function (el) {
      el.addEventListener('click', onBoatClick);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBoatClick.call(this); }
      });
    });
  }

  function onBoatClick() {
    var id = this.dataset.boatId;
    /* Toggle off if already selected */
    if (_selectedBoatId === id) {
      _selectedBoatId = null;
      window._mcaBoatOverride = false;
      window._mcaBoatTotal    = 0;
      window._mcaBoatLabel    = '';
    } else {
      _selectedBoatId = id;
      var opt = _boatOptions.find(function (o) { return o.id === id; });
      window._mcaBoatOverride = true;
      window._mcaBoatTotal    = opt ? opt.price : 0;
      window._mcaBoatLabel    = opt ? opt.title : 'Barco Privado';
    }
    renderBoatCards();
    onExtrasChange();
  }

  /* ── Render: experience type cards (radio) ──────────────── */
  function renderTypeCards() {
    var container = document.getElementById('cz-type-cards');
    if (!container) return;

    container.innerHTML = EXPERIENCE_TYPES.map(function (opt) {
      var sel = opt.id === _typeId;
      return (
        '<div class="cz-type-card' + (sel ? ' selected' : '') + '" ' +
            'data-type-id="' + opt.id + '" role="radio" aria-checked="' + sel + '" tabindex="0">' +
          '<div class="cz-card-icon"><i class="bi bi-' + opt.icon + '"></i></div>' +
          '<div class="cz-card-title">' + opt.title + '</div>' +
          '<div class="cz-card-desc">' + opt.desc + '</div>' +
          '<div class="cz-card-price">' + fmtDiff(opt.price, false) + '</div>' +
        '</div>'
      );
    }).join('');

    container.querySelectorAll('.cz-type-card').forEach(function (el) {
      el.addEventListener('click', onTypeClick);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTypeClick.call(this); }
      });
    });
  }

  function onTypeClick() {
    _typeId = this.dataset.typeId;
    renderTypeCards();
    onExtrasChange();
  }

  /* ── Render: option cards (checkbox) ─────────────────────── */
  function renderOptionCards(containerId, options) {
    var container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = options.map(function (opt) {
      var sel = !!_checked[opt.id];
      return (
        '<div class="cz-option-card' + (sel ? ' selected' : '') + '" ' +
            'data-opt-id="' + opt.id + '" data-container="' + containerId + '" ' +
            'role="checkbox" aria-checked="' + sel + '" tabindex="0">' +
          '<div class="cz-card-check' + (sel ? ' checked' : '') + '"><i class="bi bi-check2"></i></div>' +
          '<div class="cz-card-icon"><i class="bi bi-' + opt.icon + '"></i></div>' +
          '<div class="cz-card-body">' +
            '<div class="cz-card-title">' + opt.title + '</div>' +
            '<div class="cz-card-desc">' + opt.desc + '</div>' +
            '<div class="cz-card-price">' + fmtDiff(opt.price, opt.perPerson, opt.currency, opt.priceUnit) + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    container.querySelectorAll('.cz-option-card').forEach(function (el) {
      el.addEventListener('click', function () { onOptionClick(this, containerId, options); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOptionClick(this, containerId, options);
        }
      });
    });
  }

  function onOptionClick(el, containerId, options) {
    var id = el.dataset.optId;
    _checked[id] = !_checked[id];
    renderOptionCards(containerId, options);
    onExtrasChange();
  }

  /* ── Calculation ─────────────────────────────────────────── */
  function calcExtras() {
    var adults = getAdults();
    var total  = 0;
    var lines  = [];

    /* Per-package extras mode */
    if (_pkgExtras) {
      _pkgExtras.forEach(function (opt) {
        if (!_checked[opt.id]) return;
        var amount = opt.perPerson ? opt.price * adults : opt.price;
        var isUsd  = opt.currency === 'USD';
        if (amount > 0) {
          if (!isUsd) total += amount;
          var amtStr = isUsd
            ? '$ ' + Number(amount).toLocaleString('en-US')
            : '+' + Number(amount).toLocaleString('pt-MZ') + ' MT';
          var unit = opt.priceUnit || (opt.perPerson ? ' (' + adults + '×)' : '');
          lines.push(opt.title + ': ' + amtStr + unit);
        } else {
          lines.push(opt.title + ': Incluído');
        }
      });
      return { total: total, lines: lines };
    }

    /* Global mode */

    /* Experience type */
    var typeOpt = EXPERIENCE_TYPES.find(function (t) { return t.id === _typeId; });
    if (typeOpt && typeOpt.price > 0) {
      total += typeOpt.price;
      lines.push(typeOpt.title + ': +' + Number(typeOpt.price).toLocaleString('pt-MZ') + ' MT');
    }

    /* Checkbox groups */
    var allOptions = [].concat(DESTINATIONS, ACTIVITIES, SERVICES);
    allOptions.forEach(function (opt) {
      if (!_checked[opt.id]) return;
      var amount = opt.perPerson ? opt.price * adults : opt.price;
      if (amount > 0) {
        total += amount;
        lines.push(
          opt.title + ': +' + Number(amount).toLocaleString('pt-MZ') + ' MT' +
          (opt.perPerson ? ' (' + adults + '×)' : '')
        );
      } else {
        lines.push(opt.title + ': Incluído');
      }
    });

    return { total: total, lines: lines };
  }

  /* ── On change ───────────────────────────────────────────── */
  function onExtrasChange() {
    var result = calcExtras();

    /* Expose for data-loader.js */
    window._mcaExtrasTotal   = result.total;
    window._mcaExtrasSummary = result.lines.join('\n');

    /* Update summary panel */
    updateCzSummary(result);

    /* Trigger booking sidebar recalculation (delta 0 = no-op on count) */
    if (typeof window.bookAdjust === 'function') {
      window.bookAdjust('adults', 0);
    }
  }

  function updateCzSummary(result) {
    var summaryEl = document.getElementById('cz-summary');
    var itemsEl   = document.getElementById('cz-summary-items');
    var totalEl   = document.getElementById('cz-extras-total-display');
    if (!summaryEl) return;

    var hasItems = result.lines.length > 0;
    summaryEl.style.display = hasItems ? '' : 'none';

    if (itemsEl) {
      itemsEl.innerHTML = result.lines.map(function (line) {
        return '<div class="cz-summary-item">' + line + '</div>';
      }).join('');
    }

    if (totalEl) totalEl.textContent = fmt(result.total);
  }

  /* ── Watch adult stepper for per-person recalc ───────────── */
  function watchAdultsStepper() {
    document.querySelectorAll('.booking-stepper-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        /* Small delay so bookAdjust updates _adults before we recalc */
        setTimeout(onExtrasChange, 60);
      });
    });
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init(pkgExtras, boatOptions) {
    var section = document.getElementById('pkg-customize-section');
    if (!section) return;

    _pkgExtras   = pkgExtras   || [];
    _boatOptions = boatOptions || [];

    section.style.display = '';

    /* Per-package mode: hide global sections */
    ['cz-type-cards', 'cz-destination-cards', 'cz-service-cards'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentElement) el.parentElement.style.display = 'none';
    });

    /* Show/hide boat section */
    var boatSection = document.getElementById('cz-boat-section');
    if (boatSection) boatSection.style.display = _boatOptions.length ? '' : 'none';
    if (_boatOptions.length) {
      renderBoatCards();
      var deselBtn = document.getElementById('cz-boat-deselect');
      if (deselBtn) {
        deselBtn.addEventListener('click', function () {
          _selectedBoatId = null;
          window._mcaBoatOverride = false;
          window._mcaBoatTotal    = 0;
          window._mcaBoatLabel    = '';
          renderBoatCards();
          onExtrasChange();
        });
      }
    }

    /* Show/hide extras section */
    var extrasSection = document.getElementById('cz-extras-section');
    if (extrasSection) extrasSection.style.display = _pkgExtras.length ? '' : 'none';
    if (_pkgExtras.length) renderOptionCards('cz-activity-cards', _pkgExtras);

    watchAdultsStepper();

    /* Initial state */
    window._mcaExtrasTotal   = 0;
    window._mcaExtrasSummary = '';
    window._mcaBoatOverride  = false;
    window._mcaBoatTotal     = 0;
    window._mcaBoatLabel     = '';
  }

  /* Called directly by buildPackagePage in data-loader.js */
  window._mcaInitExtras = function (extras, boatOptions) { init(extras, boatOptions); };

})();
