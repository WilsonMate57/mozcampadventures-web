/**
 * MOZ CAMP ADVENTURES — consent.js
 * =====================================================
 * Cookie consent management with Google Consent Mode v2.
 * Depends on: components.js (injects banner via mcaCookieReady event)
 * Must load BEFORE GTM snippet in <head>.
 * =====================================================
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'mca_cookie_consent';

  /* ── Consent Mode v2 default (blocked until user decides) ── */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  gtag('consent', 'default', {
    analytics_storage:    'denied',
    ad_storage:           'denied',
    ad_user_data:         'denied',
    ad_personalization:   'denied',
    wait_for_update:      500
  });

  /* ── Read saved consent ─────────────────────────────────── */
  function getSaved() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }

  function saveConsent(analytics) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      analytics: analytics,
      ts: Date.now()
    }));
  }

  /* ── Update Consent Mode v2 ─────────────────────────────── */
  function updateConsent(analytics) {
    var state = analytics ? 'granted' : 'denied';
    gtag('consent', 'update', {
      analytics_storage:  state,
      ad_storage:         'denied',
      ad_user_data:       'denied',
      ad_personalization: 'denied'
    });
  }

  /* ── Apply saved consent immediately (before GTM fires) ─── */
  var _saved = getSaved();
  if (_saved !== null) {
    updateConsent(_saved.analytics);
  }

  /* ── Banner & Modal logic ───────────────────────────────── */
  function initConsentUI() {
    var banner       = document.getElementById('cookie-banner');
    var btnAll       = document.getElementById('cb-accept-all');
    var btnEssential = document.getElementById('cb-essentials');
    var btnCustomize = document.getElementById('cb-customize');
    var modalEl      = document.getElementById('cookieModal');
    var toggleAnalytics = document.getElementById('toggle-analytics');
    var cmSave       = document.getElementById('cm-save');
    var cmAcceptAll  = document.getElementById('cm-accept-all');

    if (!banner) return;

    /* Show banner only if no prior consent */
    if (_saved === null) {
      banner.style.display = '';
    }

    function hideBanner() {
      banner.style.display = 'none';
    }

    function acceptAll() {
      saveConsent(true);
      updateConsent(true);
      hideBanner();
      closeModal();
    }

    function acceptEssentials() {
      saveConsent(false);
      updateConsent(false);
      hideBanner();
    }

    function openModal() {
      if (toggleAnalytics) {
        toggleAnalytics.checked = _saved ? _saved.analytics : false;
      }
      if (typeof bootstrap !== 'undefined' && modalEl) {
        var bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        bsModal.show();
      }
    }

    function closeModal() {
      if (typeof bootstrap !== 'undefined' && modalEl) {
        var bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();
      }
    }

    function savePreferences() {
      var analytics = toggleAnalytics ? toggleAnalytics.checked : false;
      saveConsent(analytics);
      updateConsent(analytics);
      hideBanner();
      closeModal();
    }

    if (btnAll)       btnAll.addEventListener('click', acceptAll);
    if (btnEssential) btnEssential.addEventListener('click', acceptEssentials);
    if (btnCustomize) btnCustomize.addEventListener('click', openModal);
    if (cmSave)       cmSave.addEventListener('click', savePreferences);
    if (cmAcceptAll)  cmAcceptAll.addEventListener('click', acceptAll);

    /* "Gerir cookies" link in footer */
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-cookie-manage]');
      if (t) { e.preventDefault(); openModal(); }
    });
  }

  /* ── Wait for banner to be injected ────────────────────── */
  document.addEventListener('mcaCookieReady', initConsentUI);

})();
