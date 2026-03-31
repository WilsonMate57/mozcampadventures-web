/**
 * MOZ CAMP ADVENTURES — packages-transfer.js
 * =====================================================
 * Private Transfer Options section for Beach Tour packages.
 * Renders premium selectable cards, syncs selection to the
 * booking sidebar via window._mcaTransferTotal.
 * =====================================================
 */

(function () {
  'use strict';

  /* ── Default options (used when package JSON has none) ── */

  var DEFAULT_PT = [
    {
      id: 'day-trip-transfer',
      title: 'Transfer Privado Day Trip',
      subtitle: 'Ida e volta no mesmo dia',
      price: 25000,
      notes: [
        'Não inclui refeição nem atividades.'
      ]
    },
    {
      id: 'one-night-transfer',
      title: 'Transfer Privado — 1 Noite',
      subtitle: 'Regresso no dia seguinte',
      price: 30000,
      notes: [
        'Não inclui alojamento nem refeições.',
        'Hospedagem por conta do cliente.',
        'Taxa extra diária ao adicionar mais uma noite: 5.500 MT.'
      ]
    }
  ];

  var DEFAULT_EN = [
    {
      id: 'day-trip-transfer',
      title: 'Private Transfer — Day Trip',
      subtitle: 'Same-day round trip',
      price: 25000,
      notes: [
        'Does not include meals or activities.'
      ]
    },
    {
      id: 'one-night-transfer',
      title: 'Private Transfer — 1 Night',
      subtitle: 'Return the following day',
      price: 30000,
      notes: [
        'Does not include accommodation or meals.',
        'Accommodation at the client\'s own expense.',
        'Extra nightly rate for additional nights: 5,500 MT.'
      ]
    }
  ];

  /* ── State ──────────────────────────────────────────────── */
  var _selectedId = null;
  var _options    = [];
  var _lang       = 'pt';

  /* ── Helpers ─────────────────────────────────────────────── */
  function fmt(n) {
    return Number(n).toLocaleString('pt-MZ') + ' MT';
  }

  /* ── Render cards ────────────────────────────────────────── */
  function render() {
    var container = document.getElementById('pkg-transfer-cards');
    if (!container) return;

    container.innerHTML = '';

    _options.forEach(function (opt) {
      var card = document.createElement('div');
      card.className = 'transfer-card';
      card.dataset.id = opt.id;
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', 'false');
      card.setAttribute('tabindex', '0');

      var notesHtml = (opt.notes || []).map(function (n) {
        return '<li>' + n + '</li>';
      }).join('');

      card.innerHTML =
        '<div class="transfer-card-check"><i class="bi bi-check-lg"></i></div>' +
        '<div class="transfer-card-content">' +
          '<div class="transfer-card-top">' +
            '<div class="transfer-card-info">' +
              '<div class="transfer-card-title">' + opt.title + '</div>' +
              '<div class="transfer-card-subtitle">' + opt.subtitle + '</div>' +
            '</div>' +
            '<div class="transfer-card-price">' + fmt(opt.price) + '</div>' +
          '</div>' +
          (notesHtml ? '<ul class="transfer-card-notes">' + notesHtml + '</ul>' : '') +
        '</div>';

      card.addEventListener('click', function () { toggle(opt.id); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(opt.id); }
      });

      container.appendChild(card);
    });
  }

  /* ── Toggle selection (click selected = deselect) ────────── */
  function toggle(id) {
    _selectedId = (_selectedId === id) ? null : id;
    updateUI();
    syncToBooking();

    /* ── Analytics: select_transfer ── */
    if (typeof window.mcaTrack === 'function') {
      var opt = _options.find(function (o) { return o.id === _selectedId; });
      window.mcaTrack('select_transfer', {
        transfer_id:    _selectedId || 'none',
        transfer_name:  opt ? opt.title : 'none',
        transfer_price: opt ? opt.price : 0
      });
    }
  }

  function updateUI() {
    document.querySelectorAll('.transfer-card').forEach(function (card) {
      var selected = card.dataset.id === _selectedId;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
  }

  /* ── Sync to booking sidebar ─────────────────────────────── */
  function syncToBooking() {
    var opt = _options.find(function (o) { return o.id === _selectedId; });

    window._mcaTransferTotal = opt ? opt.price : 0;
    window._mcaTransferLabel = opt ? opt.title : '';

    /* Reuse extras trigger pattern — bookAdjust(delta=0) causes updateBookingTotal() */
    if (typeof window.bookAdjust === 'function') {
      window.bookAdjust('adults', 0);
    }
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init(customOptions, lang) {
    _lang       = lang || 'pt';
    _selectedId = null;

    _options = customOptions
      ? customOptions
      : (_lang === 'en' ? DEFAULT_EN : DEFAULT_PT);

    if (!_options || !_options.length) return;

    /* Reset globals */
    window._mcaTransferTotal = 0;
    window._mcaTransferLabel = '';

    var section = document.getElementById('pkg-transfer-section');
    if (section) section.style.display = '';

    render();
  }

  /* Called by buildPackagePage in data-loader.js */
  window._mcaInitTransfer = function (customOptions, lang) {
    init(customOptions || null, lang || window.MCA_LANG || 'pt');
  };

})();
