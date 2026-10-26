/**
 * MOZ CAMP ADVENTURES — reviews.js (Fase 4)
 * ─────────────────────────────────────────────────────────
 * Avaliações geridas no site (API /api/reviews; antes: Firestore).
 *   • [data-reviews="home"]   → últimas aprovadas (secção #feedback)
 *   • [data-reviews="<slug>"] → aprovadas do pacote + chip de média
 *   • #review-dialog           → nova avaliação (fica pendente até
 *                                 ser aprovada no painel)
 * Sem avaliações, a secção da home fica escondida; não há estrelas
 * por omissão.
 * ─────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  var tEl = document.getElementById('review-t');      // textos PT/EN (bloco JSON, compatível com CSP)
  var T = tEl ? JSON.parse(tEl.textContent) : {};

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function stars(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  function month(iso) {
    if (!iso) return '';
    return new Date(iso + 'T00:00:00').toLocaleDateString(T.locale || 'pt-PT', { month: 'long', year: 'numeric' });
  }

  function cardHtml(r) {
    var rating = Math.max(1, Math.min(5, parseInt(r.rating, 10) || 1));
    return '<article class="review-card">' +
      '<div class="review-card__stars" role="img" aria-label="' + esc((T.stars || [])[rating - 1] || rating + '/5') + '">' + stars(rating) + '</div>' +
      '<blockquote>' + esc(r.text) + '</blockquote>' +
      '<footer><span class="review-card__avatar" aria-hidden="true">' + esc((r.name || '?').trim().charAt(0).toUpperCase()) + '</span>' +
      '<span><strong>' + esc(r.name) + '</strong><small>' + [r.origin, month(r.date)].filter(Boolean).map(esc).join(' · ') + '</small></span></footer>' +
      '</article>';
  }

  function load(el) {
    var key = el.dataset.reviews, isHome = key === 'home';
    if (!isHome) el.innerHTML = '<p class="review-empty">' + esc(T.loading) + '</p>';
    fetch('/api/reviews?item=' + encodeURIComponent(key), { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var list = data.reviews || [];
        if (isHome) {
          if (!list.length) return;
          el.innerHTML = list.slice(0, 4).map(cardHtml).join('');
          var section = el.closest('[data-reviews-section]');
          if (section) section.hidden = false;
          return;
        }
        if (!list.length) { el.innerHTML = '<p class="review-empty">' + esc(T.none) + '</p>'; return; }
        el.innerHTML = list.map(cardHtml).join('');
        var chip = document.querySelector('[data-rating]');
        if (chip && data.average) {
          var n = list.length === 1 ? T.one : (T.many || '{n}').replace('{n}', list.length);
          chip.innerHTML = '<i class="bx bxs-star"></i>' + Number(data.average).toFixed(1) + ' · ' + esc(n);
          chip.hidden = false;
        }
      })
      .catch(function () {
        if (!isHome) el.innerHTML = '<p class="review-empty">' + esc(T.none) + '</p>';
      });
  }

  function initForm() {
    var dialog = document.getElementById('review-dialog');
    var form = dialog && dialog.querySelector('[data-review-form]');
    if (!form) return;
    var msg = form.querySelector('[data-review-msg]');
    var btn = form.querySelector('button[type=submit]');

    document.querySelectorAll('[data-review-open]').forEach(function (b) {
      b.addEventListener('click', function () {
        msg.textContent = ''; msg.className = 'form-msg';
        if (typeof dialog.showModal === 'function') dialog.showModal();
      });
    });
    dialog.querySelector('[data-review-close]').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var el = form.elements;
      var rating = parseInt((form.querySelector('input[name=rating]:checked') || {}).value, 10) || 0;
      var fail = function (m) { msg.textContent = m; msg.className = 'form-msg is-err'; };
      if (!el.name.value.trim()) return fail(T.errName);
      if (!rating) return fail(T.errRating);
      if (el.text.value.trim().length < 5) return fail(T.errText);

      btn.disabled = true; btn.textContent = T.sending;
      fetch('/api/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ name: el.name.value.trim(), origin: el.role.value.trim(), rating: rating, text: el.text.value.trim(), item: form.dataset.package || '', lang: document.documentElement.lang, website: el.website.value })
      })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          form.reset();
          msg.textContent = T.ok; msg.className = 'form-msg is-ok';
          if (typeof window.mcaTrack === 'function') window.mcaTrack('submit_review', { package_id: form.dataset.package || 'home' });
        })
        .catch(function () { fail(T.err); })
        .then(function () { btn.disabled = false; btn.textContent = T.send; });
    });
  }

  document.querySelectorAll('[data-reviews]').forEach(load);
  initForm();
})();
