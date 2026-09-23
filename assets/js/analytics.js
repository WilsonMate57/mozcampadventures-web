/**
 * MOZ CAMP ADVENTURES — analytics.js
 * =====================================================
 * Central tracking module.
 * All event tracking goes through window.mcaTrack().
 * Pushes events to GTM dataLayer → GA4 via GTM.
 *
 * USAGE (from any module):
 *   mcaTrack('view_package', { package_id: 'macaneta-day-trip', ... });
 *
 * EVENTS CATALOGUE:
 *   view_package          — user views a package detail page
 *   open_booking_form     — user opens / interacts with booking form
 *   calculate_price       — booking total is recalculated
 *   select_transfer       — user selects a private transfer option
 *   submit_booking_wa     — user submits booking via WhatsApp
 *   submit_booking_email  — user submits booking via Email
 *   click_whatsapp        — user clicks any WhatsApp CTA
 *   view_promo_popup      — promo popup becomes visible
 *   click_promo_popup     — user clicks the promo popup CTA
 *   click_hero_cta        — user clicks a hero section CTA
 * =====================================================
 */

(function () {
  'use strict';

  /* ── Ensure dataLayer exists ─────────────────────────────── */
  window.dataLayer = window.dataLayer || [];

  /* ── Core tracking function ──────────────────────────────── */

  /**
   * Send a custom event to GTM dataLayer → GA4.
   *
   * @param {string} eventName  — GA4 event name (snake_case)
   * @param {Object} [params]   — event parameters (key/value pairs)
   */
  window.mcaTrack = function (eventName, params) {
    if (!eventName) return;

    var payload = Object.assign(
      { event: eventName, mca_lang: window.MCA_LANG || 'pt' },
      params || {}
    );

    window.dataLayer.push(payload);
  };

})();
