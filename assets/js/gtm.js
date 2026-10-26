/**
 * MOZ CAMP ADVENTURES — gtm.js
 * Carrega o Google Tag Manager (antes era um snippet inline; agora é um
 * ficheiro para a Content-Security-Policy não precisar de 'unsafe-inline').
 * Tem de ser carregado DEPOIS de consent.js (Consent Mode v2 por omissão: negado).
 */
(function (w, d) {
  'use strict';
  var me = d.currentScript;
  var id = me && me.getAttribute('data-gtm');
  w.MCA_LANG = d.documentElement.lang === 'en' ? 'en' : 'pt';
  if (!id) return;
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  var s = d.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(id);
  d.head.appendChild(s);
})(window, document);
