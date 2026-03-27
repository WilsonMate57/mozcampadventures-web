/**
 * MOZ CAMP ADVENTURES — promo-popup.js
 * ─────────────────────────────────────────────────────────────
 * Premium promotional popup with countdown timer.
 *
 * HOW TO UPDATE A PROMOTION:
 *   1. Edit the `defaults` object below (or override via window.MCA_PROMO_CONFIG)
 *   2. Set `enabled: false` to disable the popup entirely
 *   3. Update `expiry` to the new end date/time
 *   4. Update `ctaLink` to the target package page
 *   5. Replace the `image` path with the new promo image
 *
 * OVERRIDE FROM HTML (e.g. for EN version):
 *   <script>
 *     window.MCA_PROMO_CONFIG = { title: "Special Offer", ... };
 *   </script>
 *   <script src="assets/js/promo-popup.js"></script>
 * ─────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ── Config ─────────────────────────────────────────────── */

  var defaults = {
    enabled:       true,
    badgeText:     'Oferta Especial',
    title:         'Promoção Especial',
    campaign:      'Sunset Cruise — Dia da Mulher Moçambicana',
    discount:      '10% de desconto ao reservar pelo site',
    description:   'Desfrute de um sunset cruise inesquecível na Baía de Maputo com vistas deslumbrantes, ambiente exclusivo e uma experiência perfeita para celebrar uma ocasião especial.',
    expiry:        '2026-04-07T23:59:59',
    ctaText:       'Reservar Agora',
    ctaLink:       'pages/package.html?id=sunset-cruise',
    dismissText:   'Fechar',
    expiredText:   'Esta oferta já expirou.',
    image:         'assets/images/hero/sunset-cruise-maputo-bay.jpeg',
    imageAlt:      'Sunset Cruise — Baía de Maputo',
    sessionKey:    'mca_promo_shown',
    cooldownHours: 24,
    delayMs:       3500,
    daysLabel:     'dias',
    hoursLabel:    'horas',
    minsLabel:     'min',
    secsLabel:     'seg',
  };

  var cfg = Object.assign({}, defaults, window.MCA_PROMO_CONFIG || {});

  if (!cfg.enabled) return;

  /* ── Session / cooldown guard ───────────────────────────── */

  function shouldShow() {
    try {
      var stored = localStorage.getItem(cfg.sessionKey);
      if (!stored) return true;
      return Date.now() - parseInt(stored, 10) > cfg.cooldownHours * 3600000;
    } catch (e) {
      return true; // privacy mode / storage blocked
    }
  }

  function markShown() {
    try { localStorage.setItem(cfg.sessionKey, Date.now().toString()); } catch (e) {}
  }

  if (!shouldShow()) return;

  /* ── Build modal HTML ────────────────────────────────────── */

  function buildPopup() {
    var el = document.createElement('div');
    el.id        = 'promo-overlay';
    el.className = 'promo-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'promo-modal-title');

    el.innerHTML =
      '<div class="promo-modal" id="promo-modal">' +

        /* close X */
        '<button class="promo-close" id="promo-close" aria-label="' + cfg.dismissText + '">' +
          '<i class="bx bx-x"></i>' +
        '</button>' +

        /* image column */
        '<div class="promo-img-col">' +
          '<img src="' + cfg.image + '" alt="' + cfg.imageAlt + '" class="promo-img">' +
          '<div class="promo-img-grad"></div>' +
          '<span class="promo-badge"><i class="bx bxs-gift"></i> ' + cfg.badgeText + '</span>' +
        '</div>' +

        /* content */
        '<div class="promo-body">' +
          '<p class="promo-eyebrow">' + cfg.title + '</p>' +
          '<h2 class="promo-campaign" id="promo-modal-title">' + cfg.campaign + '</h2>' +
          '<div class="promo-discount"><i class="bx bxs-purchase-tag"></i> ' + cfg.discount + '</div>' +
          '<p class="promo-desc">' + cfg.description + '</p>' +

          /* countdown */
          '<div class="promo-countdown" id="promo-countdown">' +
            '<div class="promo-cd-unit"><span class="promo-cd-val" id="promo-cd-d">00</span><span class="promo-cd-lbl">' + cfg.daysLabel  + '</span></div>' +
            '<span class="promo-cd-sep">:</span>' +
            '<div class="promo-cd-unit"><span class="promo-cd-val" id="promo-cd-h">00</span><span class="promo-cd-lbl">' + cfg.hoursLabel + '</span></div>' +
            '<span class="promo-cd-sep">:</span>' +
            '<div class="promo-cd-unit"><span class="promo-cd-val" id="promo-cd-m">00</span><span class="promo-cd-lbl">' + cfg.minsLabel  + '</span></div>' +
            '<span class="promo-cd-sep">:</span>' +
            '<div class="promo-cd-unit"><span class="promo-cd-val" id="promo-cd-s">00</span><span class="promo-cd-lbl">' + cfg.secsLabel  + '</span></div>' +
          '</div>' +

          /* actions */
          '<div class="promo-actions">' +
            '<a href="' + cfg.ctaLink + '" class="btn-promo-cta">' + cfg.ctaText + ' <i class="bx bxs-right-arrow-circle"></i></a>' +
            '<button class="btn-promo-dismiss" id="promo-dismiss">' + cfg.dismissText + '</button>' +
          '</div>' +
        '</div>' +

      '</div>';

    return el;
  }

  /* ── Countdown timer ─────────────────────────────────────── */

  var timerID = null;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function startCountdown(expiryStr) {
    var target = new Date(expiryStr).getTime();

    function tick() {
      var diff = target - Date.now();

      if (diff <= 0) {
        clearInterval(timerID);
        var cdEl      = document.getElementById('promo-countdown');
        var actionsEl = document.querySelector('.promo-actions');
        if (cdEl)      cdEl.innerHTML = '<p class="promo-expired">' + cfg.expiredText + '</p>';
        if (actionsEl) actionsEl.style.display = 'none';
        return;
      }

      var d = Math.floor(diff / 86400000);
      var h = Math.floor((diff % 86400000) / 3600000);
      var m = Math.floor((diff % 3600000)  / 60000);
      var s = Math.floor((diff % 60000)    / 1000);

      var dEl = document.getElementById('promo-cd-d');
      var hEl = document.getElementById('promo-cd-h');
      var mEl = document.getElementById('promo-cd-m');
      var sEl = document.getElementById('promo-cd-s');

      if (dEl) dEl.textContent = pad(d);
      if (hEl) hEl.textContent = pad(h);
      if (mEl) mEl.textContent = pad(m);
      if (sEl) sEl.textContent = pad(s);
    }

    tick();
    timerID = setInterval(tick, 1000);
  }

  /* ── Open / close ────────────────────────────────────────── */

  function openPopup(overlay) {
    document.body.appendChild(overlay);
    document.body.classList.add('promo-scroll-lock');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { // double rAF for reliable CSS transition
        overlay.classList.add('promo-visible');
      });
    });
    markShown();
    startCountdown(cfg.expiry);
  }

  function closePopup(overlay) {
    overlay.classList.remove('promo-visible');
    overlay.addEventListener('transitionend', function handler() {
      overlay.removeEventListener('transitionend', handler);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.body.classList.remove('promo-scroll-lock');
      if (timerID) clearInterval(timerID);
    });
  }

  /* ── Init ────────────────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      var overlay = buildPopup();

      /* click outside modal */
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closePopup(overlay);
      });

      /* close button */
      overlay.querySelector('#promo-close').addEventListener('click', function () {
        closePopup(overlay);
      });

      /* dismiss button */
      var dismissBtn = overlay.querySelector('#promo-dismiss');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', function () { closePopup(overlay); });
      }

      /* Escape key */
      function onKey(e) {
        if (e.key === 'Escape') {
          closePopup(overlay);
          document.removeEventListener('keydown', onKey);
        }
      }
      document.addEventListener('keydown', onKey);

      openPopup(overlay);
    }, cfg.delayMs);
  });

})();
