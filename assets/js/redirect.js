/**
 * MOZ CAMP ADVENTURES — redirect.js
 * pages/package.html?id=<slug> (URL antigo) → nova página da experiência.
 * O mapa vem do bloco JSON #redirect-map gerado por scripts/build.mjs.
 */
(function () {
  'use strict';
  var el = document.getElementById('redirect-map');
  if (!el) return;
  var map = JSON.parse(el.textContent);
  var id = new URLSearchParams(location.search).get('id');
  location.replace(map[id] || el.getAttribute('data-fallback') || '/');
})();
