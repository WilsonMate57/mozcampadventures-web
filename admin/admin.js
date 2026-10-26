/**
 * MOZ CAMP ADVENTURES — painel de administração (admin.js)
 * =====================================================
 * Aplicação de página única (rotas por #hash) sobre /api/admin/*.
 * A segurança é garantida no servidor (sessão, permissões, CSRF);
 * aqui só se escondem as secções a que o utilizador não tem acesso.
 * =====================================================
 */
(function () {
  'use strict';

  var S = { me: null, csrf: '', catalog: null, seq: 0 };   // seq: número da navegação actual
  var view = document.getElementById('view');

  /* ── Utilitários ───────────────────────────────────── */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function can(p) { return !!S.me && (S.me.permissions.indexOf('*') !== -1 || S.me.permissions.indexOf(p) !== -1); }
  function mzn(n, dec) { return Number(n || 0).toLocaleString('pt-PT', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 }).replace(/ |\s/g, '.') + ' MZN'; }
  function date(d) { return d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-PT') : '—'; }
  function dt(d) { return d ? new Date(d).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—'; }
  function badge(s) { return '<span class="badge badge--' + esc(s) + '">' + esc(LABEL[s] || s) + '</span>'; }
  var LABEL = { pedido: 'Pedido', confirmada: 'Confirmada', concluida: 'Concluída', cancelada: 'Cancelada', rascunho: 'Rascunho', emitida: 'Emitida', anulada: 'Anulada', pendente: 'Pendente', aprovada: 'Aprovada', rejeitada: 'Rejeitada', novo: 'Nova', respondido: 'Respondida', arquivado: 'Arquivada', site: 'Site', whatsapp: 'WhatsApp', email: 'E-mail', manual: 'Manual', FT: 'Factura', PF: 'Pró-forma',
    parcial: 'Parcialmente pago', pago: 'Pago', reembolsado: 'Reembolsado', sem_factura: 'Sem factura', declarado: 'Declarado pelo cliente', em_verificacao: 'Em verificação',
    confirmado: 'Confirmado', recusado: 'Recusado', revertido: 'Revertido', payment: 'Pagamento', refund: 'Reembolso', painel: 'Painel', cliente: 'Cliente' };
  var ERR = {
    invalid_credentials: 'E-mail ou palavra-passe incorrectos.', too_many_requests: 'Demasiadas tentativas. Aguarde 15 minutos.', weak_password: 'A palavra-passe deve ter pelo menos 10 caracteres, com letras e números.',
    invalid_or_expired_token: 'O link expirou ou já foi usado. Peça um novo ao administrador.', forbidden: 'Não tem permissão para esta acção.', csrf_invalid: 'Sessão inválida. Recarregue a página.',
    invalid_transition: 'Esta mudança de estado não é permitida.', cancel_reason_required: 'Indique o motivo do cancelamento.', void_reason_required: 'Indique o motivo da anulação (mín. 5 caracteres).',
    not_draft: 'Esta factura já foi emitida e não pode ser alterada.', empty_invoice: 'A factura não tem linhas ou o total é zero.', negative_total: 'O total não pode ser negativo.', invalid_line: 'Há uma linha inválida (descrição, quantidade ou preço).',
    invalid_customer_nuit: 'O NUIT do cliente deve ter 9 dígitos.', invalid_customer_email: 'E-mail do cliente inválido.', customer_email_missing: 'O cliente não tem e-mail. Edite a factura antes de emitir, ou envie por outro canal.',
    booking_cancelled: 'Reserva cancelada: não pode ser facturada.', company_nuit_missing: 'Defina o NUIT da empresa nas Definições.', last_admin: 'Tem de existir pelo menos um administrador activo.', email_exists: 'Já existe um utilizador com este e-mail.',
    system_role_locked: 'O perfil Administrador não pode ser alterado.', min_people: 'Abaixo do mínimo de participantes.', min_nights: 'Abaixo do número mínimo de noites.', capacity: 'Acima da capacidade.', invalid_nuit: 'O NUIT deve ter 9 dígitos.',
    exceeds_balance: 'O valor excede o saldo em dívida.', duplicate_payment: 'Esta transacção (método + referência) já está registada.', invoice_has_payments: 'A factura tem pagamentos: reverta, reembolse ou decida-os antes de anular.',
    refund_exceeds_paid: 'O reembolso excede o valor efectivamente pago.', payments_only_on_ft: 'Pagamentos só em facturas FT emitidas.', reason_required: 'Indique o motivo.', payment_not_pending: 'Este pagamento já foi decidido.',
    payment_not_confirmed: 'Só pagamentos confirmados podem ser revertidos.', refunds_exceed_payments: 'Há reembolsos que deixariam o pago negativo.', invalid_method: 'Método de pagamento inválido.', invalid_paid_on: 'Data de pagamento inválida (não pode ser no futuro).',
    invalid_amount: 'Valor inválido.', invoice_not_payable: 'A factura não está emitida.', not_resendable: 'Este registo é anterior à Fase 7 e não guarda o conteúdo para reenvio.',
    date_out_of_range: 'Data inválida (tem de ser a partir de hoje).', invalid_phone: 'Telefone inválido.', invalid_name: 'Nome inválido.', invalid_email: 'E-mail inválido.', pdf_integrity_error: 'O ficheiro PDF não corresponde ao original. Contacte o administrador.'
  };
  /* Resultado real do e-mail ao cliente (nunca se diz «enviado» se não foi) */
  var MAIL = { sent: 'E-mail enviado ao cliente.', logged: 'E-mail registado (modo de teste, não enviado).', failed: 'ATENÇÃO: o e-mail ao cliente FALHOU — veja «E-mails» e reenvie.', no_email: 'O cliente não tem e-mail: avise-o por WhatsApp.', disabled: 'Notificação desligada nas Definições.' };
  function withMail(msg, r) { var m = r && r.data && MAIL[r.data.email]; return { text: m ? msg + ' ' + m : msg, err: r && r.data && r.data.email === 'failed' }; }
  function toastMail(msg, r) { var x = withMail(msg, r); toast(x.text, x.err); }
  var NOTIF = { booking_received: 'Pedido de reserva recebido', booking_confirmed: 'Reserva confirmada', booking_cancelled: 'Reserva cancelada', booking_completed: 'Actividade concluída (convite para avaliar)', payment_confirmed: 'Pagamento recebido (com recibo)', payment_refused: 'Comprovativo recusado', payment_reversed: 'Pagamento revertido', refund: 'Reembolso efectuado', invoice_voided: 'Factura anulada' };
  var KIND = { booking_client: 'Pedido recebido (cliente)', booking_team: 'Novo pedido (equipa)', contact_team: 'Mensagem de contacto (equipa)', invoice: 'Factura enviada', proof_team: 'Comprovativo recebido (equipa)', user_invite: 'Convite ao painel', user_reset: 'Repor palavra-passe' };
  var NOTIFY_BOX = '<label class="check"><input type="checkbox" name="notify" checked> Notificar o cliente por e-mail</label>';

  function errMsg(r) { var e = (r && r.data && r.data.error) || 'server_error'; return ERR[e] || ('Erro: ' + e); }

  function toast(msg, isErr) {
    var t = $('[data-toast]');
    t.textContent = msg; t.className = 'toast' + (isErr ? ' toast--err' : ''); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 4500);
  }

  function api(method, path, body) {
    var h = { Accept: 'application/json' };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (method !== 'GET') h['X-CSRF-Token'] = S.csrf;
    var seq = S.seq;
    return fetch('/api/admin' + path, { method: method, headers: h, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
      .catch(function () { return { ok: false, status: 0, data: { error: 'network' } }; })
      .then(function (r) {
        if (r.status === 401 && path !== '/login' && path !== '/me') { S.me = null; showAuth('login'); }
        /* Resposta de leitura de uma página que já foi abandonada: descartar (não desenha por cima da nova) */
        if (method === 'GET' && seq !== S.seq) return new Promise(function () {});
        return r;
      });
  }

  /* Diálogo genérico: devolve uma Promise com os valores do formulário ou null */
  function dialog(title, bodyHtml, okLabel, danger) {
    var d = $('[data-dialog]');
    d.innerHTML = '<form method="dialog"><div class="dlg__head"><h2>' + esc(title) + '</h2><button class="icon-btn" value="cancel" aria-label="Fechar"><i class="bx bx-x"></i></button></div>' +
      '<div class="dlg__body">' + bodyHtml + '</div><div class="dlg__foot"><button class="btn btn--ghost" value="cancel">Cancelar</button><button class="btn ' + (danger ? 'btn--danger' : '') + '" value="ok">' + esc(okLabel || 'Confirmar') + '</button></div></form>';
    d.showModal();
    return new Promise(function (resolve) {
      d.addEventListener('close', function onClose() {
        d.removeEventListener('close', onClose);
        if (d.returnValue !== 'ok') return resolve(null);
        var out = {};
        $$('[name]', d).forEach(function (el) { out[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
        resolve(out);
      });
    });
  }

  /* ── Autenticação ──────────────────────────────────── */
  function showAuth(kind, token) {
    $('[data-app]').hidden = true;
    var box = $('[data-auth]');
    box.hidden = false;
    var isSetup = kind === 'setup';
    box.innerHTML = '<form class="auth__card" novalidate><img src="/assets/images/logo/logo_moz_camp_adventures.webp" alt="Moz Camp Adventures">' +
      '<h1>' + (isSetup ? 'Definir palavra-passe' : 'Entrar no painel') + '</h1>' +
      (isSetup ? '<p>Mínimo 10 caracteres, com letras e números.</p>' : '') +
      (isSetup ? '' : '<div class="field"><label for="a-email">E-mail</label><input id="a-email" name="email" type="email" autocomplete="username" required></div>') +
      '<div class="field"><label for="a-pass">Palavra-passe</label><input id="a-pass" name="password" type="password" autocomplete="' + (isSetup ? 'new-password' : 'current-password') + '" required></div>' +
      (isSetup ? '<div class="field"><label for="a-pass2">Repetir palavra-passe</label><input id="a-pass2" name="password2" type="password" autocomplete="new-password" required></div>' : '') +
      '<p class="error" data-err role="alert"></p><button class="btn btn--primary" type="submit">' + (isSetup ? 'Guardar' : 'Entrar') + '</button></form>';
    var f = $('form', box);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('[data-err]', f), btn = $('button', f);
      err.textContent = '';
      if (isSetup && f.password.value !== f.password2.value) { err.textContent = 'As palavras-passe não coincidem.'; return; }
      btn.disabled = true;
      var req = isSetup ? api('POST', '/setup-password', { token: token, password: f.password.value }) : api('POST', '/login', { email: f.email.value.trim(), password: f.password.value });
      req.then(function (r) {
        btn.disabled = false;
        if (!r.ok) { err.textContent = errMsg(r); return; }
        if (isSetup) { toast('Palavra-passe definida. Pode entrar.'); location.hash = '#/'; showAuth('login'); return; }
        start(r.data);
      });
    });
    var first = $('input', f); if (first) first.focus();
  }

  function start(me) {
    S.me = me.user; S.csrf = me.csrf;
    $('[data-auth]').hidden = true;
    $('[data-app]').hidden = false;
    var nav = [
      ['#/', 'bx-grid-alt', 'Resumo', 'dashboard.view'], ['#/reservas', 'bx-calendar-check', 'Reservas', 'bookings.view'],
      ['#/facturas', 'bx-receipt', 'Facturas', 'invoices.view'], ['#/pagamentos', 'bx-wallet', 'Pagamentos', 'payments.view'], ['#/avaliacoes', 'bx-star', 'Avaliações', 'reviews.moderate'],
      ['#/mensagens', 'bx-envelope', 'Mensagens', 'messages.view'], ['#/emails', 'bx-mail-send', 'E-mails enviados', 'emails.manage'], ['#/utilizadores', 'bx-group', 'Utilizadores e perfis', 'users.manage'],
      ['#/definicoes', 'bx-cog', 'Definições', 'settings.manage'], ['#/auditoria', 'bx-history', 'Auditoria', 'audit.view']
    ];
    $('[data-nav]').innerHTML = nav.filter(function (n) { return can(n[3]); }).map(function (n) { return '<a href="' + n[0] + '"><i class="bx ' + n[1] + '"></i>' + n[2] + '</a>'; }).join('');
    $('[data-user]').innerHTML = '<strong>' + esc(S.me.name) + '</strong>' + esc(S.me.role) + '<br><button type="button" data-logout>Sair</button>';
    $('[data-logout]').addEventListener('click', function () { api('POST', '/logout').then(function () { S.me = null; showAuth('login'); }); });
    route();
  }

  /* ── Router ────────────────────────────────────────── */
  var ROUTES = [
    [/^#\/?$/, dashboard, 'Resumo'], [/^#\/reservas$/, bookings, 'Reservas'], [/^#\/reservas\/(MCA-\d{4}-\d+)$/, booking, 'Reserva'],
    [/^#\/facturas$/, invoices, 'Facturas'], [/^#\/facturas\/(\d+)$/, invoice, 'Factura'], [/^#\/pagamentos$/, payments, 'Pagamentos'], [/^#\/avaliacoes$/, reviews, 'Avaliações'],
    [/^#\/mensagens$/, messages, 'Mensagens'], [/^#\/emails$/, emails, 'E-mails enviados'], [/^#\/utilizadores$/, users, 'Utilizadores e perfis'], [/^#\/definicoes$/, settings, 'Definições'], [/^#\/auditoria$/, audit, 'Auditoria']
  ];
  function route() {
    var h = location.hash || '#/';
    if (h.indexOf('#/definir-senha') === 0) { showAuth('setup', new URLSearchParams(h.split('?')[1] || '').get('token')); return; }
    if (!S.me) return;
    S.seq++;
    var path = h.split('?')[0];
    $$('[data-nav] a').forEach(function (a) { a.toggleAttribute('aria-current', a.getAttribute('href') === path || (path.indexOf(a.getAttribute('href')) === 0 && a.getAttribute('href') !== '#/')); if (a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'page'); });
    $('[data-side]').dataset.open = 'false';
    for (var i = 0; i < ROUTES.length; i++) {
      var m = path.match(ROUTES[i][0]);
      if (m) { $('[data-title]').textContent = ROUTES[i][2]; view.innerHTML = '<p class="muted">A carregar…</p>'; ROUTES[i][1](m); view.focus({ preventScroll: true }); return; }
    }
    view.innerHTML = '<p class="empty">Página não encontrada.</p>';
  }
  window.addEventListener('hashchange', route);
  $('[data-menu]').addEventListener('click', function () { var s = $('[data-side]'); s.dataset.open = s.dataset.open === 'true' ? 'false' : 'true'; });
  view.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a,button,input,select')) location.hash = tr.dataset.href; });

  function denied(perm) { view.innerHTML = '<p class="empty">Sem permissão (' + esc(perm) + ').</p>'; }

  /* ── Resumo ────────────────────────────────────────── */
  function dashboard() {
    if (!can('dashboard.view')) { location.hash = can('bookings.view') ? '#/reservas' : '#/facturas'; return; }
    api('GET', '/dashboard').then(function (r) {
      if (!r.ok) return toast(errMsg(r), true);
      var d = r.data;
      view.innerHTML = '<div class="kpis">' +
        kpi('#/reservas?status=pedido', 'Pedidos por confirmar', d.bookings_pending, '', d.bookings_pending ? 'kpi--warn' : '') +
        kpi('#/reservas?status=confirmada', 'Confirmadas a realizar', d.bookings_confirmed_upcoming) +
        kpi('#/facturas', 'Facturado este mês (FT)', mzn(d.invoiced_month), d.invoices_issued_month + ' facturas emitidas') +
        kpi('#/facturas', 'Facturado no ano (FT)', mzn(d.invoiced_year)) +
        (d.received_month !== undefined
          ? kpi('#/pagamentos', 'Recebido este mês', mzn(d.received_month), 'No ano: ' + mzn(d.received_year)) +
            kpi('#/facturas?pay=pendente', 'Em dívida (FT emitidas)', mzn(d.outstanding), (d.invoices_by_status.parcial || 0) + ' parciais · ' + (d.invoices_by_status.pendente || 0) + ' por pagar') +
            kpi('#/pagamentos', 'Pagamentos por verificar', d.payments_awaiting, '', d.payments_awaiting ? 'kpi--warn' : '')
          : '') +
        kpi('#/facturas', 'Rascunhos de factura', d.invoices_draft) +
        kpi('#/mensagens', 'Mensagens novas', d.messages_new, '', d.messages_new ? 'kpi--warn' : '') +
        (d.emails_failed !== null && d.emails_failed !== undefined ? kpi('#/emails', 'E-mails falhados (7 dias)', d.emails_failed, d.emails_failed ? 'Por reenviar' : 'Sem falhas', d.emails_failed ? 'kpi--warn' : '') : '') +
        kpi('#/avaliacoes', 'Avaliações por moderar', d.reviews_pending, '', d.reviews_pending ? 'kpi--warn' : '') +
        '</div><div class="grid grid--3"><section class="card"><h2>Pedidos recentes</h2>' + bookingTable(d.recent, true) + '</section>' +
        '<section class="card"><h2>Próximos 14 dias (confirmadas)</h2>' + (d.upcoming.length ? '<ul class="timeline">' + d.upcoming.map(function (b) {
          return '<li><time>' + date(b.date) + ' · ' + b.pax + ' pax</time><a href="#/reservas/' + esc(b.reference) + '">' + esc(b.item_name) + '</a><br><span class="muted">' + esc(b.customer_name) + '</span></li>';
        }).join('') + '</ul>' : '<p class="muted">Nada agendado.</p>') + '</section></div>' +
        '<p class="muted" style="margin-top:16px">«Facturado» é o total das facturas emitidas e não anuladas. «Recebido» conta apenas pagamentos <strong>confirmados</strong>, menos reembolsos.</p>';
    });
  }
  function kpi(href, label, value, sub, cls) {
    var tag = href ? 'a href="' + href + '"' : 'div';
    return '<' + tag + ' class="kpi ' + (cls || '') + '"><small>' + esc(label) + '</small><strong>' + esc(value) + '</strong>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</' + (href ? 'a' : 'div') + '>';
  }

  /* ── Reservas ──────────────────────────────────────── */
  function bookingTable(list, compact) {
    if (!list.length) return '<p class="empty">Sem reservas.</p>';
    return '<div class="table-wrap"><table><thead><tr><th>Referência</th><th>Experiência</th><th>Cliente</th><th>Data</th>' + (compact ? '' : '<th class="num">Pax</th><th>Canal</th>') + '<th class="num">Total</th><th>Estado</th>' + (compact ? '' : '<th class="num">Fact.</th>') + '</tr></thead><tbody>' +
      list.map(function (b) {
        return '<tr data-href="#/reservas/' + esc(b.reference) + '"><td class="mono">' + esc(b.reference) + '</td><td>' + esc(b.item_name) + '</td><td>' + esc(b.customer_name) + (b.customer_phone && !compact ? '<br><span class="muted">' + esc(b.customer_phone) + '</span>' : '') + '</td><td>' + date(b.date) + '</td>' +
          (compact ? '' : '<td class="num">' + esc(b.pax) + '</td><td>' + esc(LABEL[b.channel] || b.channel) + '</td>') +
          '<td class="num">' + (b.total_to_confirm ? '<span class="muted">a confirmar</span>' : mzn(b.total_estimate)) + '</td><td>' + badge(b.status) + '</td>' + (compact ? '' : '<td class="num">' + esc(b.invoices) + '</td>') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function bookings() {
    if (!can('bookings.view')) return denied('bookings.view');
    var params = new URLSearchParams((location.hash.split('?')[1]) || '');
    var st = params.get('status') || '', q = params.get('q') || '';
    view.innerHTML = '<div class="toolbar"><input type="search" placeholder="Referência, cliente, telefone, e-mail ou experiência" data-q value="' + esc(q) + '" aria-label="Pesquisar reservas">' +
      '<div class="chips">' + ['', 'pedido', 'confirmada', 'concluida', 'cancelada'].map(function (s) { return '<button class="chip" data-st="' + s + '" aria-pressed="' + (s === st) + '">' + (s ? LABEL[s] : 'Todas') + '</button>'; }).join('') + '</div>' +
      (can('bookings.create') ? '<button class="btn btn--primary" data-new><i class="bx bx-plus"></i> Novo pedido</button>' : '') + '</div><div data-list></div>';
    function load() {
      api('GET', '/bookings?status=' + encodeURIComponent(st) + '&q=' + encodeURIComponent(q)).then(function (r) {
        $('[data-list]').innerHTML = r.ok ? bookingTable(r.data.bookings) : '<p class="error">' + esc(errMsg(r)) + '</p>';
      });
    }
    var t;
    $('[data-q]').addEventListener('input', function (e) { clearTimeout(t); t = setTimeout(function () { q = e.target.value.trim(); load(); }, 250); });
    $$('[data-st]').forEach(function (b) { b.addEventListener('click', function () { st = b.dataset.st; $$('[data-st]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); load(); }); });
    var nb = $('[data-new]'); if (nb) nb.addEventListener('click', newBooking);
    load();
  }

  function newBooking() {
    (S.catalog ? Promise.resolve(S.catalog) : api('GET', '/catalog').then(function (r) { return (S.catalog = r.data.items); })).then(function (items) {
      var opts = items.map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.name) + (i.kind === 'stay' ? ' (alojamento)' : '') + '</option>'; }).join('');
      dialog('Novo pedido (WhatsApp, telefone, e-mail)',
        '<div class="field"><label>Experiência</label><select name="item" data-item>' + opts + '</select></div>' +
        '<div class="form-grid form-grid--2"><div class="field" data-tour><label>Data</label><input type="date" name="date"></div><div class="field" data-stay hidden><label>Entrada</label><input type="date" name="checkin"></div><div class="field" data-stay hidden><label>Saída</label><input type="date" name="checkout"></div></div>' +
        '<div class="form-grid form-grid--3"><div class="field"><label>Adultos</label><input type="number" name="adults" min="1" value="1"></div><div class="field"><label>Crianças</label><input type="number" name="children" min="0" value="0"></div><div class="field"><label>Canal</label><select name="channel"><option value="whatsapp">WhatsApp</option><option value="manual">Telefone / presencial</option><option value="email">E-mail</option></select></div></div>' +
        '<div class="field" data-boatwrap hidden><label>Barco</label><select name="boat" data-boat></select></div>' +
        '<div class="form-grid form-grid--2"><div class="field"><label>Nome do cliente</label><input name="name" required></div><div class="field"><label>Telefone</label><input name="phone" required></div></div>' +
        '<div class="field"><label>E-mail (opcional)</label><input type="email" name="email"></div><p class="muted">O preço é calculado pelo sistema com as tarifas publicadas.</p>', 'Registar pedido');
      var d = $('[data-dialog]');
      function sync() {
        var it = items.filter(function (i) { return i.id === $('[data-item]', d).value; })[0];
        $$('[data-tour]', d).forEach(function (x) { x.hidden = it.kind === 'stay'; });
        $$('[data-stay]', d).forEach(function (x) { x.hidden = it.kind !== 'stay'; });
        $('[data-boatwrap]', d).hidden = !it.boats.length;
        $('[data-boat]', d).innerHTML = '<option value="">Sem barco privado</option>' + it.boats.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(b.title) + '</option>'; }).join('');
      }
      $('[data-item]', d).addEventListener('change', sync); sync();
      d.addEventListener('close', function onClose() {
        d.removeEventListener('close', onClose);
        if (d.returnValue !== 'ok') return;
        var v = {}; $$('[name]', d).forEach(function (el) { v[el.name] = el.value; });
        v.adults = +v.adults; v.children = +v.children; if (!v.boat) delete v.boat;
        api('POST', '/bookings', v).then(function (r) {
          if (!r.ok) return toast(errMsg(r) + (r.data.min ? ' (mínimo ' + r.data.min + ')' : ''), true);
          toast('Pedido ' + r.data.reference + ' registado.'); location.hash = '#/reservas/' + r.data.reference;
        });
      });
    });
  }

  function booking(m) {
    if (!can('bookings.view')) return denied('bookings.view');
    api('GET', '/bookings/' + m[1]).then(function (r) {
      if (!r.ok) { view.innerHTML = '<p class="error">' + esc(errMsg(r)) + '</p>'; return; }
      var b = r.data.booking;
      var when = b.service_date ? date(b.service_date) : date(b.checkin) + ' → ' + date(b.checkout) + ' (' + b.nights + ' noites)';
      var wa = 'https://wa.me/' + String(b.customer_phone).replace(/\D/g, '') + '?text=' + encodeURIComponent('Olá ' + b.customer_name + ', sobre o seu pedido ' + b.reference + ' (' + b.item_name + '): ');
      view.innerHTML = '<div class="row row--between" style="margin-bottom:16px"><div><h2 class="mono" style="font-size:22px">' + esc(b.reference) + '</h2><span class="muted">' + esc(b.item_name) + '</span></div><div class="row">' + badge(b.status) +
        (can('bookings.manage') ? b.next_status.map(function (s) { return '<button class="btn btn--sm ' + (s === 'cancelada' ? 'btn--danger' : '') + '" data-to="' + s + '">' + ({ confirmada: 'Confirmar', concluida: 'Marcar concluída', cancelada: 'Cancelar', pedido: 'Reabrir' })[s] + '</button>'; }).join('') : '') + '</div></div>' +
        '<div class="grid grid--3"><div class="stack">' +
        '<section class="card"><h2>Pedido</h2><dl class="dl"><dt>Data</dt><dd>' + when + '</dd><dt>Participantes</dt><dd>' + b.adults + ' adultos' + (b.children ? ', ' + b.children + ' crianças' : '') + '</dd><dt>Canal</dt><dd>' + esc(LABEL[b.channel]) + ' · ' + esc(b.lang.toUpperCase()) + '</dd><dt>Registado</dt><dd>' + dt(b.created_at) + '</dd></dl>' +
        '<div class="table-wrap" style="margin-top:14px"><table><tbody>' + b.price_lines.map(function (l) { return '<tr><td>' + esc(l.label) + '</td><td class="num">' + (l.amount === null ? esc(l.note || 'a confirmar') : mzn(l.amount)) + '</td></tr>'; }).join('') +
        '<tr><td><strong>Total estimado</strong></td><td class="num"><strong>' + (b.total_to_confirm ? 'a confirmar' : mzn(b.total_estimate)) + '</strong></td></tr></tbody></table></div></section>' +
        '<section class="card"><div class="row row--between"><h2>Facturas</h2>' + (can('invoices.issue') && b.status !== 'cancelada' ? '<div class="row"><button class="btn btn--sm" data-inv="FT"><i class="bx bx-receipt"></i> Criar factura</button><button class="btn btn--sm btn--ghost" data-inv="PF">Criar pró-forma</button></div>' : '') + '</div>' +
        (b.invoices.length ? '<div class="table-wrap"><table><tbody>' + b.invoices.map(function (i) { return '<tr data-href="#/facturas/' + i.id + '"><td>' + esc(LABEL[i.doc_type]) + '</td><td class="mono">' + esc(i.number || '(rascunho)') + '</td><td>' + date(i.issue_date) + '</td><td class="num">' + mzn(i.total, true) + '</td><td>' + badge(i.status) + (i.pay_status && i.pay_status !== 'anulada' && b.finance ? ' ' + badge(i.pay_status) : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">Ainda sem facturas.</p>') +
        (b.finance ? '<dl class="dl" style="margin-top:14px"><dt>Situação financeira</dt><dd>' + badge(b.finance.status) + ' <span class="muted">(independente do estado da reserva)</span></dd><dt>Facturado (FT)</dt><dd>' + mzn(b.finance.invoiced, true) + '</dd><dt>Pago (confirmado)</dt><dd>' + mzn(b.finance.paid, true) + '</dd><dt>Em dívida</dt><dd><strong>' + mzn(b.finance.balance, true) + '</strong></dd>' + (b.finance.awaiting ? '<dt>Por verificar</dt><dd>' + b.finance.awaiting + ' comprovativo(s)</dd>' : '') + '</dl>' : '') +
        '</section></div>' +
        '<div class="stack"><section class="card"><h2>Cliente</h2><dl class="dl"><dt>Nome</dt><dd>' + esc(b.customer_name) + '</dd><dt>Telefone</dt><dd><a href="tel:' + esc(b.customer_phone) + '">' + esc(b.customer_phone) + '</a></dd><dt>E-mail</dt><dd>' + (b.customer_email ? '<a href="mailto:' + esc(b.customer_email) + '">' + esc(b.customer_email) + '</a>' : '—') + '</dd></dl>' +
        '<p style="margin-top:12px"><a class="btn btn--sm" href="' + wa + '" target="_blank" rel="noopener"><i class="bx bxl-whatsapp"></i> WhatsApp</a>' + (can('bookings.manage') ? ' <button type="button" class="btn btn--sm btn--ghost" data-clientlink><i class="bx bx-user-circle"></i> Área do cliente</button>' : '') + '</p>' + (b.customer_message ? '<p class="note" style="margin-top:10px">' + esc(b.customer_message) + '</p>' : '') + '</section>' +
        '<section class="card"><h2>Histórico</h2><ul class="timeline">' + b.events.map(function (e) {
          var txt = e.type === 'created' ? 'Pedido registado (' + esc(LABEL[e.data.channel] || e.data.channel || 'site') + ')' : e.type === 'status_changed' ? 'Estado: ' + esc(LABEL[e.data.from]) + ' → ' + esc(LABEL[e.data.to]) + (e.data.note ? ' — ' + esc(e.data.note) : '') : e.type === 'note' ? esc(e.data.text) : esc(e.type);
          return '<li><time>' + dt(e.created_at) + ' · ' + esc(e.actor) + '</time>' + txt + '</li>';
        }).join('') + '</ul>' +
        (can('bookings.manage') ? '<form data-note style="margin-top:12px" class="stack"><textarea name="text" rows="2" placeholder="Nota interna" aria-label="Nota interna"></textarea><button class="btn btn--sm btn--ghost">Adicionar nota</button></form>' : '') + '</section></div></div>';

      $$('[data-to]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var to = btn.dataset.to;
          dialog('Mudar estado para «' + LABEL[to] + '»', '<div class="field"><label>Nota' + (to === 'cancelada' ? ' (motivo obrigatório)' : ' (opcional)') + '</label><textarea name="note" rows="3"></textarea></div>' + (to !== 'pedido' ? NOTIFY_BOX : ''), 'Confirmar', to === 'cancelada').then(function (v) {
            if (!v) return;
            api('POST', '/bookings/' + b.reference + '/status', { status: to, note: v.note, notify: !!v.notify }).then(function (r2) { if (!r2.ok) return toast(errMsg(r2), true); toastMail('Estado actualizado.', r2); route(); });
          });
        });
      });
      var cl = $('[data-clientlink]');
      if (cl) cl.addEventListener('click', function () { clientLinkDialog(b, false); });
      var nf = $('[data-note]');
      if (nf) nf.addEventListener('submit', function (e) { e.preventDefault(); api('POST', '/bookings/' + b.reference + '/notes', { text: nf.text.value }).then(function (r2) { if (!r2.ok) return toast(errMsg(r2), true); route(); }); });
      $$('[data-inv]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          api('POST', '/invoices', { booking: b.reference, type: btn.dataset.inv }).then(function (r2) { if (!r2.ok) return toast(errMsg(r2), true); location.hash = '#/facturas/' + r2.data.invoice.id; });
        });
      });
    });
  }

  /* Link da área do cliente (com revogação dos links anteriores) */
  function clientLinkDialog(b, revoke) {
    api('POST', '/bookings/' + b.reference + '/client-link', { revoke: revoke }).then(function (r) {
      if (!r.ok) return toast(errMsg(r), true);
      var phone = String(b.customer_phone || '').replace(/\D/g, '');
      var en = b.lang === 'en';
      var msg = (en ? 'Hello! You can follow booking ' : 'Olá! Pode acompanhar a reserva ') + b.reference + (en ? ' and download your documents here: ' : ' e descarregar os seus documentos aqui: ') + r.data.link;
      dialog('Área do cliente — ' + b.reference,
        (revoke ? '<p class="note note--warn">Os links anteriores foram revogados. Este é o novo link.</p>' : '') +
        '<p class="link-box" data-client-url>' + esc(r.data.link) + '</p><p class="muted">O cliente vê o estado da reserva, as facturas e os recibos, e pode enviar comprovativos. O link é pessoal: revogue-o se tiver sido partilhado por engano.</p>' +
        '<div class="row">' + (phone ? '<a class="btn btn--sm" target="_blank" rel="noopener" href="https://wa.me/' + phone + '?text=' + encodeURIComponent(msg) + '"><i class="bx bxl-whatsapp"></i> Enviar por WhatsApp</a>' : '') +
        (revoke ? '' : '<button type="button" class="btn btn--sm btn--danger" data-revoke>Revogar links anteriores</button>') + '</div>', 'Fechar');
      var rv = $('[data-dialog] [data-revoke]');
      if (rv) rv.addEventListener('click', function () { $('[data-dialog]').close(); clientLinkDialog(b, true); });
    });
  }

  /* ── Facturas ──────────────────────────────────────── */
  function invoices() {
    if (!can('invoices.view')) return denied('invoices.view');
    var f = { status: '', type: '', q: '', from: '', to: '', pay: new URLSearchParams(location.hash.split('?')[1] || '').get('pay') || '' };
    view.innerHTML = '<div class="toolbar"><input type="search" data-f="q" placeholder="Número, referência da reserva ou cliente" aria-label="Pesquisar facturas">' +
      '<select data-f="status" aria-label="Estado"><option value="">Todos os estados</option><option value="rascunho">Rascunho</option><option value="emitida">Emitida</option><option value="anulada">Anulada</option></select>' +
      '<select data-f="type" aria-label="Tipo"><option value="">FT e PF</option><option value="FT">Facturas</option><option value="PF">Pró-forma</option></select>' +
      (can('payments.view') ? '<select data-f="pay" aria-label="Pagamento"><option value="">Qualquer pagamento</option>' + ['pendente', 'parcial', 'pago', 'reembolsado'].map(function (s) { return '<option value="' + s + '"' + (f.pay === s ? ' selected' : '') + '>' + LABEL[s] + '</option>'; }).join('') + '</select>' : '') +
      '<input type="date" data-f="from" aria-label="Desde" style="width:auto"><input type="date" data-f="to" aria-label="Até" style="width:auto"></div><div data-list></div>';
    function load() {
      api('GET', '/invoices?' + new URLSearchParams(f)).then(function (r) {
        if (!r.ok) return ($('[data-list]').innerHTML = '<p class="error">' + esc(errMsg(r)) + '</p>');
        var list = r.data.invoices;
        var showPay = can('payments.view');
        $('[data-list]').innerHTML = list.length ? '<div class="table-wrap"><table><thead><tr><th>Número</th><th>Tipo</th><th>Data</th><th>Cliente</th><th>Reserva</th><th class="num">Total</th><th>Estado</th>' + (showPay ? '<th>Pagamento</th><th class="num">Em dívida</th>' : '') + '</tr></thead><tbody>' +
          list.map(function (i) {
            return '<tr data-href="#/facturas/' + i.id + '"><td class="mono">' + esc(i.number || '(rascunho)') + '</td><td>' + esc(LABEL[i.doc_type]) + '</td><td>' + date(i.issue_date || i.created_at) + '</td><td>' + esc(i.customer) + '</td><td class="mono">' + esc(i.booking_ref) + '</td><td class="num">' + mzn(i.total, true) + '</td><td>' + badge(i.status) + '</td>' +
              (showPay ? '<td>' + (i.pay_status && i.pay_status !== 'anulada' ? badge(i.pay_status) + (+i.awaiting ? ' <span class="badge badge--em_verificacao" title="Pagamentos por verificar">' + i.awaiting + ' por verificar</span>' : '') : '<span class="muted">—</span>') + '</td><td class="num">' + (i.pay_status && i.pay_status !== 'anulada' ? mzn(i.balance, true) : '—') + '</td>' : '') + '</tr>';
          }).join('') +
          '</tbody></table></div>' : '<p class="empty">Sem facturas.</p>';
      });
    }
    var t;
    $$('[data-f]').forEach(function (el) { el.addEventListener(el.type === 'search' ? 'input' : 'change', function () { clearTimeout(t); t = setTimeout(function () { f[el.dataset.f] = el.value; load(); }, 200); }); });
    load();
  }

  function invoice(m) {
    if (!can('invoices.view')) return denied('invoices.view');
    var id = m[1];
    api('GET', '/invoices/' + id).then(function (r) {
      if (!r.ok) { view.innerHTML = '<p class="error">' + esc(errMsg(r)) + '</p>'; return; }
      var inv = r.data.invoice, draft = inv.status === 'rascunho', c = inv.customer || {};
      var head = '<div class="row row--between" style="margin-bottom:16px"><div><h2 style="font-size:22px">' + esc(LABEL[inv.doc_type]) + ' <span class="mono">' + esc(inv.number || '(rascunho)') + '</span></h2><span class="muted">Reserva <a href="#/reservas/' + esc(inv.booking_ref) + '">' + esc(inv.booking_ref) + '</a> · ' + esc(inv.item_name) + '</span></div><div class="row">' + badge(inv.status) + '</div></div>';
      if (draft && can('invoices.issue')) {
        view.innerHTML = head + '<p class="note note--warn">Rascunho: pode ser editado. Depois de emitida, a factura recebe um número e <strong>não pode ser alterada</strong>, só anulada com motivo.</p>' +
          '<form data-draft class="stack" style="margin-top:16px"><section class="card"><h2>Cliente</h2><div class="form-grid form-grid--2">' +
          fld('name', 'Nome / denominação', c.name) + fld('nuit', 'NUIT do cliente (opcional, 9 dígitos)', c.nuit) + fld('email', 'E-mail', c.email, 'email') + fld('phone', 'Telefone', c.phone) + '</div>' + fld('address', 'Morada (opcional)', c.address) + '</section>' +
          '<section class="card"><h2>Linhas</h2><div class="table-wrap"><table class="lines"><thead><tr><th>Descrição</th><th class="col-qty">Qtd.</th><th class="col-price">Preço unit. (MZN)</th><th class="col-amt num">Valor</th><th class="col-x"></th></tr></thead><tbody data-lines></tbody></table></div>' +
          '<div class="row" style="margin-top:10px"><button type="button" class="btn btn--sm btn--ghost" data-add><i class="bx bx-plus"></i> Linha</button><button type="button" class="btn btn--sm btn--ghost" data-disc><i class="bx bx-purchase-tag"></i> Desconto</button></div>' +
          '<div class="totals">Total <strong data-total></strong></div></section>' +
          '<section class="card"><h2>Observações</h2><textarea name="notes" rows="2">' + esc(inv.notes || '') + '</textarea></section>' +
          '<div class="row"><button class="btn" type="submit"><i class="bx bx-save"></i> Guardar rascunho</button><button class="btn btn--primary" type="button" data-issue><i class="bx bx-check-shield"></i> Emitir ' + esc(LABEL[inv.doc_type]) + '</button><button class="btn btn--danger" type="button" data-discard>Descartar rascunho</button></div></form>';
        var tb = $('[data-lines]');
        function addLine(l) {
          var tr = document.createElement('tr');
          tr.innerHTML = '<td><input data-k="description" value="' + esc(l.description || '') + '" aria-label="Descrição"></td><td><input data-k="qty" type="number" step="0.01" min="0.01" value="' + esc(l.qty || 1) + '" aria-label="Quantidade"></td><td><input data-k="unit_price" type="number" step="0.01" value="' + esc(l.unit_price || 0) + '" aria-label="Preço unitário"></td><td class="num" data-amt></td><td><button type="button" class="icon-btn" data-del aria-label="Remover linha"><i class="bx bx-trash"></i></button></td>';
          tb.appendChild(tr); recalc();
        }
        function lines() { return $$('tr', tb).map(function (tr) { return { description: $('[data-k=description]', tr).value.trim(), qty: +$('[data-k=qty]', tr).value, unit_price: +$('[data-k=unit_price]', tr).value }; }); }
        function recalc() { var tot = 0; $$('tr', tb).forEach(function (tr) { var a = (+$('[data-k=qty]', tr).value || 0) * (+$('[data-k=unit_price]', tr).value || 0); tot += a; $('[data-amt]', tr).textContent = mzn(a, true); }); $('[data-total]').textContent = mzn(tot, true); }
        (inv.lines || []).forEach(addLine);
        tb.addEventListener('input', recalc);
        tb.addEventListener('click', function (e) { var d = e.target.closest('[data-del]'); if (d) { d.closest('tr').remove(); recalc(); } });
        $('[data-add]').addEventListener('click', function () { addLine({ description: '', qty: 1, unit_price: 0 }); });
        $('[data-disc]').addEventListener('click', function () { addLine({ description: 'Desconto autorizado', qty: 1, unit_price: -0 }); });
        var form = $('[data-draft]');
        function payload() { return { customer: { name: form.name.value, nuit: form.nuit.value, email: form.email.value, phone: form.phone.value, address: form.address.value }, lines: lines(), notes: form.notes.value }; }
        function save() { return api('POST', '/invoices/' + id + '/draft', payload()); }
        form.addEventListener('submit', function (e) { e.preventDefault(); save().then(function (r2) { if (!r2.ok) return toast(errMsg(r2), true); toast('Rascunho guardado.'); route(); }); });
        $('[data-issue]').addEventListener('click', function () {
          save().then(function (r2) {
            if (!r2.ok) return toast(errMsg(r2), true);
            dialog('Emitir ' + LABEL[inv.doc_type], '<p>Total: <strong>' + mzn(r2.data.invoice.total, true) + '</strong> · Cliente: <strong>' + esc(r2.data.invoice.customer.name) + '</strong></p><p class="note note--warn">Depois de emitida, a factura recebe um número sequencial e não pode ser alterada. Correcções fazem-se por anulação (com motivo) e nova factura.</p>', 'Emitir').then(function (ok) {
              if (!ok) return;
              api('POST', '/invoices/' + id + '/issue').then(function (r3) { if (!r3.ok) return toast(errMsg(r3), true); toast(r3.data.invoice.number + ' emitida.'); route(); });
            });
          });
        });
        $('[data-discard]').addEventListener('click', function () {
          dialog('Descartar rascunho', '<p>O rascunho é apagado. Esta acção fica registada na auditoria.</p>', 'Descartar', true).then(function (ok) {
            if (ok) api('POST', '/invoices/' + id + '/discard').then(function (r3) { if (!r3.ok) return toast(errMsg(r3), true); location.hash = '#/reservas/' + inv.booking_ref; });
          });
        });
        return;
      }
      view.innerHTML = head + (inv.status === 'anulada' ? '<p class="note note--warn" style="margin-bottom:16px">Anulada em ' + dt(inv.voided_at) + ' por ' + esc(inv.voided_by_name) + ': ' + esc(inv.void_reason) + '</p>' : '') +
        '<div class="grid grid--3"><div class="stack"><section class="card"><div class="table-wrap"><table><thead><tr><th>Descrição</th><th class="num">Qtd.</th><th class="num">Preço unit.</th><th class="num">Valor</th></tr></thead><tbody>' +
        (inv.lines || []).map(function (l) { return '<tr><td>' + esc(l.description) + '</td><td class="num">' + esc(l.qty) + '</td><td class="num">' + mzn(l.unit_price, true) + '</td><td class="num">' + mzn(l.amount, true) + '</td></tr>'; }).join('') +
        '</tbody></table></div><div class="totals">Total <strong>' + mzn(inv.total, true) + '</strong></div></section>' +
        (inv.status !== 'rascunho' ? '<div class="row"><a class="btn" href="/api/admin/invoices/' + id + '/pdf" target="_blank" rel="noopener"><i class="bx bxs-file-pdf"></i> Ver PDF</a>' +
          (inv.status === 'emitida' && can('invoices.send') ? '<button class="btn btn--ghost" data-send><i class="bx bx-send"></i> Enviar ao cliente</button>' : '') +
          (inv.status === 'emitida' && can('invoices.void') ? '<button class="btn btn--danger" data-void>Anular</button>' : '') + '</div>' : '') + paymentsCard(inv) + '</div>' +
        '<div class="stack"><section class="card"><h2>Documento</h2><dl class="dl"><dt>Cliente</dt><dd>' + esc(c.name) + (c.nuit ? '<br><span class="muted">NUIT ' + esc(c.nuit) + '</span>' : '') + '</dd><dt>E-mail</dt><dd>' + esc(c.email || '—') + '</dd><dt>Emissão</dt><dd>' + date(inv.issue_date) + (inv.issued_by_name ? ' · ' + esc(inv.issued_by_name) : '') + '</dd><dt>SHA-256</dt><dd class="muted" style="word-break:break-all">' + esc(inv.pdf_sha256 || '—') + '</dd></dl></section>' +
        '<section class="card"><h2>Histórico</h2><ul class="timeline">' + (inv.events || []).map(function (e) {
          var txt = e.type === 'issued' ? 'Emitida' : e.type === 'voided' ? 'Anulada: ' + esc(e.data.reason) : e.type === 'sent' ? 'Enviada para ' + esc(e.data.to) + ' — ' + ({ sent: 'aceite pelo servidor de e-mail', failed: 'FALHOU', logged: 'registada (modo de teste)' })[e.data.status] : esc(e.type);
          return '<li><time>' + dt(e.created_at) + ' · ' + esc(e.user_name || '') + '</time>' + txt + '</li>';
        }).join('') + '</ul></section></div></div>';
      var sb = $('[data-send]');
      if (sb) sb.addEventListener('click', function () {
        sb.disabled = true;
        api('POST', '/invoices/' + id + '/send').then(function (r2) {
          sb.disabled = false;
          if (!r2.ok) return toast(errMsg(r2), true);
          toast(r2.data.status === 'sent' ? 'Enviada para ' + r2.data.to + '.' : r2.data.status === 'logged' ? 'Registada (modo de teste, não enviada).' : 'O envio FALHOU. Veja o registo e tente de novo.', r2.data.status === 'failed');
          route();
        });
      });
      var vb = $('[data-void]');
      if (vb) vb.addEventListener('click', function () {
        dialog('Anular ' + inv.number, '<p class="note note--warn">A anulação é definitiva e fica registada. O documento e o número mantêm-se no histórico.</p><div class="field"><label>Motivo (obrigatório)</label><textarea name="reason" rows="3" required></textarea></div>' + NOTIFY_BOX, 'Anular', true).then(function (v) {
          if (v) api('POST', '/invoices/' + id + '/void', { reason: v.reason, notify: !!v.notify }).then(function (r2) { if (!r2.ok) return toast(errMsg(r2), true); toastMail('Factura anulada.', r2); route(); });
        });
      });
      bindPayments(inv, id);
    });
  }

  /* ── Pagamentos de uma factura ─────────────────────── */
  function paymentsCard(inv) {
    if (!inv.balance) return '';
    var b = inv.balance, open = inv.status === 'emitida';
    var actions = function (p) {
      var out = [];
      if (p.receipt_id) out.push('<a class="btn btn--sm btn--ghost" title="' + esc(p.receipt_number) + '" href="/api/admin/receipts/' + p.receipt_id + '/pdf" target="_blank" rel="noopener"><i class="bx bx-receipt"></i> Recibo' + (p.receipt_status === 'anulado' ? ' (anulado)' : '') + '</a>');
      if (p.has_proof) out.push('<a class="btn btn--sm btn--ghost" href="/api/admin/payments/' + p.id + '/proof" target="_blank" rel="noopener"><i class="bx bx-paperclip"></i> Anexo</a>');
      if ((p.status === 'declarado' || p.status === 'em_verificacao') && can('payments.confirm')) out.push('<button class="btn btn--sm" data-pconfirm="' + p.id + '">Confirmar</button><button class="btn btn--sm btn--danger" data-prefuse="' + p.id + '">Recusar</button>');
      if (p.status === 'confirmado' && p.kind === 'payment' && can('payments.reverse')) out.push('<button class="btn btn--sm btn--danger" data-preverse="' + p.id + '">Reverter</button>');
      return out.join(' ');
    };
    var note = function (p) {
      return [p.notes, p.decision_note ? 'Decisão: ' + p.decision_note + (p.decided_by_name ? ' (' + p.decided_by_name + ')' : '') : '', p.reverse_reason ? 'Revertido: ' + p.reverse_reason + ' (' + (p.reversed_by_name || '') + ')' : ''].filter(Boolean).map(esc).join('<br>');
    };
    return '<section class="card" data-paycard><div class="row row--between"><h2>Pagamentos</h2>' + badge(b.pay_status) + '</div>' +
      '<div class="kpis" style="margin:8px 0 14px"><div class="kpi"><small>Total</small><strong>' + mzn(b.total, true) + '</strong></div><div class="kpi"><small>Pago (confirmado)</small><strong>' + mzn(b.paid, true) + '</strong>' + (b.refunded ? '<span>Reembolsado: ' + mzn(b.refunded, true) + '</span>' : '') + '</div><div class="kpi ' + (b.balance > 0 ? 'kpi--warn' : '') + '"><small>Em dívida</small><strong>' + mzn(b.balance, true) + '</strong>' + (b.awaiting ? '<span>' + b.awaiting + ' por verificar (não contam)</span>' : '') + '</div></div>' +
      (inv.payments.length ? '<div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Método / ref.</th><th class="num">Valor</th><th>Estado</th><th></th></tr></thead><tbody>' + inv.payments.map(function (p) {
        return '<tr><td>' + date(p.paid_on) + '<br><span class="muted">' + esc(LABEL[p.source]) + (p.created_by_name ? ' · ' + esc(p.created_by_name) : '') + '</span></td><td>' + esc(LABEL[p.kind]) + '</td><td>' + esc(p.method) + (p.reference ? '<br><span class="muted">' + esc(p.reference) + '</span>' : '') + '</td>' +
          '<td class="num">' + (p.kind === 'refund' ? '−' : '') + mzn(p.amount, true) + '</td><td>' + badge(p.status) + (note(p) ? '<br><span class="muted">' + note(p) + '</span>' : '') + '</td><td><div class="pay-actions">' + actions(p) + '</div></td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="muted">Sem pagamentos registados.</p>') +
      (open ? '<div class="row" style="margin-top:12px">' +
        (can('payments.record') && b.balance > 0 ? '<button class="btn btn--primary btn--sm" data-paynew><i class="bx bx-plus"></i> Registar pagamento</button><button class="btn btn--ghost btn--sm" data-proofl><i class="bx bx-link"></i> Link para comprovativo</button>' : '') +
        (can('payments.reverse') && b.paid > 0 ? '<button class="btn btn--ghost btn--sm" data-refund><i class="bx bx-undo"></i> Reembolso</button>' : '') + '</div>' : '') +
      '</section>';
  }

  function bindPayments(inv, id) {
    var card = $('[data-paycard]');
    if (!card) return;
    var today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    var methodSel = function () { return '<div class="field"><label>Método</label><select name="method">' + (inv.methods || []).map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select></div>'; };
    var done = function (msg) { return function (r) { if (!r.ok) return toast(errMsg(r) + (r.data.balance !== undefined ? ' (saldo: ' + mzn(r.data.balance, true) + ')' : ''), true); toastMail(msg, r); route(); }; };
    var nb = $('[data-paynew]', card);
    if (nb) nb.addEventListener('click', function () {
      dialog('Registar pagamento — ' + inv.number, methodSel() +
        '<div class="form-grid form-grid--2"><div class="field"><label>Valor (MZN)</label><input name="amount" type="number" step="0.01" min="0.01" value="' + inv.balance.balance + '"></div><div class="field"><label>Data do pagamento</label><input name="paid_on" type="date" max="' + today + '" value="' + today + '"></div></div>' +
        '<div class="field"><label>Referência da transacção / comprovativo</label><input name="reference" maxlength="80"></div><div class="field"><label>Observações internas</label><input name="notes" maxlength="500"></div>' +
        (can('payments.confirm') ? '<label class="check"><input type="checkbox" name="confirm"> Confirmo que os fundos <strong>já entraram</strong> na conta (emite recibo)</label>' + NOTIFY_BOX : '<p class="note">O pagamento fica «em verificação» até alguém com permissão o confirmar.</p>'), 'Registar').then(function (v) {
        if (!v) return;
        api('POST', '/invoices/' + id + '/payments', { method: v.method, amount: v.amount, paid_on: v.paid_on, reference: v.reference, notes: v.notes, confirm: !!v.confirm, notify: !!v.notify }).then(done(v.confirm ? 'Pagamento confirmado e recibo emitido.' : 'Pagamento registado (em verificação).'));
      });
    });
    var rf = $('[data-refund]', card);
    if (rf) rf.addEventListener('click', function () {
      dialog('Reembolso — ' + inv.number, '<p class="note note--warn">Regista dinheiro devolvido ao cliente. Máximo: ' + mzn(inv.balance.paid, true) + '.</p>' + methodSel() +
        '<div class="form-grid form-grid--2"><div class="field"><label>Valor (MZN)</label><input name="amount" type="number" step="0.01" min="0.01"></div><div class="field"><label>Data</label><input name="paid_on" type="date" max="' + today + '" value="' + today + '"></div></div>' +
        '<div class="field"><label>Referência</label><input name="reference" maxlength="80"></div><div class="field"><label>Motivo (obrigatório)</label><input name="notes" maxlength="500"></div>' + NOTIFY_BOX, 'Registar reembolso', true).then(function (v) {
        if (v) api('POST', '/invoices/' + id + '/refunds', v).then(done('Reembolso registado.'));
      });
    });
    var pl = $('[data-proofl]', card);
    if (pl) pl.addEventListener('click', function () {
      api('POST', '/invoices/' + id + '/proof-link').then(function (r) {
        if (!r.ok) return toast(errMsg(r), true);
        var msg = 'Olá! Para enviar o comprovativo de pagamento da factura ' + inv.number + ', use este link: ' + r.data.link;
        var phone = String((inv.customer || {}).phone || '').replace(/\D/g, '');
        dialog('Link para o cliente enviar o comprovativo', '<p class="link-box">' + esc(r.data.link) + '</p><p class="muted">Válido 60 dias. Gerar um novo link invalida o anterior.</p>' +
          (phone ? '<p><a class="btn btn--sm" target="_blank" rel="noopener" href="https://wa.me/' + phone + '?text=' + encodeURIComponent(msg) + '"><i class="bx bxl-whatsapp"></i> Enviar por WhatsApp</a></p>' : ''), 'Fechar');
      });
    });
    $$('[data-pconfirm]', card).forEach(function (btn) {
      btn.addEventListener('click', function () {
        dialog('Confirmar pagamento', '<p class="note note--warn">Confirme apenas depois de verificar a <strong>entrada efectiva dos fundos</strong> (extracto bancário / M-Pesa / e-Mola). É emitido um recibo.</p><div class="field"><label>Nota (ex.: onde foi verificado)</label><input name="note" maxlength="500"></div>' + NOTIFY_BOX + '<p class="muted">O recibo vai em anexo.</p>', 'Confirmar recebimento').then(function (v) {
          if (v) api('POST', '/payments/' + btn.dataset.pconfirm + '/confirm', v).then(done('Pagamento confirmado e recibo emitido.'));
        });
      });
    });
    $$('[data-prefuse]', card).forEach(function (btn) {
      btn.addEventListener('click', function () {
        dialog('Recusar pagamento', '<div class="field"><label>Motivo (obrigatório)</label><input name="note" maxlength="500"></div>' + NOTIFY_BOX + '<p class="muted">Só é enviado quando o comprovativo veio do cliente.</p>', 'Recusar', true).then(function (v) {
          if (v) api('POST', '/payments/' + btn.dataset.prefuse + '/refuse', v).then(done('Pagamento recusado.'));
        });
      });
    });
    $$('[data-preverse]', card).forEach(function (btn) {
      btn.addEventListener('click', function () {
        dialog('Reverter pagamento', '<p class="note note--warn">Use quando um pagamento confirmado não se concretizou (ex.: transferência devolvida). O recibo é anulado e o saldo recalculado. Nada é apagado.</p><div class="field"><label>Motivo (obrigatório)</label><input name="reason" maxlength="500"></div>' + NOTIFY_BOX, 'Reverter', true).then(function (v) {
          if (v) api('POST', '/payments/' + btn.dataset.preverse + '/reverse', v).then(done('Pagamento revertido; recibo anulado.'));
        });
      });
    });
  }

  /* ── Lista de pagamentos ───────────────────────────── */
  function payments() {
    if (!can('payments.view')) return denied('payments.view');
    var st = 'pendentes';
    view.innerHTML = '<div class="toolbar chips">' + [['pendentes', 'Por verificar'], ['confirmado', 'Confirmados'], ['recusado', 'Recusados'], ['revertido', 'Revertidos'], ['', 'Todos']].map(function (s) { return '<button class="chip" data-st="' + s[0] + '" aria-pressed="' + (s[0] === st) + '">' + s[1] + '</button>'; }).join('') + '</div><div data-list></div>';
    function load() {
      api('GET', '/payments?status=' + st).then(function (r) {
        var list = r.data.payments || [];
        $('[data-list]').innerHTML = list.length ? '<div class="table-wrap"><table><thead><tr><th>Registado</th><th>Factura</th><th>Cliente</th><th>Tipo</th><th>Método / ref.</th><th class="num">Valor</th><th>Origem</th><th>Estado</th><th>Recibo</th></tr></thead><tbody>' +
          list.map(function (p) { return '<tr data-href="#/facturas/' + p.invoice_id + '"><td>' + dt(p.created_at) + '</td><td class="mono">' + esc(p.invoice_number) + '</td><td>' + esc(p.customer) + '</td><td>' + esc(LABEL[p.kind]) + '</td><td>' + esc(p.method) + (p.reference ? '<br><span class="muted">' + esc(p.reference) + '</span>' : '') + '</td><td class="num">' + (p.kind === 'refund' ? '−' : '') + mzn(p.amount, true) + '</td><td>' + esc(LABEL[p.source]) + '</td><td>' + badge(p.status) + '</td><td class="mono">' + esc(p.receipt_number || '—') + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : '<p class="empty">Nada aqui.</p>';
      });
    }
    $$('[data-st]').forEach(function (c) { c.addEventListener('click', function () { st = c.dataset.st; $$('[data-st]').forEach(function (x) { x.setAttribute('aria-pressed', x === c); }); load(); }); });
    load();
  }
  function fld(name, label, value, type) { return '<div class="field"><label for="f-' + name + '">' + esc(label) + '</label><input id="f-' + name + '" name="' + name + '" type="' + (type || 'text') + '" value="' + esc(value || '') + '"></div>'; }

  /* ── Avaliações e mensagens ────────────────────────── */
  function reviews() {
    if (!can('reviews.moderate')) return denied('reviews.moderate');
    var st = 'pendente';
    view.innerHTML = '<div class="toolbar chips">' + ['pendente', 'aprovada', 'rejeitada'].map(function (s) { return '<button class="chip" data-st="' + s + '" aria-pressed="' + (s === st) + '">' + LABEL[s] + 's</button>'; }).join('') + '</div><div data-list class="stack"></div>';
    function load() {
      api('GET', '/reviews?status=' + st).then(function (r) {
        var list = r.data.reviews || [];
        $('[data-list]').innerHTML = list.length ? list.map(function (v) {
          return '<article class="card"><div class="row row--between"><strong>' + esc(v.name) + '</strong><span class="muted">' + dt(v.created_at) + '</span></div><p style="color:var(--brand-orange);margin:6px 0">' + '★★★★★'.slice(0, v.rating) + '<span style="color:var(--line-strong)">' + '★★★★★'.slice(v.rating) + '</span></p>' +
            '<p>' + esc(v.body) + '</p><p class="muted">' + esc([v.origin, v.item_id || 'geral', v.lang.toUpperCase()].filter(Boolean).join(' · ')) + (v.moderated_by ? ' · moderada por ' + esc(v.moderated_by) : '') + '</p>' +
            '<div class="row">' + (v.status !== 'aprovada' ? '<button class="btn btn--sm" data-mod="aprovada" data-id="' + v.id + '">Aprovar</button>' : '') + (v.status !== 'rejeitada' ? '<button class="btn btn--sm btn--danger" data-mod="rejeitada" data-id="' + v.id + '">Rejeitar</button>' : '') + '</div></article>';
        }).join('') : '<p class="empty">Nada aqui.</p>';
      });
    }
    $('[data-list]').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mod]');
      if (b) api('POST', '/reviews/' + b.dataset.id, { status: b.dataset.mod }).then(function (r) { if (!r.ok) return toast(errMsg(r), true); toast('Avaliação ' + LABEL[b.dataset.mod].toLowerCase() + '.'); load(); });
    });
    $$('[data-st]').forEach(function (c) {
      c.addEventListener('click', function () { st = c.dataset.st; $$('[data-st]').forEach(function (x) { x.setAttribute('aria-pressed', x === c); }); load(); });
    });
    load();
  }

  function messages() {
    if (!can('messages.view')) return denied('messages.view');
    function load() {
      api('GET', '/messages').then(function (r) {
        var list = r.data.messages || [];
        view.innerHTML = list.length ? '<div class="stack">' + list.map(function (m) {
          return '<article class="card"><div class="row row--between"><div><strong>' + esc(m.subject) + '</strong> ' + badge(m.status) + '<br><span class="muted">' + esc(m.name) + ' · <a href="mailto:' + esc(m.email) + '?subject=' + encodeURIComponent('Re: ' + m.subject) + '">' + esc(m.email) + '</a>' + (m.phone ? ' · ' + esc(m.phone) : '') + '</span></div><span class="muted">' + dt(m.created_at) + '</span></div>' +
            '<p style="white-space:pre-wrap">' + esc(m.message) + '</p><div class="row">' + ['respondido', 'arquivado', 'novo'].filter(function (s) { return s !== m.status; }).map(function (s) { return '<button class="btn btn--sm btn--ghost" data-ms="' + s + '" data-id="' + m.id + '">Marcar ' + LABEL[s].toLowerCase() + '</button>'; }).join('') + '</div></article>';
        }).join('') + '</div>' : '<p class="empty">Sem mensagens.</p>';
        $$('[data-ms]').forEach(function (b) { b.addEventListener('click', function () { api('POST', '/messages/' + b.dataset.id, { status: b.dataset.ms }).then(load); }); });
      });
    }
    load();
  }

  /* ── Registo de e-mails ─────────────────────────────── */
  function emails() {
    if (!can('emails.manage')) return denied('emails.manage');
    var st = 'failed';
    var ST = { sent: 'Enviado', failed: 'Falhou', logged: 'Modo de teste' };
    view.innerHTML = '<div class="toolbar chips">' + [['failed', 'Falhados'], ['sent', 'Enviados'], ['logged', 'Modo de teste'], ['', 'Todos']].map(function (x) { return '<button class="chip" data-st="' + x[0] + '" aria-pressed="' + (x[0] === st) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<p class="muted" style="margin-bottom:12px">«Enviado» significa que o servidor de e-mail aceitou a mensagem; a entrega na caixa do cliente não pode ser garantida.</p><div data-list></div>';
    function load() {
      api('GET', '/emails?status=' + st).then(function (r) {
        var list = r.data.emails || [];
        $('[data-list]').innerHTML = list.length ? '<div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Para</th><th>Assunto</th><th>Estado</th><th></th></tr></thead><tbody>' + list.map(function (e) {
          var cls = e.status === 'failed' ? 'recusado' : e.status === 'sent' ? 'confirmado' : 'rascunho';
          var kind = e.kind.indexOf('notify_') === 0 ? NOTIF[e.kind.slice(7)] : KIND[e.kind];
          return '<tr><td>' + dt(e.created_at) + '</td><td>' + esc(kind || e.kind) + (e.resent_of ? '<br><span class="muted">reenvio de #' + e.resent_of + '</span>' : '') + '</td><td>' + esc(e.to_addr) + '</td><td>' + esc(e.subject) + '</td>' +
            '<td><span class="badge badge--' + cls + '">' + esc(ST[e.status]) + '</span>' + (e.error ? '<br><span class="muted">' + esc(e.error) + '</span>' : '') + (e.resent_ok ? '<br><span class="muted">reenviado com sucesso</span>' : '') + '</td>' +
            '<td>' + (e.status === 'failed' && e.resendable && !e.resent_ok ? '<button class="btn btn--sm" data-resend="' + e.id + '">Reenviar</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Nada aqui.</p>';
      });
    }
    $('[data-list]').addEventListener('click', function (e) {
      var b = e.target.closest('[data-resend]');
      if (!b) return;
      b.disabled = true;
      api('POST', '/emails/' + b.dataset.resend + '/resend').then(function (r) {
        if (!r.ok) { b.disabled = false; return toast(errMsg(r), true); }
        toast(r.data.status === 'failed' ? 'O reenvio também FALHOU. Verifique o endereço ou contacte o cliente por WhatsApp.' : r.data.status === 'logged' ? 'Reenvio registado (modo de teste).' : 'E-mail reenviado.', r.data.status === 'failed');
        load();
      });
    });
    $$('[data-st]').forEach(function (c) { c.addEventListener('click', function () { st = c.dataset.st; $$('[data-st]').forEach(function (x) { x.setAttribute('aria-pressed', x === c); }); load(); }); });
    load();
  }

  /* ── Utilizadores e perfis ─────────────────────────── */
  function users() {
    if (!can('users.manage')) return denied('users.manage');
    api('GET', '/users').then(function (r) {
      if (!r.ok) return toast(errMsg(r), true);
      var d = r.data;
      var roleOpts = function (sel) { return d.roles.map(function (ro) { return '<option value="' + ro.id + '"' + (ro.id === sel ? ' selected' : '') + '>' + esc(ro.name) + '</option>'; }).join(''); };
      view.innerHTML = '<section class="card"><div class="row row--between"><h2>Utilizadores</h2><button class="btn btn--sm btn--primary" data-newuser><i class="bx bx-user-plus"></i> Novo utilizador</button></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Estado</th><th>Último acesso</th><th></th></tr></thead><tbody>' +
        d.users.map(function (u) {
          return '<tr><td><strong>' + esc(u.name) + '</strong>' + (u.has_password ? '' : '<br><span class="muted">aguarda definir palavra-passe</span>') + '</td><td>' + esc(u.email) + '</td><td><select data-role="' + u.id + '" aria-label="Perfil">' + roleOpts(u.role_id) + '</select></td>' +
            '<td><label class="check"><input type="checkbox" data-active="' + u.id + '"' + (u.active ? ' checked' : '') + '> activo</label></td><td>' + dt(u.last_login_at) + '</td><td><button class="btn btn--sm btn--ghost" data-reset="' + u.id + '">Link de acesso</button></td></tr>';
        }).join('') + '</tbody></table></div></section>' +
        '<section class="card" style="margin-top:16px"><div class="row row--between"><h2>Perfis e permissões</h2><button class="btn btn--sm btn--ghost" data-newrole><i class="bx bx-plus"></i> Novo perfil</button></div><div class="stack">' +
        d.roles.map(function (ro) {
          return '<form class="card" data-roleform="' + ro.id + '" style="background:var(--surface-2)"><div class="row row--between"><input name="name" value="' + esc(ro.name) + '" style="max-width:260px" aria-label="Nome do perfil"' + (ro.is_system ? ' disabled' : '') + '>' + (ro.is_system ? '<span class="muted">Todas as permissões (perfil de sistema, não editável)</span>' : '<button class="btn btn--sm">Guardar perfil</button>') + '</div>' +
            (ro.is_system ? '' : '<div class="perm-grid" style="margin-top:10px">' + Object.keys(d.catalog).map(function (p) { return '<label class="check"><input type="checkbox" value="' + p + '"' + (ro.permissions.indexOf(p) !== -1 ? ' checked' : '') + '> ' + esc(d.catalog[p]) + '</label>'; }).join('') + '</div>') + '</form>';
        }).join('') + '</div></section>';

      $$('[data-role]').forEach(function (s) { s.addEventListener('change', function () { api('POST', '/users/' + s.dataset.role, { role_id: +s.value }).then(function (r2) { if (!r2.ok) { toast(errMsg(r2), true); users(); } else toast('Perfil actualizado.'); }); }); });
      $$('[data-active]').forEach(function (c) { c.addEventListener('change', function () { api('POST', '/users/' + c.dataset.active, { active: c.checked }).then(function (r2) { if (!r2.ok) { toast(errMsg(r2), true); users(); } else toast(c.checked ? 'Utilizador activado.' : 'Utilizador desactivado (sessões terminadas).'); }); }); });
      $$('[data-reset]').forEach(function (b) { b.addEventListener('click', function () { api('POST', '/users/' + b.dataset.reset + '/reset').then(showLink); }); });
      $$('[data-roleform]').forEach(function (f) {
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          var perms = $$('input[type=checkbox]:checked', f).map(function (c) { return c.value; });
          api('POST', '/roles/' + f.dataset.roleform, { name: f.name.value, permissions: perms }).then(function (r2) { if (!r2.ok) return toast(errMsg(r2), true); toast('Perfil guardado. Aplica-se de imediato.'); users(); });
        });
      });
      $('[data-newuser]').addEventListener('click', function () {
        dialog('Novo utilizador', fld('name', 'Nome', '') + fld('email', 'E-mail', '', 'email') + '<div class="field"><label>Perfil</label><select name="role_id">' + roleOpts(0) + '</select></div><p class="muted">O utilizador recebe por e-mail um link (válido 48 h) para definir a palavra-passe.</p>', 'Criar').then(function (v) {
          if (v) api('POST', '/users', { name: v.name, email: v.email, role_id: +v.role_id }).then(function (r2) { if (!r2.ok) return toast(errMsg(r2), true); showLink(r2); users(); });
        });
      });
      $('[data-newrole]').addEventListener('click', function () {
        dialog('Novo perfil', fld('name', 'Nome do perfil (ex.: Operações)', ''), 'Criar').then(function (v) {
          if (v) api('POST', '/roles', { name: v.name, permissions: ['dashboard.view', 'bookings.view'] }).then(function (r2) { if (!r2.ok) return toast(errMsg(r2), true); toast('Perfil criado. Ajuste as permissões.'); users(); });
        });
      });
    });
  }
  function showLink(r) {
    if (!r.ok) return toast(errMsg(r), true);
    var st = r.data.email === 'sent' ? 'Enviado por e-mail.' : r.data.email === 'logged' ? 'Modo de teste: e-mail não enviado.' : 'O e-mail FALHOU — envie o link por outro canal.';
    dialog('Link de acesso (48 h)', '<p>' + esc(st) + '</p><p class="link-box">' + esc(r.data.setup_link) + '</p><p class="muted">Partilhe apenas com a pessoa em causa.</p>', 'Fechar');
  }

  /* ── Definições ────────────────────────────────────── */
  function settings() {
    if (!can('settings.manage')) return denied('settings.manage');
    api('GET', '/settings').then(function (r) {
      if (!r.ok) return toast(errMsg(r), true);
      var c = r.data.company, p = r.data.payment;
      view.innerHTML = '<div class="grid grid--2"><form class="card stack" data-company><h2>Empresa (aparece nas facturas)</h2><div class="form-grid form-grid--2">' +
        fld('legal_name', 'Denominação', c.legal_name) + fld('trade_name', 'Nome comercial', c.trade_name) + fld('nuit', 'NUIT', c.nuit) + fld('tax_regime', 'Regime fiscal', c.tax_regime) + fld('phone', 'Telefone', c.phone) + fld('email', 'E-mail', c.email) + '</div>' +
        fld('address', 'Morada', c.address) + fld('website', 'Website', c.website) + fld('tax_note', 'Menção fiscal na factura', c.tax_note) +
        '<p class="note note--warn">As menções legais e o formato das facturas devem ser validados pelo contabilista.</p><button class="btn">Guardar empresa</button></form>' +
        '<form class="card stack" data-payment><h2>Instruções de pagamento</h2><div data-methods class="stack"></div><button type="button" class="btn btn--sm btn--ghost" data-addm><i class="bx bx-plus"></i> Método</button>' +
        '<div class="field"><label>Nota</label><textarea name="note" rows="3">' + esc(p.note || '') + '</textarea></div><p class="muted">Métodos sem número ficam marcados como pendentes e não aparecem nas facturas.</p><button class="btn">Guardar pagamentos</button></form></div>' +
        '<p class="muted" style="margin-top:14px">As facturas já emitidas guardam uma cópia destes dados e não mudam.</p>' +
        '<form class="card stack" data-notif style="margin-top:16px"><h2>Notificações automáticas ao cliente</h2><div class="perm-grid">' +
        Object.keys(r.data.notifications || {}).map(function (k) { return '<label class="check"><input type="checkbox" name="' + k + '"' + (r.data.notifications[k] ? ' checked' : '') + '> ' + esc(NOTIF[k] || k) + '</label>'; }).join('') +
        '</div><p class="muted">Mesmo activas, cada acção no painel permite desmarcar «Notificar o cliente».</p><button class="btn">Guardar notificações</button></form>';
      $('[data-notif]').addEventListener('submit', function (e) {
        e.preventDefault();
        var v = {};
        $$('input[type=checkbox]', e.target).forEach(function (c) { v[c.name] = c.checked; });
        api('POST', '/settings/notifications', v).then(function (r2) { if (!r2.ok) return toast(errMsg(r2), true); toast('Preferências de notificação guardadas.'); });
      });
      var box = $('[data-methods]');
      function addM(m) {
        var div = document.createElement('div');
        div.className = 'card'; div.style.padding = '12px';
        div.innerHTML = '<div class="form-grid form-grid--3"><div class="field"><label>Tipo</label><select data-m="type"><option value="bank"' + (m.type === 'bank' ? ' selected' : '') + '>Banco</option><option value="mobile"' + (m.type === 'mobile' ? ' selected' : '') + '>Carteira móvel</option></select></div>' +
          '<div class="field"><label>Nome</label><input data-m="label" value="' + esc(m.label || '') + '"></div><div class="field"><label>Conta / número</label><input data-m="acc" value="' + esc(m.account || m.number || '') + '"></div></div>' +
          '<div class="row" style="margin-top:8px"><div class="field" style="flex:1"><label>NIB (bancos)</label><input data-m="nib" value="' + esc(m.nib || '') + '"></div><button type="button" class="btn btn--sm btn--danger" data-rm style="align-self:flex-end">Remover</button></div>';
        box.appendChild(div);
        $('[data-rm]', div).addEventListener('click', function () { div.remove(); });
      }
      (p.methods || []).forEach(addM);
      $('[data-addm]').addEventListener('click', function () { addM({ type: 'bank' }); });
      $('[data-company]').addEventListener('submit', function (e) {
        e.preventDefault(); var f = e.target, v = {};
        ['legal_name', 'trade_name', 'nuit', 'tax_regime', 'phone', 'email', 'address', 'website', 'tax_note'].forEach(function (k) { v[k] = f[k].value; });
        api('POST', '/settings/company', v).then(function (r2) { if (!r2.ok) return toast(errMsg(r2), true); toast('Dados da empresa guardados.'); });
      });
      $('[data-payment]').addEventListener('submit', function (e) {
        e.preventDefault();
        var methods = $$('.card', box).map(function (div) {
          var t = $('[data-m=type]', div).value, acc = $('[data-m=acc]', div).value.trim();
          return t === 'bank' ? { type: t, label: $('[data-m=label]', div).value, account: acc, nib: $('[data-m=nib]', div).value } : { type: t, label: $('[data-m=label]', div).value, number: acc };
        });
        api('POST', '/settings/payment', { methods: methods, note: e.target.note.value }).then(function (r2) { if (!r2.ok) return toast(errMsg(r2), true); toast('Instruções de pagamento guardadas.'); });
      });
    });
  }

  /* ── Auditoria ─────────────────────────────────────── */
  function audit() {
    if (!can('audit.view')) return denied('audit.view');
    api('GET', '/audit').then(function (r) {
      var list = r.data.entries || [];
      view.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>Acção</th><th>Objecto</th><th>Detalhe</th></tr></thead><tbody>' +
        list.map(function (a) { return '<tr><td>' + dt(a.created_at) + '</td><td>' + esc(a.user_name || '—') + '</td><td class="mono">' + esc(a.action) + '</td><td>' + esc([a.entity, a.entity_id].filter(Boolean).join(' ')) + '</td><td class="muted" style="max-width:420px;word-break:break-word">' + esc(JSON.stringify(a.data)) + '</td></tr>'; }).join('') +
        '</tbody></table></div>';
    });
  }

  /* ── Arranque ──────────────────────────────────────── */
  if ((location.hash || '').indexOf('#/definir-senha') === 0) { route(); return; }
  api('GET', '/me').then(function (r) { if (r.ok) start(r.data); else showAuth('login'); });
})();
