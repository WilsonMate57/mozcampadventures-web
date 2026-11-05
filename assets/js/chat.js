/**
 * MOZ CAMP ADVENTURES — assets/js/chat.js
 * Live Chat do visitante: botão flutuante e janela, em todas as páginas públicas.
 * Tempo real por consulta curta: 3 s com a janela aberta, 20 s minimizada, 60 s com o separador oculto.
 * Quem nunca abriu uma conversa faz um único pedido de estado por minuto de navegação.
 * Todo o texto entra por textContent: uma mensagem nunca é interpretada como HTML.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var lang = (document.documentElement.lang || 'pt').indexOf('en') === 0 ? 'en' : 'pt';
  var T = {
    pt: {
      open: 'Abrir o chat', minimise: 'Minimizar o chat', title: 'Fale connosco', online: 'Equipa online', away: 'Respondemos em breve', offline: 'Equipa offline',
      offlineNote: 'Neste momento não há ninguém disponível. Deixe a sua mensagem e respondemos por e-mail assim que possível.',
      intro: 'Diga-nos quem é e como podemos ajudar.', name: 'Nome', email: 'E-mail', phone: 'Telefone (opcional)', subject: 'Assunto', choose: 'Escolha um assunto', message: 'Mensagem', start: 'Iniciar conversa', leave: 'Deixar mensagem',
      privacy: 'Usamos estes dados apenas para responder. A conversa fica guardada durante {n} meses.', privacyLink: 'Privacidade', privacyHref: '/pages/privacidade.html',
      write: 'Escreva a sua mensagem', send: 'Enviar', attach: 'Anexar imagem ou PDF', sending: 'A enviar…', sent: 'Enviada', read: 'Lida', failed: 'Não enviada', retry: 'Tentar de novo',
      typing: 'A equipa está a escrever…', noNet: 'Sem ligação. A tentar de novo…', closed: 'Esta conversa foi encerrada. Escreva para a reabrir.', end: 'Terminar neste dispositivo', endAsk: 'Terminar a conversa neste dispositivo? A equipa continua a poder responder por e-mail.', you: 'Você',
      tooBig: 'O ficheiro tem mais de 5 MB.', badType: 'Use uma imagem (JPEG, PNG, WebP) ou um PDF.', tooMany: 'Demasiados pedidos. Tente daqui a pouco.', generic: 'Não foi possível enviar. Tente de novo.', errName: 'Indique o seu nome.', errEmail: 'Indique um e-mail válido.', errPhone: 'Indique um telefone válido.', errSubject: 'Escolha um assunto.', errMessage: 'Escreva a sua mensagem.', unread: 'mensagens por ler',
      subjects: { reservations: 'Reservas', island_hopping: 'Island Hopping', sunset_cruise: 'Sunset Cruise', beach_tours: 'Passeios de praia', safaris: 'Safaris', transfers: 'Transfers', accommodation: 'Alojamento', general: 'Informação geral', other: 'Outro' }
    },
    en: {
      open: 'Open chat', minimise: 'Minimise chat', title: 'Chat with us', online: 'Team online', away: 'We will reply soon', offline: 'Team offline',
      offlineNote: 'Nobody is available right now. Leave your message and we will reply by e-mail as soon as possible.',
      intro: 'Tell us who you are and how we can help.', name: 'Name', email: 'E-mail', phone: 'Phone (optional)', subject: 'Subject', choose: 'Choose a subject', message: 'Message', start: 'Start chat', leave: 'Leave a message',
      privacy: 'We use these details only to reply. The conversation is kept for {n} months.', privacyLink: 'Privacy', privacyHref: '/en/pages/privacy.html',
      write: 'Write your message', send: 'Send', attach: 'Attach an image or PDF', sending: 'Sending…', sent: 'Sent', read: 'Read', failed: 'Not sent', retry: 'Try again',
      typing: 'The team is typing…', noNet: 'No connection. Trying again…', closed: 'This conversation was closed. Write to reopen it.', end: 'End on this device', endAsk: 'End the chat on this device? The team can still reply by e-mail.', you: 'You',
      tooBig: 'The file is larger than 5 MB.', badType: 'Use an image (JPEG, PNG, WebP) or a PDF.', tooMany: 'Too many requests. Please try again shortly.', generic: 'Could not send. Please try again.', errName: 'Please enter your name.', errEmail: 'Please enter a valid e-mail.', errPhone: 'Please enter a valid phone number.', errSubject: 'Please choose a subject.', errMessage: 'Please write your message.', unread: 'unread messages',
      subjects: { reservations: 'Reservations', island_hopping: 'Island Hopping', sunset_cruise: 'Sunset Cruise', beach_tours: 'Beach Tours', safaris: 'Safaris', transfers: 'Transfers', accommodation: 'Accommodation', general: 'General Information', other: 'Other' }
    }
  }[lang];
  var ERR = { invalid_name: T.errName, invalid_email: T.errEmail, invalid_phone: T.errPhone, invalid_subject: T.errSubject, invalid_message: T.errMessage, too_many_requests: T.tooMany, chat_file_too_large: T.tooBig, chat_file_type: T.badType };
  var MAX_FILE = 5242880, CACHE = 'mca_chat_status', OPEN = 'mca_chat_open';

  var state = 'offline', hasSession = false, isOpen = false, after = 0, readUpto = 0, unread = 0, status = 'open', fails = 0, timer = null, lastTyping = 0, baseTitle = document.title;
  var seen = {}, local = {};
  var ui = {};

  function store(kind, key, value) {
    try {
      var s = window[kind];
      if (value === undefined) return s.getItem(key);
      if (value === null) s.removeItem(key); else s.setItem(key, value);
    } catch (e) { /* armazenamento bloqueado: o chat funciona na mesma */ }
    return null;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function call(method, path, body) {
    var o = { method: method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (body instanceof FormData) o.body = body;
    else if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch('/api/chat' + path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
    }).catch(function () { return { ok: false, status: 0, data: {} }; });
  }
  function when(at) {
    var d = new Date(String(at).replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
    if (isNaN(d)) return '';
    var t = d.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'pt-PT', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? t : d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT', { day: '2-digit', month: '2-digit' }) + ' ' + t;
  }

  /* ── Estrutura ───────────────────────────────────────── */
  function build() {
    ui.root = el('div', 'chatw');
    ui.root.dataset.state = state;
    ui.btn = el('button', 'chatw__btn');
    ui.btn.type = 'button';
    ui.btn.setAttribute('aria-label', T.open);
    ui.btn.setAttribute('aria-expanded', 'false');
    ui.btn.setAttribute('aria-controls', 'chatw-panel');
    ui.btn.appendChild(el('i', 'bx bx-message-rounded-dots')).setAttribute('aria-hidden', 'true');
    ui.btn.appendChild(el('span', 'chatw__dot'));
    ui.badge = ui.btn.appendChild(el('span', 'chatw__badge'));
    ui.badge.hidden = true;

    ui.panel = el('section', 'chatw__panel');
    ui.panel.id = 'chatw-panel';
    ui.panel.hidden = true;
    ui.panel.setAttribute('role', 'dialog');
    ui.panel.setAttribute('aria-label', T.title);

    var head = ui.panel.appendChild(el('header', 'chatw__head'));
    var who = head.appendChild(el('div'));
    who.appendChild(el('strong', '', T.title));
    ui.state = who.appendChild(el('span', 'chatw__state'));
    ui.min = head.appendChild(el('button', 'chatw__min'));
    ui.min.type = 'button';
    ui.min.setAttribute('aria-label', T.minimise);
    ui.min.appendChild(el('i', 'bx bx-minus')).setAttribute('aria-hidden', 'true');

    ui.net = ui.panel.appendChild(el('p', 'chatw__net', T.noNet));
    ui.net.hidden = true;
    ui.note = ui.panel.appendChild(el('p', 'chatw__note'));
    ui.note.hidden = true;
    ui.form = ui.panel.appendChild(startForm());
    ui.log = ui.panel.appendChild(el('div', 'chatw__log'));
    ui.log.setAttribute('role', 'log');
    ui.log.setAttribute('aria-live', 'polite');
    ui.log.tabIndex = 0;
    ui.typing = ui.panel.appendChild(el('p', 'chatw__typing', T.typing));
    ui.typing.hidden = true;
    ui.err = ui.panel.appendChild(el('p', 'chatw__err'));
    ui.err.setAttribute('role', 'alert');
    ui.err.hidden = true;
    ui.composer = ui.panel.appendChild(composer());
    ui.end = ui.panel.appendChild(el('button', 'chatw__end', T.end));
    ui.end.type = 'button';

    ui.root.appendChild(ui.panel);
    ui.root.appendChild(ui.btn);

    ui.btn.addEventListener('click', function () { toggle(!isOpen); });
    ui.min.addEventListener('click', function () { toggle(false); });
    ui.panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(false); });
    ui.end.addEventListener('click', endChat);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && hasSession) schedule(0); });
  }

  function field(parent, id, label, node) {
    var f = parent.appendChild(el('div', 'chatw__field'));
    var l = f.appendChild(el('label', '', label));
    l.htmlFor = id;
    node.id = id;
    f.appendChild(node);
    return node;
  }
  function startForm() {
    var f = el('form', 'chatw__form');
    f.noValidate = true;
    f.appendChild(el('p', 'chatw__intro', T.intro));
    ui.fName = field(f, 'chatw-name', T.name, el('input'));
    ui.fName.autocomplete = 'name';
    ui.fName.maxLength = 120;
    ui.fEmail = field(f, 'chatw-email', T.email, el('input'));
    ui.fEmail.type = 'email';
    ui.fEmail.autocomplete = 'email';
    ui.fEmail.maxLength = 160;
    ui.fPhone = field(f, 'chatw-phone', T.phone, el('input'));
    ui.fPhone.type = 'tel';
    ui.fPhone.autocomplete = 'tel';
    ui.fPhone.maxLength = 30;
    ui.fSubject = field(f, 'chatw-subject', T.subject, el('select'));
    ui.fSubject.appendChild(new Option(T.choose, ''));
    Object.keys(T.subjects).forEach(function (k) { ui.fSubject.appendChild(new Option(T.subjects[k], k)); });
    ui.fMessage = field(f, 'chatw-message', T.message, el('textarea'));
    ui.fMessage.rows = 3;
    ui.fMessage.maxLength = 2000;
    var hp = f.appendChild(el('div', 'hp'));
    hp.setAttribute('aria-hidden', 'true');
    hp.appendChild(el('label', '', lang === 'en' ? 'Do not fill in' : 'Não preencher')).htmlFor = 'chatw-hp';
    ui.fHp = hp.appendChild(el('input'));
    ui.fHp.id = 'chatw-hp';
    ui.fHp.name = 'mca_chat_hp';
    ui.fHp.tabIndex = -1;
    ui.fHp.autocomplete = 'off';
    ui.fErr = f.appendChild(el('p', 'chatw__err'));
    ui.fErr.setAttribute('role', 'alert');
    ui.fErr.hidden = true;
    ui.fSubmit = f.appendChild(el('button', 'chatw__submit', T.start));
    var p = f.appendChild(el('p', 'chatw__privacy', T.privacy.replace('{n}', '12') + ' '));
    var a = p.appendChild(el('a', '', T.privacyLink));
    a.href = T.privacyHref;
    f.addEventListener('submit', submitStart);
    return f;
  }
  function composer() {
    var c = el('form', 'chatw__composer');
    ui.file = c.appendChild(el('input'));
    ui.file.type = 'file';
    ui.file.accept = 'image/jpeg,image/png,image/webp,application/pdf';
    ui.file.hidden = true;
    var at = c.appendChild(el('button', 'chatw__icon'));
    at.type = 'button';
    at.setAttribute('aria-label', T.attach);
    at.appendChild(el('i', 'bx bx-paperclip')).setAttribute('aria-hidden', 'true');
    ui.input = c.appendChild(el('textarea'));
    ui.input.rows = 1;
    ui.input.maxLength = 2000;
    ui.input.placeholder = T.write;
    ui.input.setAttribute('aria-label', T.write);
    var go = c.appendChild(el('button', 'chatw__icon chatw__icon--send'));
    go.setAttribute('aria-label', T.send);
    go.appendChild(el('i', 'bx bx-send')).setAttribute('aria-hidden', 'true');

    at.addEventListener('click', function () { ui.file.click(); });
    ui.file.addEventListener('change', function () { if (ui.file.files[0]) sendFile(ui.file.files[0]); ui.file.value = ''; });
    c.addEventListener('submit', function (e) { e.preventDefault(); sendText(); });
    ui.input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } });
    ui.input.addEventListener('input', function () {
      if (Date.now() - lastTyping > 3000) { lastTyping = Date.now(); call('POST', '/typing', {}); }
    });
    return c;
  }

  /* ── Estado da janela ────────────────────────────────── */
  function paint() {
    ui.root.dataset.state = state;
    ui.state.textContent = T[state];
    ui.form.hidden = hasSession;
    ui.log.hidden = ui.composer.hidden = ui.end.hidden = !hasSession;
    ui.fSubmit.textContent = state === 'online' ? T.start : T.leave;
    var note = hasSession ? (status === 'closed' ? T.closed : state === 'offline' ? T.offlineNote : '') : (state === 'offline' ? T.offlineNote : '');
    ui.note.textContent = note;
    ui.note.hidden = !note;
    ui.badge.hidden = !unread;
    ui.badge.textContent = unread > 9 ? '9+' : String(unread);
    ui.btn.setAttribute('aria-label', unread ? T.open + ' (' + unread + ' ' + T.unread + ')' : T.open);
    document.title = unread ? '(' + unread + ') ' + baseTitle : baseTitle;
  }
  function toggle(on) {
    isOpen = on;
    ui.panel.hidden = !on;
    ui.btn.hidden = on && window.innerWidth <= 520;
    ui.btn.setAttribute('aria-expanded', String(on));
    store('sessionStorage', OPEN, on ? '1' : null);
    if (on) {
      unread = 0;
      paint();
      scrollEnd();
      (hasSession ? ui.input : ui.fName).focus({ preventScroll: true });
      if (hasSession) schedule(0);
    } else {
      ui.btn.hidden = false;
      ui.btn.focus({ preventScroll: true });
      if (hasSession) schedule(20000);
    }
  }
  function scrollEnd() { ui.log.scrollTop = ui.log.scrollHeight; }
  function showErr(node, msg) { node.textContent = msg || ''; node.hidden = !msg; }

  /* ── Mensagens ───────────────────────────────────────── */
  function bubble(m, mine) {
    var b = el('div', 'chatw__msg ' + (mine ? 'is-mine' : 'is-team'));
    if (!mine) b.appendChild(el('span', 'chatw__who', m.author));
    if (m.file) {
      if (m.file.mime.indexOf('image/') === 0) {
        var a = b.appendChild(el('a', 'chatw__img'));
        a.href = m.file.url;
        a.target = '_blank';
        a.rel = 'noopener';
        var i = a.appendChild(el('img'));
        i.src = m.file.url;
        i.alt = m.file.name;
        i.loading = 'lazy';
      } else {
        var d = b.appendChild(el('a', 'chatw__file'));
        d.href = m.file.url;
        d.appendChild(el('i', 'bx bx-file')).setAttribute('aria-hidden', 'true');
        d.appendChild(document.createTextNode(' ' + m.file.name));
      }
    }
    if (m.body) b.appendChild(el('p', '', m.body));
    var foot = b.appendChild(el('span', 'chatw__meta'));
    foot.appendChild(el('time', '', m.at ? when(m.at) : ''));
    if (mine) b.status = foot.appendChild(el('span', 'chatw__st'));
    ui.log.appendChild(b);
    return b;
  }
  function refreshStatus() {
    var keys = Object.keys(local), lastSent = null;
    keys.forEach(function (k) {
      var x = local[k];
      if (x.state === 'sent' && (!lastSent || x.id > lastSent.id)) lastSent = x;
    });
    keys.forEach(function (k) {
      var x = local[k], st = x.node.status;
      st.textContent = '';
      if (x.state === 'sending') st.textContent = T.sending;
      else if (x.state === 'failed') {
        st.appendChild(document.createTextNode(T.failed + ' · '));
        var r = st.appendChild(el('button', 'chatw__retry', T.retry));
        r.type = 'button';
        r.addEventListener('click', x.retry);
      } else if (x === lastSent) st.textContent = readUpto >= x.id ? T.read : T.sent;
    });
  }
  function accepted(cid, m) {
    var x = local[cid];
    x.state = 'sent';
    x.id = m.id;
    seen[m.id] = true;
    after = Math.max(after, m.id);
    var t = x.node.querySelector('time');
    if (t) t.textContent = when(m.at);
    refreshStatus();
  }
  function post(cid, attempt) {
    var x = local[cid];
    x.state = 'sending';
    refreshStatus();
    attempt().then(function (r) {
      if (r.ok) { accepted(cid, r.data.message); return; }
      x.state = 'failed';
      refreshStatus();
      if (r.status) showErr(ui.err, ERR[r.data.error] || T.generic);
      if (r.status === 401) reset();
    });
  }
  function sendText() {
    var text = ui.input.value.trim();
    if (!text) return;
    ui.input.value = '';
    showErr(ui.err, '');
    var cid = uid(), attempt = function () { return call('POST', '/messages', { body: text, client_id: cid }); };
    local[cid] = { node: bubble({ body: text }, true), state: 'sending', retry: function () { post(cid, attempt); } };
    scrollEnd();
    post(cid, attempt);
  }
  function sendFile(file) {
    showErr(ui.err, '');
    if (file.size > MAX_FILE) return showErr(ui.err, T.tooBig);
    var cid = uid(), attempt = function () {
      var fd = new FormData();
      fd.append('file', file);
      fd.append('client_id', cid);
      return call('POST', '/upload', fd);
    };
    local[cid] = { node: bubble({ body: file.name }, true), state: 'sending', retry: function () { post(cid, attempt); } };
    scrollEnd();
    post(cid, attempt);
  }
  function submitStart(e) {
    e.preventDefault();
    showErr(ui.fErr, '');
    var name = ui.fName.value.trim(), email = ui.fEmail.value.trim(), phone = ui.fPhone.value.trim(), text = ui.fMessage.value.trim();
    var bad = name.length < 2 ? T.errName : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? T.errEmail : !ui.fSubject.value ? T.errSubject : !text ? T.errMessage : '';
    if (bad) return showErr(ui.fErr, bad);
    var data = document.getElementById('booking-data'), item = null;
    try { if (data) item = JSON.parse(data.textContent).id || null; } catch (x) { item = null; }
    var cid = uid();
    ui.fSubmit.disabled = true;
    call('POST', '/start', { name: name, email: email, phone: phone, subject: ui.fSubject.value, message: text, lang: lang, page: location.pathname, item: item, client_id: cid, website: ui.fHp.value }).then(function (r) {
      ui.fSubmit.disabled = false;
      if (!r.ok && r.status !== 409) return showErr(ui.fErr, ERR[r.data.error] || T.generic);
      hasSession = true;
      store('sessionStorage', CACHE, null);
      if (r.ok) {
        state = r.data.state;
        local[cid] = { node: bubble(r.data.message, true), state: 'sent' };
        accepted(cid, r.data.message);
      }
      ui.fMessage.value = '';
      paint();
      scrollEnd();
      ui.input.focus({ preventScroll: true });
      schedule(0);
    });
  }
  function reset() {
    hasSession = false;
    after = readUpto = unread = 0;
    seen = {};
    local = {};
    status = 'open';
    clearTimeout(timer);
    ui.log.textContent = '';
    showErr(ui.err, '');
    paint();
  }
  function endChat() {
    if (!window.confirm(T.endAsk)) return;
    call('POST', '/end', {}).then(reset);
  }

  /* ── Consulta periódica ──────────────────────────────── */
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(poll, ms);
  }
  function nextDelay() {
    if (fails) return Math.min(30000, 3000 * Math.pow(2, fails - 1));
    if (document.hidden) return 60000;
    return isOpen ? 3000 : 20000;
  }
  function poll() {
    if (!hasSession) return;
    var reading = isOpen && !document.hidden;
    call('GET', '/poll?after=' + after + (reading ? '&open=1' : '')).then(function (r) {
      if (r.status === 401) return reset();
      if (!r.ok) {
        fails++;
        ui.net.hidden = false;
        return schedule(nextDelay());
      }
      fails = 0;
      ui.net.hidden = true;
      var d = r.data, fresh = false;
      d.messages.forEach(function (m) {
        after = Math.max(after, m.id);
        if (seen[m.id]) return;
        seen[m.id] = true;
        if (m.cid && local[m.cid]) return accepted(m.cid, m);
        if (m.from === 'visitor') {
          var cid = m.cid || 'old' + m.id;
          local[cid] = { node: bubble(m, true), state: 'sent', id: m.id };
          return;
        }
        bubble(m, false);
        fresh = true;
      });
      state = d.state;
      status = d.status;
      readUpto = d.read_upto;
      unread = reading ? 0 : d.unread;
      ui.typing.hidden = !d.typing;
      refreshStatus();
      paint();
      if (fresh || d.typing) scrollEnd();
      if (fresh && !reading) ui.btn.classList.add('is-new');
      schedule(nextDelay());
    });
  }

  /* ── Arranque ────────────────────────────────────────── */
  function ready(d) {
    if (!d || !d.enabled) return;
    state = d.state;
    hasSession = !!d.session;
    unread = d.unread || 0;
    build();
    paint();
    /* Só entra na página com o estilo carregado, para nunca aparecer sem formatação */
    var l = el('link');
    l.rel = 'stylesheet';
    l.href = script.dataset.css;
    l.onload = function () {
      document.body.appendChild(ui.root);
      if (hasSession) schedule(0);
      if (store('sessionStorage', OPEN) === '1') toggle(true);
    };
    document.head.appendChild(l);
  }
  var cached = null;
  try { cached = JSON.parse(store('sessionStorage', CACHE) || 'null'); } catch (e) { cached = null; }
  if (cached && Date.now() - cached.at < 60000) return ready(cached.data);
  call('GET', '/status').then(function (r) {
    if (!r.ok) return;
    if (!r.data.session) store('sessionStorage', CACHE, JSON.stringify({ at: Date.now(), data: r.data }));
    ready(r.data);
  });
})();
