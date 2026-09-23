/**
 * MOZ CAMP ADVENTURES — packages-data.js
 * =========================================================
 * Data is now stored in clean JSON files:
 *   → /data/tours.json
 *   → /data/accommodations.json
 *
 * Usage (all pages):
 *   mcaReady(function(data) {
 *     data.tours         // array of tour packages
 *     data.accommodation // array of accommodation packages
 *   });
 *
 * Backward-compatible globals:
 *   PACKAGES_DATA      // populated after load
 *   getPackageBySlug() // find package by slug
 *   getPackageCategory() // 'tour' | 'accommodation'
 *   _loadAllPackagesAsync() // legacy alias for mcaReady
 * =========================================================
 */

(function () {
  'use strict';

  /* ── Detect base path (works from root and any sub-page) ── */
  var _base = (function () {
    var p = window.location.pathname;
    // If page is in a sub-directory, go one level up
    return (p.split('/').length > 2 && !p.endsWith('/')) ? '../' : './';
  })();

  /* ── State ─────────────────────────────────────────────── */
  var PACKAGES_DATA = { tours: [], accommodation: [] };
  var _ready        = false;
  var _queue        = [];

  /* ── Public API ────────────────────────────────────────── */
  window.PACKAGES_DATA = PACKAGES_DATA;

  window.mcaReady = function (cb) {
    if (_ready) { cb(PACKAGES_DATA); return; }
    _queue.push(cb);
  };

  // Legacy alias used by package.html
  window._loadAllPackagesAsync = function (cb) {
    window.mcaReady(function () { cb(); });
  };

  /* ── Helpers ───────────────────────────────────────────── */
  window.getPackageBySlug = function (slug) {
    return [].concat(PACKAGES_DATA.tours, PACKAGES_DATA.accommodation)
      .find(function (p) { return p.slug === slug; }) || null;
  };

  window.getPackageCategory = function (slug) {
    if (PACKAGES_DATA.tours.find(function (p) { return p.slug === slug; })) return 'tour';
    if (PACKAGES_DATA.accommodation.find(function (p) { return p.slug === slug; })) return 'accommodation';
    return null;
  };

  /* ── Load JSON ─────────────────────────────────────────── */
  function _flush () {
    _ready = true;
    _queue.forEach(function (cb) { cb(PACKAGES_DATA); });
    _queue = [];
  }

  Promise.all([
    fetch(_base + 'data/tours.json').then(function (r) { return r.json(); }),
    fetch(_base + 'data/accommodations.json').then(function (r) { return r.json(); })
  ]).then(function (results) {
    PACKAGES_DATA.tours         = results[0] || [];
    PACKAGES_DATA.accommodation = results[1] || [];
    _flush();
  }).catch(function (err) {
    console.error('[MCA] Failed to load package data:', err);
    _flush(); // still resolve so pages don't hang
  });

})();
