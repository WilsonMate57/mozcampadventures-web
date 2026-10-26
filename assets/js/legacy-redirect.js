/**
 * MOZ CAMP ADVENTURES — legacy-redirect.js
 * Redireccionamentos dos URLs antigos da raiz (package.html, pacotes.html,
 * alojamentos.html). Mantém a query (?id=, ?cat=). Sem JS inline (CSP).
 */
(function () {
  'use strict';
  var me = document.currentScript;
  var target = me && me.getAttribute('data-target');
  if (target) location.replace(target + (me.hasAttribute('data-keep-query') ? location.search : ''));
})();
