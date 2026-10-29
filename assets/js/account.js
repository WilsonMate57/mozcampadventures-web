/**
 * MOZ CAMP ADVENTURES — account.js
 * Conta de cliente (/conta/ e /en/account/): entrar, criar conta (entra logo),
 * repor palavra-passe e painel (reservas da conta, perfil, promoções,
 * palavra-passe, apagar conta).
 * O link de reposição traz o token no fragmento (#reset=…), que não vai para
 * o servidor nem para os registos.
 * API: /api/account/* — escritas autenticadas levam X-CSRF-Token.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-account]');
  if (!root) return;
  var M = JSON.parse(document.getElementById('account-i18n').textContent);
  var csrf = '';
  var $ = function (s) { return root.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function mzn(n) { return Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' MZN'; }
  function day(v) { return v ? new Date(String(v).slice(0, 10) + 'T00:00:00').toLocaleDateString(M.locale, { day: 'numeric', month: 'long', year: 'numeric' }) : '—'; }

  function api(path, body, method) {
    var h = { 'Content-Type': 'application/json' };
    if (csrf) h['X-CSRF-Token'] = csrf;
    return fetch('/api/account/' + path, { method: method || 'POST', headers: h, credentials: 'same-origin', body: method === 'GET' ? undefined : JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
      .catch(function () { return { ok: false, status: 0, data: {} }; });
  }

  function msg(text, ok) {
    var el = $('[data-msg]');
    el.textContent = text || '';
    el.className = 'form-msg account__msg' + (text ? (ok ? ' is-ok' : ' is-err') : '');
    el.hidden = !text;
  }
  function fail(res) { msg(M[res.data && res.data.error] || M.error, false); }

  function show(view) {
    $$('[data-view]').forEach(function (v) { v.hidden = v.dataset.view !== view; });
    var first = root.querySelector('[data-view="' + view + '"] input:not([readonly]):not([type=checkbox]):not([tabindex="-1"])');
    if (first && view !== 'dashboard') first.focus();
  }
  function go(view) { msg(''); history.replaceState(null, '', location.pathname); show(view); }

  function busy(form, on) { Array.prototype.forEach.call(form.querySelectorAll('button'), function (b) { b.disabled = on; }); }

  /* ── Painel ─────────────────────────────────────────── */
  function dashboard(d) {
    csrf = d.csrf || csrf;
    var c = d.customer;
    $('[data-c-name]').textContent = c.name.split(' ')[0];
    $('[data-c-email]').value = c.email;
    var f = root.querySelector('[data-form="profile"]');
    f.elements.pname.value = c.name; f.elements.pphone.value = c.phone || ''; f.elements.plang.value = c.lang;
    $('[data-marketing]').checked = !!c.marketing;
    $('[data-marketing-since]').textContent = c.marketing && c.marketing_since ? '✓ ' + M.since + ' ' + day(c.marketing_since) : '';
    var list = d.bookings || [];
    $('[data-no-bookings]').hidden = list.length > 0;
    $('[data-bookings]').innerHTML = list.map(function (b) {
      var when = b.service_date ? day(b.service_date) : day(b.checkin) + ' → ' + day(b.checkout);
      var pax = b.adults + b.children;
      return '<a class="account-booking" href="' + esc(b.url) + '" data-booking-ref="' + esc(b.reference) + '">' +
        '<span class="account-booking__top"><strong>' + esc(b.item) + '</strong><span class="ticket__status ticket__status--' + esc(b.status) + '">' + esc(M.st[b.status] || b.status) + '</span></span>' +
        '<span class="account-booking__meta"><span><i class="bx bx-calendar"></i> ' + esc(when) + '</span><span><i class="bx bx-group"></i> ' + esc(pax === 1 ? M.p1 : M.pN.replace('{n}', pax)) + '</span>' +
        '<span><i class="bx bx-receipt"></i> ' + esc(b.reference) + '</span></span>' +
        '<span class="account-booking__foot"><span>' + (b.to_confirm ? esc(M.toConfirm) : mzn(b.total)) + '</span><span class="text-link">' + esc(M.view) + ' <i class="bx bx-right-arrow-alt"></i></span></span></a>';
    }).join('');
    show('dashboard');
  }

  /* ── Formulários ─────────────────────────────────────── */
  var token = '';
  root.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    var el = form.elements, kind = form.dataset.form;
    msg('');
    var req;
    if (kind === 'login') req = api('login', { email: el.email.value.trim(), password: el.password.value });
    else if (kind === 'register') req = api('register', { name: el.name.value.trim(), email: el.remail.value.trim(), phone: el.phone.value.trim(), password: el.rpassword.value,
      terms: el.terms.checked, marketing: el.marketing.checked, lang: root.dataset.lang, website: (el.mca_hp || {}).value || '' });
    else if (kind === 'forgot') req = api('forgot', { email: el.femail.value.trim() });
    else if (kind === 'reset') {
      if (el.npassword.value !== el.npassword2.value) return msg(M.mismatch, false);
      req = api('reset', { token: token, password: el.npassword.value });
    } else if (kind === 'profile') req = api('profile', { name: el.pname.value.trim(), phone: el.pphone.value.trim(), lang: el.plang.value });
    else if (kind === 'password') req = api('password', { current: el.cpassword.value, password: el.cnew.value });
    else if (kind === 'delete') {
      if (!window.confirm(M.confirmDelete)) return;
      req = api('delete', { password: el.dpassword.value });
    }
    busy(form, true);
    req.then(function (res) {
      busy(form, false);
      if (!res.ok) return fail(res);
      if (kind === 'forgot') { form.reset(); return msg(M.forgotSent, true); }
      if (kind === 'password') { form.reset(); return msg(M.pwChanged, true); }
      if (kind === 'delete') { csrf = ''; location.href = '/' + (root.dataset.lang === 'en' ? 'en/' : ''); return; }
      if (kind === 'profile') { msg(M.saved, true); return dashboard(res.data); }
      form.reset();
      history.replaceState(null, '', location.pathname);
      dashboard(res.data);                       // registo, entrada e reposição → entra na conta
    });
  });

  root.addEventListener('change', function (e) {
    if (!e.target.matches('[data-marketing]')) return;
    var box = e.target;
    box.disabled = true;
    api('profile', { marketing: box.checked }).then(function (res) {
      box.disabled = false;
      if (!res.ok) { box.checked = !box.checked; return fail(res); }
      msg(M.saved, true);
      dashboard(res.data);
    });
  });

  root.addEventListener('click', function (e) {
    var to = e.target.closest('[data-go]');
    if (to) { e.preventDefault(); go(to.dataset.go); }
    if (e.target.closest('[data-logout]')) {
      api('logout').then(function () { csrf = ''; go('login'); });
    }
  });

  /* ── Arranque: links dos e-mails ou sessão (também quando o link é colado no mesmo separador) ── */
  function boot() {
    var h = new URLSearchParams(location.hash.slice(1));
    msg('');
    if (/^[a-f0-9]{64}$/.test(h.get('reset') || '')) { token = h.get('reset'); show('reset'); }
    else {
      api('me', null, 'GET').then(function (res) { res.ok ? dashboard(res.data) : show(location.hash === '#criar' || location.hash === '#register' ? 'register' : 'login'); });
    }
  }
  window.addEventListener('hashchange', boot);
  boot();
})();
