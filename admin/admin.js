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
  function can(p) { return !!S.me && String(p).split('|').some(function (x) { return S.me.permissions.indexOf('*') !== -1 || S.me.permissions.indexOf(x) !== -1; }); }
  function mzn(n, dec) { var p = Math.abs(Number(n || 0)).toFixed(dec ? 2 : 0).split('.'); return (Number(n) < 0 ? '-' : '') + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (p[1] ? ',' + p[1] : '') + ' MZN'; }   // 1.234,56 MZN (o pt-PT não agrupa 4 algarismos)
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
    invalid_amount: 'Valor inválido.', whatsapp_invalid_number: 'Número de WhatsApp inválido', whatsapp_no_recipients: 'Indique pelo menos um número da equipa.', whatsapp_not_configured: 'O WhatsApp não está configurado no servidor (token e Phone number ID).', invoice_not_payable: 'A factura não está emitida.', not_resendable: 'Este e-mail não pode ser reenviado: é um registo antigo sem conteúdo, ou um e-mail de reposição de palavra-passe de cliente (o link não fica guardado; o cliente pede um novo).',
    date_out_of_range: 'Data inválida (tem de ser a partir de hoje).', invalid_phone: 'Telefone inválido.', invalid_name: 'Nome inválido.', invalid_email: 'E-mail inválido.', pdf_integrity_error: 'O ficheiro PDF não corresponde ao original. Contacte o administrador.',
    catalog_busy: 'Outra pessoa está a gravar ou a publicar o catálogo. Tente de novo dentro de momentos.', no_changes: 'Não há alterações por publicar.', publish_failed: 'A publicação falhou; o site anterior foi reposto.',
    slug_taken: 'Já existe um pacote com este endereço.', invalid_slug: 'Endereço inválido (mínimo 3 letras ou números).', invalid_category: 'Escolha uma categoria.', name_required: 'Indique o nome.', validation_failed: 'Há campos por corrigir.', network: 'Sem ligação ao servidor.'
  };
  /* Resultado real do e-mail ao cliente (nunca se diz «enviado» se não foi) */
  var MAIL = { sent: 'E-mail enviado ao cliente.', logged: 'E-mail registado (modo de teste, não enviado).', failed: 'ATENÇÃO: o e-mail ao cliente FALHOU — veja «E-mails» e reenvie.', no_email: 'O cliente não tem e-mail: avise-o por WhatsApp.', disabled: 'Notificação desligada nas Definições.' };
  function withMail(msg, r) { var m = r && r.data && MAIL[r.data.email]; return { text: m ? msg + ' ' + m : msg, err: r && r.data && r.data.email === 'failed' }; }
  function toastMail(msg, r) { var x = withMail(msg, r); toast(x.text, x.err); }
  var NOTIF = { booking_received: 'Pedido de reserva recebido', booking_confirmed: 'Reserva confirmada', booking_cancelled: 'Reserva cancelada', booking_completed: 'Actividade concluída (convite para avaliar)', payment_confirmed: 'Pagamento recebido (com recibo)', payment_refused: 'Comprovativo recusado', payment_reversed: 'Pagamento revertido', refund: 'Reembolso efectuado', invoice_voided: 'Factura anulada' };
  var KIND = { booking_client: 'Pedido recebido (cliente)', booking_team: 'Novo pedido (equipa)', contact_team: 'Mensagem de contacto (equipa)', invoice: 'Factura enviada', proof_team: 'Comprovativo recebido (equipa)', user_invite: 'Convite ao painel', user_reset: 'Repor palavra-passe', account_reset: 'Repor palavra-passe (cliente)', test: 'Teste de envio' };
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

  /* Navegação agrupada; contadores = trabalho pendente real (sem números inventados) */
  var NAV = [
    ['Visão geral', [['#/', 'bx-grid-alt', 'Resumo', 'dashboard.view']]],
    ['Operação', [['#/reservas', 'bx-calendar-check', 'Reservas', 'bookings.view', 'bookings_pending'], ['#/clientes', 'bx-user', 'Clientes', 'customers.view'],
      ['#/experiencias', 'bx-compass', 'Experiências', 'bookings.view|catalog.edit'], ['#/mensagens', 'bx-envelope', 'Mensagens', 'messages.view', 'messages_new'], ['#/avaliacoes', 'bx-star', 'Avaliações', 'reviews.moderate', 'reviews_pending']]],
    ['Financeiro', [['#/facturas', 'bx-receipt', 'Facturas', 'invoices.view'], ['#/pagamentos', 'bx-wallet', 'Pagamentos', 'payments.view', 'payments_awaiting']]],
    ['Sistema', [['#/emails', 'bx-mail-send', 'E-mails e WhatsApp', 'emails.manage', 'emails_failed'], ['#/utilizadores', 'bx-group', 'Utilizadores e perfis', 'users.manage'],
      ['#/definicoes', 'bx-cog', 'Definições', 'settings.manage'], ['#/auditoria', 'bx-history', 'Auditoria', 'audit.view']]]
  ];
  function start(me) {
    S.me = me.user; S.csrf = me.csrf;
    $('[data-auth]').hidden = true;
    $('[data-app]').hidden = false;
    $('[data-nav]').innerHTML = NAV.map(function (g) {
      var items = g[1].filter(function (n) { return can(n[3]); });
      return items.length ? '<div class="nav-group">' + esc(g[0]) + '</div>' + items.map(function (n) {
        return '<a href="' + n[0] + '"><i class="bx ' + n[1] + '" aria-hidden="true"></i>' + esc(n[2]) + (n[4] ? '<span class="nav-count" data-count="' + n[4] + '" hidden></span>' : '') + '</a>';
      }).join('') : '';
    }).join('');
    var initials = String(S.me.name || '?').split(/\s+/).map(function (w) { return w.charAt(0); }).slice(0, 2).join('').toUpperCase();
    $('[data-user]').innerHTML = '<span class="avatar" aria-hidden="true">' + esc(initials) + '</span><div><strong>' + esc(S.me.name) + '</strong>' + esc(S.me.role) + '</div><button type="button" data-logout>Sair</button>';
    $('[data-logout]').addEventListener('click', function () { api('POST', '/logout').then(function () { S.me = null; showAuth('login'); }); });
    refreshCounts();
    route();
  }
  /* Contadores da navegação (pedidos por confirmar, pagamentos por verificar…): pedido próprio, não cancelado pela navegação */
  function refreshCounts() {
    if (!can('dashboard.view')) return;
    var today = iso(new Date());
    fetch('/api/admin/dashboard?from=' + today + '&to=' + today, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d) setCounts(d.attention); }).catch(function () {});
  }
  function setCounts(a) {
    $$('[data-count]').forEach(function (el) { var n = a[el.dataset.count]; el.hidden = !n; el.textContent = n > 99 ? '99+' : n; el.setAttribute('aria-label', n + ' por tratar'); });
  }

  /* ── Router ────────────────────────────────────────── */
  var ROUTES = [
    [/^#\/?$/, dashboard, 'Resumo', 'Visão geral'], [/^#\/reservas$/, bookings, 'Reservas', 'Operação'], [/^#\/reservas\/(MCA-\d{4}-\d+)$/, booking, 'Reserva', 'Reservas'],
    [/^#\/clientes$/, customers, 'Clientes', 'Operação'], [/^#\/experiencias$/, experiences, 'Experiências', 'Operação'], [/^#\/experiencias\/([a-z0-9-]{1,60})$/, experienceEdit, 'Experiência', 'Experiências'], [/^#\/facturas$/, invoices, 'Facturas', 'Financeiro'], [/^#\/facturas\/(\d+)$/, invoice, 'Factura', 'Facturas'],
    [/^#\/pagamentos$/, payments, 'Pagamentos', 'Financeiro'], [/^#\/avaliacoes$/, reviews, 'Avaliações', 'Operação'], [/^#\/mensagens$/, messages, 'Mensagens', 'Operação'], [/^#\/emails$/, emails, 'E-mails e WhatsApp', 'Sistema'],
    [/^#\/utilizadores$/, users, 'Utilizadores e perfis', 'Sistema'], [/^#\/definicoes$/, settings, 'Definições', 'Sistema'], [/^#\/auditoria$/, audit, 'Auditoria', 'Sistema']
  ];
  var CRUMB_LINK = { Reservas: '#/reservas', Facturas: '#/facturas', 'Experiências': '#/experiencias' };
  function route() {
    var h = location.hash || '#/';
    if (h.indexOf('#/definir-senha') === 0) { showAuth('setup', new URLSearchParams(h.split('?')[1] || '').get('token')); return; }
    if (!S.me) return;
    if (S.skipRoute) { S.skipRoute = false; return; }
    if (S.leave && h !== S.here && !S.leave()) { S.skipRoute = true; location.hash = S.here; return; }
    S.leave = S.dirty = S.save = null; S.here = h;
    S.seq++;
    closeDrawer(true);
    var path = h.split('?')[0];
    $$('[data-nav] a').forEach(function (a) {
      var href = a.getAttribute('href'), on = href === path || (href !== '#/' && path.indexOf(href) === 0);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    setSide(false);
    for (var i = 0; i < ROUTES.length; i++) {
      var m = path.match(ROUTES[i][0]);
      if (m) {
        var r = ROUTES[i];
        $('[data-title]').textContent = r[2];
        $('[data-crumb]').innerHTML = CRUMB_LINK[r[3]] ? '<a href="' + CRUMB_LINK[r[3]] + '">' + esc(r[3]) + '</a>' : esc(r[3]);
        document.title = r[2] + ' · Painel | Moz Camp Adventures';
        view.innerHTML = skeleton();
        r[1](m);
        view.focus({ preventScroll: true });
        return;
      }
    }
    view.innerHTML = emptyState('bx-map-alt', 'Página não encontrada', 'Use o menu para navegar.');
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', function (e) { if (S.dirty && S.dirty()) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', function (e) { if (S.save && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); S.save(); } });
  function setSide(open) {
    $('[data-side]').dataset.open = open ? 'true' : 'false';
    $('[data-menu]').setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  $('[data-menu]').addEventListener('click', function () { setSide($('[data-side]').dataset.open !== 'true'); });
  $('[data-side-close]').addEventListener('click', function () { setSide(false); });
  view.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a,button,input,select')) location.hash = tr.dataset.href; });

  function skeleton() {
    return '<div class="skel-page" aria-busy="true" aria-label="A carregar"><div class="skel-row">' + [1, 2, 3, 4].map(function () { return '<span class="skel" style="height:92px"></span>'; }).join('') +
      '</div><span class="skel" style="height:260px"></span><span class="skel" style="height:180px"></span></div>';
  }
  function emptyState(icon, title, text) { return '<div class="empty"><i class="bx ' + icon + '" aria-hidden="true"></i><strong>' + esc(title) + '</strong>' + (text ? '<span>' + esc(text) + '</span>' : '') + '</div>'; }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  /* Botão ocupado durante uma operação (evita submissões duplicadas) */
  function busy(btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true');
    return promise.then(function (r) { btn.disabled = false; btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy'); return r; });
  }

  function denied(perm) { view.innerHTML = '<p class="empty">Sem permissão (' + esc(perm) + ').</p>'; }

  /* ── Resumo: centro de controlo por período ───────── */
  var PERIODS = [['today', 'Hoje', 0], ['7d', '7 dias', 6], ['30d', '30 dias', 29], ['90d', '90 dias', 89], ['year', 'Este ano', null], ['custom', 'Personalizado', null]];
  function periodRange(p, q) {
    var now = new Date(), to = iso(now);
    if (p === 'custom' && q.get('from') && q.get('to')) return { from: q.get('from'), to: q.get('to') };
    if (p === 'year') return { from: now.getFullYear() + '-01-01', to: to };
    var days = (PERIODS.filter(function (x) { return x[0] === p; })[0] || PERIODS[2])[2] || 0;
    var f = new Date(now); f.setDate(f.getDate() - days);
    return { from: iso(f), to: to };
  }
  function dashboard() {
    if (!can('dashboard.view')) { location.hash = can('bookings.view') ? '#/reservas' : '#/facturas'; return; }
    var q = new URLSearchParams(location.hash.split('?')[1] || '');
    var p = q.get('p') || '30d', rg = periodRange(p, q);
    api('GET', '/dashboard?from=' + rg.from + '&to=' + rg.to).then(function (r) {
      if (!r.ok) { view.innerHTML = emptyState('bx-error-circle', 'Não foi possível carregar o resumo', errMsg(r)); return; }
      var d = r.data, m = d.metrics, a = d.attention, R = d.range, pay = m.received !== undefined;
      setCounts(a);
      var hour = new Date().getHours(), hello = hour < 12 ? 'Bom dia' : hour < 19 ? 'Boa tarde' : 'Boa noite';
      var fmt = function (x) { return new Date(x + 'T00:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }); };
      var rangeTxt = R.from === R.to ? fmt(R.from) : fmt(R.from) + ' – ' + fmt(R.to);
      var attn = [
        ['#/reservas?status=pedido', 'bx-time-five', a.bookings_pending, 'pedidos por confirmar', a.bookings_urgent ? a.bookings_urgent + ' com actividade em ≤ 7 dias' : ''],
        pay ? ['#/pagamentos', 'bx-receipt', a.payments_awaiting, 'pagamentos por verificar', ''] : null,
        pay ? ['#/facturas?pay=pendente', 'bx-wallet', mzn(a.outstanding), 'Em dívida (FT emitidas)', a.outstanding_invoices + ' facturas'] : null,
        ['#/mensagens', 'bx-envelope', a.messages_new, 'mensagens novas', ''],
        ['#/avaliacoes', 'bx-star', a.reviews_pending, 'avaliações por moderar', ''],
        a.emails_failed !== null && a.emails_failed !== undefined ? ['#/emails', 'bx-mail-send', a.emails_failed, 'e-mails falhados (7 dias)', ''] : null,
        ['#/facturas', 'bx-file', a.invoices_draft, 'rascunhos de factura', '']
      ].filter(Boolean);
      var kp = [
        ['#/reservas', 'bx-calendar-plus', 'Pedidos recebidos', m.bookings, 'n', false],
        ['#/reservas?status=confirmada', 'bx-check-circle', 'Confirmadas', m.confirmed, 'n', false],
        ['#/reservas?status=cancelada', 'bx-x-circle', 'Cancelamentos', m.cancelled, 'n', true],
        pay ? ['#/pagamentos', 'bx-money', 'Recebido', m.received, 'mzn', false] : null,
        ['#/facturas', 'bx-receipt', 'Facturado (FT)', m.invoiced, 'mzn', false]
      ].filter(Boolean);
      var st = d.status || {}, stTotal = ['pedido', 'confirmada', 'concluida', 'cancelada'].reduce(function (t, k) { return t + (+st[k] || 0); }, 0);
      var COL = { pedido: '#f0a32a', confirmada: '#3c9bb6', concluida: '#2f9e63', cancelada: '#d05454' };
      view.innerHTML =
        '<div class="dash-head"><div><h2>' + hello + ', ' + esc(String(S.me.name).split(' ')[0]) + '</h2><p>' + esc(rangeTxt) + ' · comparado com os ' + R.days + ' dias anteriores</p></div>' +
          '<div class="dash-period"><div class="segmented" role="group" aria-label="Período">' + PERIODS.map(function (x) { return '<button type="button" data-p="' + x[0] + '" aria-pressed="' + (x[0] === p) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
          '<form class="custom" data-custom' + (p === 'custom' ? '' : ' hidden') + '><label class="sr-only" for="p-from">De</label><input type="date" id="p-from" name="from" value="' + esc(R.from) + '" max="' + esc(iso(new Date())) + '" required><span aria-hidden="true">→</span><label class="sr-only" for="p-to">Até</label><input type="date" id="p-to" name="to" value="' + esc(R.to) + '" max="' + esc(iso(new Date())) + '" required><button class="btn btn--sm btn--ghost">Aplicar</button></form></div></div>' +
        '<section aria-label="Requer atenção"><div class="attention">' + attn.map(function (x) {
          var zero = x[2] === 0 || x[2] === '0 MZN';
          return '<a class="attn ' + (zero ? 'attn--ok' : 'attn--hot') + '" href="' + x[0] + '"><i class="bx ' + (zero ? 'bx-check' : x[1]) + '" aria-hidden="true"></i><div><strong>' + esc(x[2]) + '</strong><span>' + esc(x[3]) + (x[4] ? ' · ' + esc(x[4]) : '') + '</span></div></a>';
        }).join('') + '</div></section>' +
        '<div class="kpis">' + kp.map(function (k) {
          var cur = k[3][0], prev = k[3][1];
          return '<a class="kpi" href="' + k[0] + '"><small><i class="bx ' + k[1] + '" aria-hidden="true"></i>' + esc(k[2]) + '</small><strong>' + (k[4] === 'mzn' ? mzn(cur) : cur) + delta(cur, prev, k[5]) + '</strong><span>Antes: ' + (k[4] === 'mzn' ? mzn(prev) : prev) + '</span></a>';
        }).join('') + '</div>' +
        '<div class="grid grid--3" style="margin-bottom:16px"><section class="card"><div class="card__head"><h2>Pedidos recebidos' + (pay ? ' e valores recebidos' : '') + '</h2><span class="muted">por ' + (R.bucket === 'month' ? 'mês' : 'dia') + '</span></div>' +
          barChart(d.series, 'bookings', 'pedidos', R.bucket, false) + (pay ? '<div style="margin-top:18px">' + barChart(d.series, 'received', 'recebido', R.bucket, true) + '</div>' : '') +
          '<div class="chart-legend"><span style="--c:var(--brand-teal)">Pedidos recebidos</span>' + (pay ? '<span style="--c:var(--brand-blue)">Recebido (pagamentos confirmados − reembolsos)</span>' : '') + '</div></section>' +
          '<section class="card"><div class="card__head"><h2>Estado dos pedidos do período</h2></div>' + (stTotal ? '<div class="stackbar" role="img" aria-label="Distribuição por estado">' + ['pedido', 'confirmada', 'concluida', 'cancelada'].map(function (k) { return st[k] ? '<span style="width:' + (100 * st[k] / stTotal) + '%;background:' + COL[k] + '"></span>' : ''; }).join('') + '</div>' +
          '<ul class="legend-list">' + ['pedido', 'confirmada', 'concluida', 'cancelada'].map(function (k) { return '<li><a href="#/reservas?status=' + k + '">' + badge(k) + '</a><b>' + (+st[k] || 0) + ' <span class="muted">(' + Math.round(100 * (+st[k] || 0) / stTotal) + '%)</span></b></li>'; }).join('') + '</ul>'
          : emptyState('bx-calendar', 'Sem pedidos neste período', '')) + '</section></div>' +
        '<div class="grid grid--3" style="margin-bottom:16px"><section class="card"><div class="card__head"><h2>Experiências mais procuradas</h2><a href="#/experiencias">Ver todas</a></div>' + (d.top.length ? '<ul class="hbars">' + d.top.map(function (t) {
            var max = +d.top[0].requests || 1;
            return '<li><div class="hbar-top"><span><a href="#/reservas?item=' + encodeURIComponent(t.item_id) + '">' + esc(t.item_name) + '</a></span><span class="muted">' + t.requests + ' pedidos · ' + t.confirmed + ' confirmadas · ' + t.pax + ' pax</span></div><div class="track"><div class="fill" style="width:' + (100 * t.requests / max) + '%"></div></div></li>';
          }).join('') + '</ul>' : emptyState('bx-compass', 'Sem pedidos neste período', '')) + '</section>' +
          '<section class="card"><div class="card__head"><h2>Próximos 14 dias</h2><a href="#/reservas?status=confirmada&when=upcoming&sort=date&dir=asc">Agenda</a></div>' + (d.upcoming.length ? '<ul class="upcoming">' + d.upcoming.map(function (b) {
            var dd = new Date(String(b.date).slice(0, 10) + 'T00:00:00');
            return '<li><a href="#/reservas/' + esc(b.reference) + '"><span class="datebox"><b>' + dd.getDate() + '</b><small>' + dd.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '') + '</small></span><span><strong>' + esc(b.item_name) + '</strong><span class="cell-sub">' + esc(b.customer_name) + ' · ' + esc(b.reference) + '</span></span><span class="muted">' + b.pax + ' pax</span></a></li>';
          }).join('') + '</ul>' : emptyState('bx-calendar-check', 'Nada agendado', 'Sem reservas confirmadas nos próximos 14 dias.')) + '</section></div>' +
        '<div class="grid grid--3"><section class="card"><div class="card__head"><h2>Actividade recente</h2><a href="#/reservas">Reservas</a></div>' + (d.activity.length ? '<ul class="activity">' + d.activity.map(activityItem).join('') + '</ul>' : emptyState('bx-history', 'Sem actividade', '')) + '</section>' +
          '<section class="card"><div class="card__head"><h2>Acções rápidas</h2></div><div class="quick">' +
            (can('bookings.create') ? '<button type="button" class="btn btn--primary" data-quick-new><i class="bx bx-plus"></i> Novo pedido</button>' : '') +
            '<a class="btn btn--ghost" href="#/reservas?status=pedido"><i class="bx bx-time-five"></i> Confirmar pedidos</a>' +
            (pay ? '<a class="btn btn--ghost" href="#/pagamentos"><i class="bx bx-receipt"></i> Verificar pagamentos</a>' : '') +
            (can('invoices.view') ? '<a class="btn btn--ghost" href="#/facturas"><i class="bx bx-file"></i> Facturas</a>' : '') +
            '<button type="button" class="btn btn--ghost" data-search-open><i class="bx bx-search"></i> Pesquisar <kbd>Ctrl K</kbd></button></div>' +
            '<p class="muted" style="margin-top:16px">«Recebido» conta só pagamentos <strong>confirmados</strong>, menos reembolsos, pela data do pagamento. «Facturado» é o total das facturas FT emitidas e não anuladas — não é dinheiro recebido. Os pedidos são contados pela data em que chegaram; confirmações e cancelamentos, pela data da mudança de estado.</p></section></div>';
      $$('[data-p]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.dataset.p === 'custom') { $('[data-custom]').hidden = false; $$('[data-p]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); $('#p-from').focus(); return; }
          location.hash = '#/?p=' + b.dataset.p;
        });
      });
      $('[data-custom]').addEventListener('submit', function (e) { e.preventDefault(); var f = e.target; if (f.from.value && f.to.value) location.hash = '#/?p=custom&from=' + f.from.value + '&to=' + f.to.value; });
      var qn = $('[data-quick-new]'); if (qn) qn.addEventListener('click', newBooking);
      bindChartTips(view);
    });
  }
  function kpi(href, label, value, sub, cls) {
    var tag = href ? 'a href="' + href + '"' : 'div';
    return '<' + tag + ' class="kpi ' + (cls || '') + '"><small>' + esc(label) + '</small><strong>' + esc(value) + '</strong>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</' + (href ? 'a' : 'div') + '>';
  }
  function delta(cur, prev, inverse) {
    if (!prev && !cur) return '';
    if (!prev) return ' <span class="delta delta--flat" title="Sem base de comparação no período anterior">novo</span>';
    var pct = Math.round(100 * (cur - prev) / prev), good = inverse ? pct < 0 : pct > 0;
    var cls = pct === 0 ? 'flat' : good ? 'up' : 'down';
    return ' <span class="delta delta--' + cls + '" title="Variação face ao período anterior">' + (pct > 0 ? '▲ ' : pct < 0 ? '▼ ' : '') + Math.abs(pct) + '%</span>';
  }
  function activityItem(e) {
    var data = typeof e.data === 'string' ? JSON.parse(e.data || '{}') : (e.data || {});
    var icon = 'bx-note', txt = '';
    if (e.type === 'created') { icon = 'bx-plus-circle'; txt = 'Novo pedido (' + (LABEL[data.channel] || data.channel || 'site') + ')'; }
    else if (e.type === 'status_changed') { icon = { confirmada: 'bx-check-circle', cancelada: 'bx-x-circle', concluida: 'bx-flag', pedido: 'bx-undo' }[data.to] || 'bx-transfer'; txt = 'Estado → ' + (LABEL[data.to] || data.to); }
    else if (e.type === 'note') { txt = 'Nota: ' + String(data.text || '').slice(0, 80); }
    return '<li><i class="bx ' + icon + '" aria-hidden="true"></i><div><a href="#/reservas/' + esc(e.reference) + '"><strong>' + esc(e.reference) + '</strong></a> · ' + esc(txt) + '<span class="cell-sub">' + esc(e.item_name) + ' · ' + esc(e.customer_name) + '</span><time>' + dt(e.created_at) + ' · ' + esc(e.actor) + '</time></div></li>';
  }

  /* Gráfico de barras SVG (sem bibliotecas): eixos discretos, tooltip ao passar o rato ou com o teclado */
  function barChart(series, key, unit, bucket, money) {
    var W = 640, H = 150, P = { l: 44, r: 6, t: 8, b: 22 }, n = series.length || 1;
    var max = Math.max.apply(null, series.map(function (x) { return +x[key] || 0; }).concat([money ? 1000 : 4]));
    var nice = function (v) { var e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };
    max = nice(max);
    var bw = (W - P.l - P.r) / n, bar = Math.max(2, Math.min(28, bw * .68));
    var lab = function (v) { return money ? (v >= 1e6 ? (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + ' M' : v >= 1e3 ? Math.round(v / 1e3) + ' mil' : v) : v; };
    var date = function (x) { var d = new Date(x + 'T00:00:00'); return bucket === 'month' ? d.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' }) : d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }); };
    var every = Math.max(1, Math.ceil(n / 8)), total = series.reduce(function (t, x) { return t + (+x[key] || 0); }, 0);
    var out = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc((money ? 'Recebido' : 'Pedidos') + ' por ' + (bucket === 'month' ? 'mês' : 'dia') + ': total ' + (money ? mzn(total) : total)) + '">';
    [0, .5, 1].forEach(function (g) { var y = P.t + (H - P.t - P.b) * (1 - g); out += '<line class="grid-line" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '"/><text class="axis" x="' + (P.l - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + esc(lab(max * g)) + '</text>'; });
    series.forEach(function (x, i) {
      var v = +x[key] || 0, h = (H - P.t - P.b) * v / max, cx = P.l + bw * i + bw / 2;
      out += '<rect class="bar' + (money ? ' bar--alt' : '') + '" tabindex="0" x="' + (cx - bar / 2) + '" y="' + (H - P.b - Math.max(h, v ? 1.5 : 0)) + '" width="' + bar + '" height="' + Math.max(h, v ? 1.5 : 0) + '" rx="3" data-tip="' + esc(date(x.d) + ': ' + (money ? mzn(v) : v + ' ' + unit)) + '"><title>' + esc(date(x.d) + ': ' + (money ? mzn(v) : v + ' ' + unit)) + '</title></rect>';
      if (i % every === 0) out += '<text class="axis" x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(date(x.d)) + '</text>';
    });
    return out + '</svg>';
  }
  function bindChartTips(root) {
    var tip = document.querySelector('.chart-tip') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'chart-tip', hidden: true }));
    var show = function (el) { var b = el.getBoundingClientRect(); tip.textContent = el.dataset.tip; tip.style.left = (b.left + b.width / 2) + 'px'; tip.style.top = b.top + 'px'; tip.hidden = false; };
    $$('.chart [data-tip]', root).forEach(function (el) {
      el.addEventListener('mouseenter', function () { show(el); }); el.addEventListener('focus', function () { show(el); });
      el.addEventListener('mouseleave', function () { tip.hidden = true; }); el.addEventListener('blur', function () { tip.hidden = true; });
    });
  }

  /* ── Reservas: filtros combináveis, ordenação, paginação e painel lateral ── */
  var BK_KEYS = ['q', 'status', 'item', 'when', 'from', 'to', 'sort', 'dir', 'page', 'per'];
  function bookings() {
    if (!can('bookings.view')) return denied('bookings.view');
    var q = new URLSearchParams(location.hash.split('?')[1] || ''), st = {};
    BK_KEYS.forEach(function (k) { st[k] = q.get(k) || ''; });
    st.sort = st.sort || 'created'; st.dir = st.dir || 'desc'; st.page = +st.page || 1; st.per = +st.per || 25;
    view.innerHTML = '<div class="toolbar" role="search">' +
        '<div class="input-icon"><i class="bx bx-search" aria-hidden="true"></i><input type="search" placeholder="Referência, cliente, telefone, e-mail ou experiência" data-q value="' + esc(st.q) + '" aria-label="Pesquisar reservas"></div>' +
        '<select data-f="item" aria-label="Experiência"><option value="">Todas as experiências</option></select>' +
        '<select data-f="when" aria-label="Quando"><option value="">Todas as datas</option><option value="upcoming"' + (st.when === 'upcoming' ? ' selected' : '') + '>Próximas</option><option value="past"' + (st.when === 'past' ? ' selected' : '') + '>Passadas</option></select>' +
        '<input type="date" data-f="from" value="' + esc(st.from) + '" aria-label="Data da actividade: de" title="Data da actividade: de">' +
        '<input type="date" data-f="to" value="' + esc(st.to) + '" aria-label="Data da actividade: até" title="Data da actividade: até">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-clear hidden><i class="bx bx-x"></i> Limpar filtros</button>' +
        (can('bookings.create') ? '<button class="btn btn--primary" data-new><i class="bx bx-plus"></i> Novo pedido</button>' : '') + '</div>' +
      '<div class="tabs" role="group" aria-label="Estado" data-tabs></div><div data-list aria-live="polite"></div>';
    var listEl = $('[data-list]');
    function sync() {
      var qs = BK_KEYS.filter(function (k) { return st[k] && !(k === 'page' && st[k] === 1) && !(k === 'per' && st[k] === 25) && !(k === 'sort' && st[k] === 'created') && !(k === 'dir' && st[k] === 'desc'); })
        .map(function (k) { return k + '=' + encodeURIComponent(st[k]); }).join('&');
      history.replaceState(null, '', '#/reservas' + (qs ? '?' + qs : ''));
      $('[data-clear]').hidden = !(st.q || st.status || st.item || st.when || st.from || st.to);
    }
    function load() {
      sync();
      listEl.setAttribute('aria-busy', 'true');
      if (!listEl.querySelector('table')) listEl.innerHTML = '<span class="skel" style="height:320px"></span>';
      var qs = BK_KEYS.map(function (k) { return k + '=' + encodeURIComponent(st[k]); }).join('&');
      api('GET', '/bookings?' + qs).then(function (r) {
        listEl.removeAttribute('aria-busy');
        if (!r.ok) { listEl.innerHTML = emptyState('bx-error-circle', 'Não foi possível carregar', errMsg(r)); return; }
        var d = r.data, c = d.counts || {};
        var sel = $('[data-f=item]');
        if (sel.options.length === 1) sel.insertAdjacentHTML('beforeend', d.items.map(function (i) { return '<option value="' + esc(i.item_id) + '"' + (i.item_id === st.item ? ' selected' : '') + '>' + esc(i.name) + '</option>'; }).join(''));
        $('[data-tabs]').innerHTML = [['', 'Todas', c.all], ['pedido', 'Por confirmar', c.pedido], ['confirmada', 'Confirmadas', c.confirmada], ['concluida', 'Concluídas', c.concluida], ['cancelada', 'Canceladas', c.cancelada]].map(function (t) {
          return '<button type="button" class="chip" data-status="' + t[0] + '" aria-pressed="' + (t[0] === st.status) + '">' + t[1] + ' <b>' + (t[2] || 0) + '</b></button>';
        }).join('');
        $$('[data-status]').forEach(function (b) { b.addEventListener('click', function () { st.status = b.dataset.status; st.page = 1; load(); }); });
        listEl.innerHTML = bookingTable(d.bookings, st) + pager(d);
        $$('th[data-sortkey]', listEl).forEach(function (th) {
          th.addEventListener('click', function () { var k = th.dataset.sortkey; st.dir = st.sort === k && st.dir === 'desc' ? 'asc' : 'desc'; st.sort = k; st.page = 1; load(); });
          th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); th.click(); } });
        });
        $$('[data-page]', listEl).forEach(function (b) { b.addEventListener('click', function () { st.page = +b.dataset.page; load(); listEl.scrollIntoView({ block: 'nearest' }); }); });
        var per = $('[data-per]', listEl); if (per) per.addEventListener('change', function () { st.per = +per.value; st.page = 1; load(); });
        $$('tr[data-open]', listEl).forEach(function (tr) {
          tr.addEventListener('click', function (e) { if (e.target.closest('a,button')) return; openBooking(tr.dataset.open, tr, load); });
          tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') openBooking(tr.dataset.open, tr, load); });
        });
      });
    }
    var t;
    $('[data-q]').addEventListener('input', function (e) { clearTimeout(t); t = setTimeout(function () { st.q = e.target.value.trim(); st.page = 1; load(); }, 250); });
    $$('[data-f]').forEach(function (el) { el.addEventListener('change', function () { st[el.dataset.f] = el.value; st.page = 1; load(); }); });
    $('[data-clear]').addEventListener('click', function () { ['q', 'status', 'item', 'when', 'from', 'to'].forEach(function (k) { st[k] = ''; }); $('[data-q]').value = ''; $$('[data-f]').forEach(function (el) { el.value = ''; }); st.page = 1; load(); });
    var nb = $('[data-new]'); if (nb) nb.addEventListener('click', newBooking);
    load();
  }
  function bookingTable(list, st) {
    if (!list.length) return emptyState('bx-calendar-x', 'Nenhuma reserva encontrada', 'Ajuste a pesquisa ou os filtros.');
    var th = function (key, label, cls) {
      var on = st.sort === key;
      return '<th class="' + (cls || '') + '" data-sortkey="' + key + '" data-sort tabindex="0" aria-sort="' + (on ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '" scope="col">' + label + '</th>';
    };
    return '<div class="table-wrap"><table data-nosort><thead><tr>' + th('reference', 'Referência') + '<th scope="col">Experiência</th>' + th('customer', 'Cliente') + th('date', 'Data') +
      '<th class="num hide-sm" scope="col">Pax</th><th class="hide-md" scope="col">Canal</th>' + th('total', 'Total', 'num') + '<th scope="col">Estado</th><th class="num hide-md" scope="col">Fact.</th></tr></thead><tbody>' +
      list.map(function (b) {
        return '<tr data-open="' + esc(b.reference) + '" tabindex="0" aria-label="Abrir resumo de ' + esc(b.reference) + '"><td><a class="mono" href="#/reservas/' + esc(b.reference) + '">' + esc(b.reference) + '</a></td>' +
          '<td>' + esc(b.item_name) + '</td><td>' + esc(b.customer_name) + (b.customer_phone ? '<span class="cell-sub">' + esc(b.customer_phone) + '</span>' : '') + '</td>' +
          '<td>' + date(b.date) + (b.urgent ? ' <span class="flag" title="Ainda por confirmar e a actividade é daqui a 7 dias ou menos"><i class="bx bx-error"></i>urgente</span>' : '') + '</td>' +
          '<td class="num hide-sm">' + esc(b.pax) + '</td><td class="hide-md">' + esc(LABEL[b.channel] || b.channel) + '</td>' +
          '<td class="num">' + (b.total_to_confirm ? '<span class="muted">a confirmar</span>' : mzn(b.total_estimate)) + '</td><td>' + badge(b.status) + '</td><td class="num hide-md">' + esc(b.invoices) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function pager(d) {
    var pages = Math.max(1, Math.ceil(d.total / d.per)), a = d.total ? (d.page - 1) * d.per + 1 : 0, b = Math.min(d.total, d.page * d.per);
    return '<div class="pager"><span>' + a + '–' + b + ' de ' + d.total + '</span><div class="row"><label class="muted" for="per">Por página</label><select id="per" data-per style="width:auto">' +
      [25, 50, 100].map(function (n) { return '<option' + (n === d.per ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>' +
      '<div class="pager__btns"><button type="button" class="btn btn--ghost btn--sm" data-page="' + (d.page - 1) + '"' + (d.page <= 1 ? ' disabled' : '') + ' aria-label="Página anterior"><i class="bx bx-chevron-left"></i></button>' +
      '<span class="muted" style="align-self:center">' + d.page + ' / ' + pages + '</span>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-page="' + (d.page + 1) + '"' + (d.page >= pages ? ' disabled' : '') + ' aria-label="Página seguinte"><i class="bx bx-chevron-right"></i></button></div></div></div>';
  }

  function newBooking() {
    (S.catalog ? Promise.resolve(S.catalog) : api('GET', '/catalog').then(function (r) { return (S.catalog = r.data.items); })).then(function (items) {
      var opts = items.map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.name) + (i.kind === 'stay' ? ' (alojamento)' : '') + '</option>'; }).join('');
      dialog('Novo pedido (WhatsApp, telefone, e-mail)',
        '<p class="muted">Campos com <span class="req" aria-hidden="true">*</span> são obrigatórios.</p>' +
        '<div class="field"><label>Experiência <span class="req" aria-hidden="true">*</span></label><select name="item" data-item required>' + opts + '</select></div>' +
        '<div class="form-grid form-grid--2"><div class="field" data-tour><label>Data <span class="req" aria-hidden="true">*</span></label><input type="date" name="date"></div><div class="field" data-stay hidden><label>Entrada <span class="req" aria-hidden="true">*</span></label><input type="date" name="checkin"></div><div class="field" data-stay hidden><label>Saída <span class="req" aria-hidden="true">*</span></label><input type="date" name="checkout"></div></div>' +
        '<div class="form-grid form-grid--3"><div class="field"><label>Adultos</label><input type="number" name="adults" min="1" value="1"></div><div class="field"><label>Crianças</label><input type="number" name="children" min="0" value="0"></div><div class="field"><label>Canal</label><select name="channel"><option value="whatsapp">WhatsApp</option><option value="manual">Telefone / presencial</option><option value="email">E-mail</option></select></div></div>' +
        '<div class="field" data-boatwrap hidden><label>Barco</label><select name="boat" data-boat></select></div>' +
        '<div class="form-grid form-grid--2"><div class="field"><label>Nome do cliente <span class="req" aria-hidden="true">*</span></label><input name="name" required autocomplete="off"></div><div class="field"><label>Telefone <span class="req" aria-hidden="true">*</span></label><input name="phone" required inputmode="tel" autocomplete="off"></div></div>' +
        '<div class="field"><label>E-mail <span class="opt">(opcional)</span></label><input type="email" name="email" autocomplete="off"></div><p class="muted">O preço é calculado pelo sistema com as tarifas publicadas.</p><p class="error" data-nb-error role="alert" hidden></p>', 'Registar pedido');
      var d = $('[data-dialog]');
      function sync() {
        var it = items.filter(function (i) { return i.id === $('[data-item]', d).value; })[0];
        $$('[data-tour]', d).forEach(function (x) { x.hidden = it.kind === 'stay'; });
        $$('[data-stay]', d).forEach(function (x) { x.hidden = it.kind !== 'stay'; });
        $('[data-boatwrap]', d).hidden = !it.boats.length;
        $('[data-boat]', d).innerHTML = '<option value="">Sem barco privado</option>' + it.boats.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(b.title) + '</option>'; }).join('');
      }
      $('[data-item]', d).addEventListener('change', sync); sync();
      var form = $('form', d), err = $('[data-nb-error]', d);
      form.noValidate = true;   // a validação do painel substitui os balões do browser (mensagens junto dos campos)
      /* Validação imediata dos campos obrigatórios (erro junto do campo) */
      function check(el) {
        var field = el.closest('.field'), hidden = field && field.hidden, bad = !hidden && (el.required || el.type === 'date') && !String(el.value).trim();
        if (el.name === 'phone' && el.value.trim()) bad = el.value.replace(/\D/g, '').length < 7;
        if (el.name === 'email' && el.value.trim()) bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
        el.setAttribute('aria-invalid', bad ? 'true' : 'false');
        var msg = field && $('.field-error', field);
        if (bad && field && !msg) { msg = document.createElement('span'); msg.className = 'field-error'; msg.id = el.id + '-err'; field.appendChild(msg); el.setAttribute('aria-describedby', msg.id); }
        if (msg) { msg.textContent = bad ? (el.name === 'phone' ? 'Telefone inválido.' : el.name === 'email' ? 'E-mail inválido.' : 'Campo obrigatório.') : ''; msg.hidden = !bad; }
        return !bad;
      }
      $$('input, select', form).forEach(function (el) { el.addEventListener('blur', function () { check(el); }); });
      /* Submeter sem fechar: o diálogo só fecha quando o pedido fica registado */
      form.addEventListener('submit', function (e) {
        if (!e.submitter || e.submitter.value !== 'ok') return;
        e.preventDefault();
        err.hidden = true;
        var ok = $$('[name=name], [name=phone], [name=email], [name=date], [name=checkin], [name=checkout]', form).map(check).every(Boolean);
        if (!ok) { var first = $('[aria-invalid=true]', form); if (first) first.focus(); return; }
        var v = {}; $$('[name]', d).forEach(function (el) { if (!(el.closest('.field') || {}).hidden) v[el.name] = el.value; });
        v.adults = +v.adults; v.children = +v.children; if (!v.boat) delete v.boat;
        busy(e.submitter, api('POST', '/bookings', v)).then(function (r) {
          if (!r.ok) { err.textContent = errMsg(r) + (r.data.min ? ' (mínimo ' + r.data.min + ')' : ''); err.hidden = false; return; }
          d.close('done');
          toast('Pedido ' + r.data.reference + ' registado.'); refreshCounts(); location.hash = '#/reservas/' + r.data.reference;
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

  /* ── Clientes (contas do site) ─────────────────────── */
  function customers() {
    if (!can('customers.view')) return denied('customers.view');
    var mk = '', q = new URLSearchParams(location.hash.split('?')[1] || '').get('q') || '';
    view.innerHTML = '<div class="toolbar"><div class="input-icon"><i class="bx bx-search" aria-hidden="true"></i><input type="search" placeholder="Procurar por nome, e-mail ou telefone" aria-label="Procurar clientes" data-q value="' + esc(q) + '"></div>' +
      '<div class="chips">' + [['', 'Todos'], ['1', 'Aceitam promoções']].map(function (x) { return '<button class="chip" data-mk="' + x[0] + '" aria-pressed="' + (x[0] === mk) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '</div><p class="muted" style="margin-bottom:12px">Contas criadas no site. «Reservas» conta os pedidos feitos com a sessão iniciada. «Promoções»: o cliente aceitou receber ofertas por e-mail (com a data).</p><div data-kpis></div><div data-list></div>';
    function load() {
      var seq = S.seq;
      api('GET', '/customers?marketing=' + mk + '&q=' + encodeURIComponent(q)).then(function (r) {
        if (seq !== S.seq) return;
        var t = r.data.totals || {}, list = r.data.customers || [];
        $('[data-kpis]').innerHTML = '<div class="kpis">' + kpi('', 'Contas', t.total, '') + kpi('', 'Aceitam promoções', t.marketing, '') + '</div>';
        $('[data-list]').innerHTML = list.length ? '<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Contacto</th><th>Promoções</th><th class="num">Reservas</th><th>Último acesso</th></tr></thead><tbody>' + list.map(function (c) {
          return '<tr><td><strong>' + esc(c.name) + '</strong><br><span class="muted">' + (c.lang === 'en' ? 'Inglês' : 'Português') + ' · desde ' + dt(c.created_at) + '</span></td>' +
            '<td><a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' + (c.phone ? '<br><span class="muted">' + esc(c.phone) + '</span>' : '') + '</td>' +
            '<td>' + (c.marketing ? '<span class="badge badge--confirmado">Sim</span><br><span class="muted">' + dt(c.marketing_consent_at) + '</span>' : '<span class="muted">Não</span>') + '</td>' +
            '<td class="num">' + c.bookings + '</td><td>' + (c.last_login_at ? dt(c.last_login_at) : '<span class="muted">—</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Sem clientes.</p>';
      });
    }
    $('[data-mk]').forEach(function (b) { b.addEventListener('click', function () { mk = b.dataset.mk; $('[data-mk]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); load(); }); });
    var timer;
    $('[data-q]').addEventListener('input', function (e) { clearTimeout(timer); timer = setTimeout(function () { q = e.target.value.trim(); load(); }, 300); });
    load();
  }

  /* ── Registo de e-mails ─────────────────────────────── */
  function emails() {
    if (!can('emails.manage')) return denied('emails.manage');
    var st = 'failed';
    var ST = { sent: 'Enviado', failed: 'Falhou', logged: 'Modo de teste' };
    view.innerHTML = '<div class="toolbar chips">' + [['failed', 'Falhados'], ['sent', 'Enviados'], ['logged', 'Modo de teste'], ['', 'Todos'], ['wa', 'WhatsApp']].map(function (x) { return '<button class="chip" data-st="' + x[0] + '" aria-pressed="' + (x[0] === st) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<p class="muted" style="margin-bottom:12px" data-mnote></p><div data-list></div>';
    function load() {
      $('[data-mnote]').textContent = st === 'wa' ? '«Enviado» significa que a Meta aceitou a mensagem; a entrega e a leitura não são seguidas. Os números e o interruptor estão em Definições.' : '«Enviado» significa que o servidor de e-mail (ou o Resend) aceitou a mensagem; a entrega na caixa do cliente não pode ser garantida.';
      if (st === 'wa') return loadWa();
      api('GET', '/emails?status=' + st).then(function (r) {
        var list = r.data.emails || [];
        $('[data-list]').innerHTML = list.length ? '<div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Para</th><th>Assunto</th><th>Estado</th><th><span class="sr-only">Acções</span></th></tr></thead><tbody>' + list.map(function (e) {
          var cls = e.status === 'failed' ? 'recusado' : e.status === 'sent' ? 'confirmado' : 'rascunho';
          var kind = e.kind.indexOf('notify_') === 0 ? NOTIF[e.kind.slice(7)] : KIND[e.kind];
          return '<tr><td>' + dt(e.created_at) + '</td><td>' + esc(kind || e.kind) + (e.resent_of ? '<br><span class="muted">reenvio de #' + e.resent_of + '</span>' : '') + '</td><td>' + esc(e.to_addr) + '</td><td>' + esc(e.subject) + '</td>' +
            '<td><span class="badge badge--' + cls + '">' + esc(ST[e.status]) + '</span>' + (e.error ? '<br><span class="muted">' + esc(e.error) + '</span>' : '') + (e.resent_ok ? '<br><span class="muted">reenviado com sucesso</span>' : '') + '</td>' +
            '<td>' + (e.status === 'failed' && e.resendable && !e.resent_ok ? '<button class="btn btn--sm" data-resend="' + e.id + '">Reenviar</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Nada aqui.</p>';
      });
    }
    function loadWa() {
      api('GET', '/whatsapp').then(function (r) {
        if (!r.ok) return toast(errMsg(r), true);
        var list = r.data.messages || [], ws = r.data.status;
        var head = !ws.enabled ? '<p class="note" style="margin-bottom:12px"><i class="bx bx-info-circle"></i> Avisos por WhatsApp desligados. Active-os em <a href="#/definicoes">Definições</a>.</p>' : '';
        $('[data-list]').innerHTML = head + (list.length ? '<div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Para</th><th>Mensagem</th><th>Estado</th></tr></thead><tbody>' + list.map(function (m) {
          var cls = m.status === 'failed' ? 'recusado' : m.status === 'sent' ? 'confirmado' : 'rascunho';
          return '<tr><td>' + dt(m.created_at) + '</td><td>' + esc(KIND[m.kind] || (m.kind === 'booking_team' ? 'Novo pedido (equipa)' : m.kind)) + '</td><td>+' + esc(m.to_number) + '</td>' +
            '<td>' + (m.related_type === 'booking' && m.params && m.params[0] ? '<a href="#/reservas/' + esc(m.params[0]) + '">' + esc(m.params[0]) + '</a> · ' : '') + esc((m.params || []).slice(1, 3).join(' · ')) + '<span class="cell-sub">Modelo ' + esc(m.template) + '</span></td>' +
            '<td><span class="badge badge--' + cls + '">' + esc(ST[m.status]) + '</span>' + (m.error ? '<br><span class="muted">' + esc(m.error) + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Ainda não foi enviada nenhuma mensagem.</p>');
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
        '<div class="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Estado</th><th>Último acesso</th><th><span class="sr-only">Acções</span></th></tr></thead><tbody>' +
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
        '</div><p class="muted">Mesmo activas, cada acção no painel permite desmarcar «Notificar o cliente».</p><button class="btn">Guardar notificações</button></form>' + channelsCard(r.data.channels);
      $('[data-notif]').addEventListener('submit', function (e) {
        e.preventDefault();
        var v = {};
        $$('input[type=checkbox]', e.target).forEach(function (c) { v[c.name] = c.checked; });
        api('POST', '/settings/notifications', v).then(function (r2) { if (!r2.ok) return toast(errMsg(r2), true); toast('Preferências de notificação guardadas.'); });
      });
      bindChannels();
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

  /* Canais de envio: e-mail (Resend ou servidor) e WhatsApp (Meta). As chaves nunca chegam ao browser: só o estado. */
  var TRANSPORT = { resend: 'Resend (API)', mail: 'Servidor do site (sendmail)', log: 'Modo de teste (não envia)' };
  function channelsCard(ch) {
    if (!ch) return '';
    var e = ch.email, w = ch.whatsapp;
    function state(ok, okTxt, badTxt) { return '<span class="badge badge--' + (ok ? 'confirmado' : 'pendente') + '">' + esc(ok ? okTxt : badTxt) + '</span>'; }
    return '<section class="card stack" style="margin-top:16px" data-channels><h2>Canais de envio</h2><div class="grid grid--2">' +
      '<div class="stack"><h3 class="h-sub"><i class="bx bx-envelope"></i> E-mail</h3><dl class="kv">' +
        '<dt>Envio</dt><dd>' + esc(TRANSPORT[e.transport] || e.transport) + ' ' + (e.transport === 'log' ? '' : state(e.configured, 'Configurado', 'Chave do Resend em falta')) + '</dd>' +
        '<dt>Remetente</dt><dd>' + esc(e.from) + '</dd><dt>Respostas para</dt><dd>' + esc(e.reply_to) + '</dd></dl>' +
        '<form class="stack" data-eteam><div class="field"><label for="e-team">Quem recebe os avisos de novos pedidos e comprovativos (um e-mail por linha, até 10)</label><textarea id="e-team" name="recipients" rows="4" placeholder="' + esc(e.reply_to) + '">' + esc((e.team_list || []).join('\n')) + '</textarea>' +
        '<span class="help">Vazio = ' + esc(e.reply_to) + '. Todos recebem o mesmo e-mail.</span></div><div class="row"><button class="btn btn--sm">Guardar destinatários</button></div></form>' +
        '<p class="muted">O remetente tem de pertencer a um domínio verificado no Resend (registos SPF e DKIM). A chave fica na configuração do servidor, nunca no painel.</p>' +
        '<div class="row"><button type="button" class="btn btn--ghost btn--sm" data-test="email"><i class="bx bx-send"></i> Enviar e-mail de teste</button></div></div>' +
      '<form class="stack" data-wa><h3 class="h-sub"><i class="bx bxl-whatsapp"></i> WhatsApp (avisos à equipa)</h3><dl class="kv">' +
        '<dt>Ligação</dt><dd>' + (w.mode === 'log' ? state(false, '', 'Modo de teste (não envia)') : state(w.configured, 'Meta Cloud API configurada', 'Token ou Phone number ID em falta')) + '</dd>' +
        '<dt>Modelo</dt><dd>' + esc(w.template) + ' · ' + esc(w.language) + '</dd>' + (w.phone_number_id ? '<dt>Phone number ID</dt><dd>' + esc(w.phone_number_id) + '</dd>' : '') + '</dl>' +
        '<label class="check"><input type="checkbox" name="enabled"' + (w.enabled ? ' checked' : '') + '> Avisar a equipa por WhatsApp a cada novo pedido de reserva</label>' +
        '<div class="field"><label for="wa-nums">Números da equipa (um por linha, até 5)</label><textarea id="wa-nums" name="recipients" rows="3" placeholder="+258 84 000 0000">' + esc((w.recipients || []).map(function (n) { return '+' + n; }).join('\n')) + '</textarea>' +
        '<span class="help">Formato internacional; números moçambicanos podem ir sem o 258. Cada número tem de ter WhatsApp.</span></div>' +
        '<div class="row"><button class="btn btn--sm">Guardar WhatsApp</button><button type="button" class="btn btn--ghost btn--sm" data-test="whatsapp"><i class="bx bx-send"></i> Enviar WhatsApp de teste</button></div></form>' +
      '</div><div data-test-result role="status" aria-live="polite"></div></section>';
  }
  function bindChannels() {
    var card = $('[data-channels]');
    if (!card) return;
    var out = $('[data-test-result]', card);
    $('[data-eteam]', card).addEventListener('submit', function (e) {
      e.preventDefault();
      var list = e.target.recipients.value.split(/[\n,;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
      busy(e.submitter, api('POST', '/settings/email_team', { recipients: list })).then(function (r) {
        if (!r.ok) return toast(errMsg(r) + (r.data.email ? ' (' + r.data.email + ')' : ''), true);
        e.target.recipients.value = (r.data.channels.email.team_list || []).join('\n');
        toast('Destinatários dos avisos guardados.');
      });
    });
    $('[data-wa]', card).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, nums = f.recipients.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      busy(e.submitter, api('POST', '/settings/whatsapp', { enabled: f.enabled.checked, recipients: nums })).then(function (r) {
        if (!r.ok) return toast(errMsg(r) + (r.data.number ? ' (' + r.data.number + ')' : ''), true);
        f.recipients.value = (r.data.channels.whatsapp.recipients || []).map(function (n) { return '+' + n; }).join('\n');
        toast('Definições de WhatsApp guardadas.');
      });
    });
    $$('[data-test]', card).forEach(function (b) {
      b.addEventListener('click', function () {
        out.innerHTML = '';
        busy(b, api('POST', '/notifications/test', { channel: b.dataset.test })).then(function (r) {
          if (!r.ok) return toast(errMsg(r), true);
          var L = { sent: 'enviado', logged: 'registado em modo de teste (não enviado)', failed: 'FALHOU' };
          out.innerHTML = '<div class="note' + (r.data.results.some(function (x) { return x.status === 'failed'; }) ? ' note--warn' : '') + '"><strong>Resultado do teste (' + (b.dataset.test === 'email' ? 'e-mail' : 'WhatsApp') + '):</strong><ul class="plain-list">' +
            r.data.results.map(function (x) { return '<li>' + esc((b.dataset.test === 'whatsapp' ? '+' : '') + x.to) + ': ' + esc(L[x.status] || x.status) + (x.error ? ' — ' + esc(x.error) : '') + '</li>'; }).join('') + '</ul></div>';
        });
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

  /* ── Painel lateral: resumo e acções de uma reserva sem sair da lista ── */
  var drawerFrom = null;
  function openBooking(ref, fromEl, onChange) {
    var dr = $('[data-drawer]');
    drawerFrom = fromEl || document.activeElement;
    $$('tr.is-selected').forEach(function (x) { x.classList.remove('is-selected'); });
    if (fromEl && fromEl.classList) fromEl.classList.add('is-selected');
    dr.hidden = false;
    dr.innerHTML = '<div class="drawer__head"><h2 id="drawer-title">' + esc(ref) + '</h2><button class="icon-btn" type="button" data-drawer-close aria-label="Fechar"><i class="bx bx-x"></i></button></div><div class="drawer__body"><span class="skel" style="height:120px"></span><span class="skel" style="height:160px"></span></div>';
    requestAnimationFrame(function () { dr.dataset.open = 'true'; });
    $('[data-drawer-close]', dr).focus();
    api('GET', '/bookings/' + ref).then(function (r) {
      if (!r.ok) { $('.drawer__body', dr).innerHTML = emptyState('bx-error-circle', 'Não foi possível abrir', errMsg(r)); return; }
      var b = r.data.booking;
      var when = b.service_date ? date(b.service_date) : date(b.checkin) + ' → ' + date(b.checkout) + ' (' + b.nights + ' noites)';
      var wa = 'https://wa.me/' + String(b.customer_phone).replace(/\D/g, '') + '?text=' + encodeURIComponent('Olá ' + b.customer_name + ', sobre o seu pedido ' + b.reference + ' (' + b.item_name + '): ');
      dr.innerHTML = '<div class="drawer__head"><div><h2 id="drawer-title" class="mono">' + esc(b.reference) + '</h2><span class="muted">' + esc(b.item_name) + '</span></div><div class="row">' + badge(b.status) + '<button class="icon-btn" type="button" data-drawer-close aria-label="Fechar"><i class="bx bx-x"></i></button></div></div>' +
        '<div class="drawer__body">' +
          (can('bookings.manage') && b.next_status.length ? '<section><h3>Acções</h3><div class="row">' + b.next_status.map(function (s) { return '<button class="btn btn--sm ' + (s === 'cancelada' ? 'btn--danger' : s === 'confirmada' ? 'btn--primary' : 'btn--ghost') + '" data-dto="' + s + '">' + ({ confirmada: 'Confirmar', concluida: 'Marcar concluída', cancelada: 'Cancelar', pedido: 'Reabrir' })[s] + '</button>'; }).join('') + '</div></section>' : '') +
          '<section><h3>Pedido</h3><dl class="dl"><dt>Data</dt><dd>' + when + '</dd><dt>Participantes</dt><dd>' + b.adults + ' adultos' + (b.children ? ', ' + b.children + ' crianças' : '') + '</dd><dt>Canal</dt><dd>' + esc(LABEL[b.channel]) + ' · ' + esc(b.lang.toUpperCase()) + '</dd><dt>Registado</dt><dd>' + dt(b.created_at) + '</dd><dt>Total estimado</dt><dd><strong>' + (b.total_to_confirm ? 'a confirmar' : mzn(b.total_estimate)) + '</strong></dd></dl></section>' +
          '<section><h3>Cliente</h3><dl class="dl"><dt>Nome</dt><dd>' + esc(b.customer_name) + '</dd><dt>Telefone</dt><dd><a href="tel:' + esc(b.customer_phone) + '">' + esc(b.customer_phone) + '</a></dd><dt>E-mail</dt><dd>' + (b.customer_email ? '<a href="mailto:' + esc(b.customer_email) + '">' + esc(b.customer_email) + '</a>' : '—') + '</dd></dl>' +
            (b.customer_message ? '<p class="note" style="margin-top:10px">' + esc(b.customer_message) + '</p>' : '') + '<p style="margin-top:10px"><a class="btn btn--sm btn--ghost" href="' + wa + '" target="_blank" rel="noopener"><i class="bx bxl-whatsapp"></i> WhatsApp</a></p></section>' +
          (b.finance ? '<section><h3>Pagamento</h3><dl class="dl"><dt>Situação</dt><dd>' + badge(b.finance.status) + '</dd><dt>Facturado (FT)</dt><dd>' + mzn(b.finance.invoiced, true) + '</dd><dt>Pago (confirmado)</dt><dd>' + mzn(b.finance.paid, true) + '</dd><dt>Em dívida</dt><dd><strong>' + mzn(b.finance.balance, true) + '</strong></dd>' + (b.finance.awaiting ? '<dt>Por verificar</dt><dd>' + b.finance.awaiting + '</dd>' : '') + '</dl></section>' : '') +
          '<section><h3>Histórico</h3><ul class="timeline">' + b.events.slice(-5).reverse().map(function (e) {
            var txt = e.type === 'created' ? 'Pedido registado' : e.type === 'status_changed' ? 'Estado: ' + esc(LABEL[e.data.from]) + ' → ' + esc(LABEL[e.data.to]) + (e.data.note ? ' — ' + esc(e.data.note) : '') : e.type === 'note' ? esc(e.data.text) : esc(e.type);
            return '<li><time>' + dt(e.created_at) + ' · ' + esc(e.actor) + '</time>' + txt + '</li>';
          }).join('') + '</ul></section></div>' +
        '<div class="drawer__foot"><a class="btn btn--primary" href="#/reservas/' + esc(b.reference) + '">Abrir reserva completa <i class="bx bx-right-arrow-alt"></i></a><button class="btn btn--ghost" type="button" data-drawer-close>Fechar</button></div>';
      $('.drawer__head [data-drawer-close]', dr).focus();   // foco mantém-se no painel depois de carregar
      $$('[data-dto]', dr).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var to = btn.dataset.dto;
          dialog('Mudar estado para «' + LABEL[to] + '»', '<div class="field"><label>Nota' + (to === 'cancelada' ? '<span class="req" aria-hidden="true">*</span> <span class="opt">(motivo obrigatório)</span>' : ' <span class="opt">(opcional)</span>') + '</label><textarea name="note" rows="3"></textarea></div>' + (to !== 'pedido' ? NOTIFY_BOX : ''), 'Confirmar', to === 'cancelada').then(function (v) {
            if (!v) return;
            busy(btn, api('POST', '/bookings/' + b.reference + '/status', { status: to, note: v.note, notify: !!v.notify })).then(function (r2) {
              if (!r2.ok) return toast(errMsg(r2), true);
              toastMail('Estado actualizado.', r2);
              refreshCounts();
              if (onChange) onChange();
              openBooking(b.reference, drawerFrom, onChange);
            });
          });
        });
      });
    });
  }
  function closeDrawer(instant) {
    var dr = $('[data-drawer]');
    if (!dr || dr.hidden) return;
    dr.dataset.open = 'false';
    $$('tr.is-selected').forEach(function (x) { x.classList.remove('is-selected'); });
    var back = drawerFrom; drawerFrom = null;
    setTimeout(function () { dr.hidden = true; dr.innerHTML = ''; }, instant ? 0 : 280);
    if (!instant && back && back.focus) back.focus();
  }
  document.addEventListener('click', function (e) { if (e.target.closest('[data-drawer-close]')) closeDrawer(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('[data-drawer]').dataset.open === 'true' && !$('[data-dialog]').open) closeDrawer(); });

  /* ── Pesquisa global (Ctrl+K ou /): reservas, clientes, facturas e páginas ── */
  function openPalette() {
    if (!S.me) return;
    var pal = $('[data-palette]');
    pal.innerHTML = '<div class="palette__input"><i class="bx bx-search" aria-hidden="true"></i><input type="search" placeholder="Pesquisar reservas, clientes, facturas ou páginas…" aria-label="Pesquisar" data-pq role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" autocomplete="off"><kbd>Esc</kbd></div>' +
      '<div class="palette__results" id="pal-list" role="listbox" data-pr></div><div class="palette__foot"><span><kbd>↑</kbd> <kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div>';
    pal.showModal();
    var input = $('[data-pq]', pal), res = $('[data-pr]', pal), items = [], sel = 0, t, token = 0;
    var pages = [];
    NAV.forEach(function (g) { g[1].forEach(function (n) { if (can(n[3])) pages.push({ icon: n[1], label: n[2], sub: g[0], href: n[0] }); }); });
    if (can('bookings.create')) pages.unshift({ icon: 'bx-plus', label: 'Novo pedido', sub: 'Acção', action: newBooking });
    function render(groups) {
      items = [];
      res.innerHTML = groups.filter(function (g) { return g[1].length; }).map(function (g) {
        return '<div class="palette__group">' + esc(g[0]) + '</div>' + g[1].map(function (x) {
          items.push(x);
          return '<a class="palette__item" role="option" id="pal-' + (items.length - 1) + '" data-i="' + (items.length - 1) + '" href="' + esc(x.href || '#') + '"><i class="bx ' + x.icon + '" aria-hidden="true"></i><span>' + esc(x.label) + '</span><small>' + esc(x.sub || '') + '</small></a>';
        }).join('');
      }).join('') || emptyState('bx-search', 'Sem resultados', 'Tente a referência (MCA-…), o nome, o telefone ou o e-mail.');
      sel = 0; mark();
    }
    function mark() { $$('.palette__item', res).forEach(function (a, i) { a.setAttribute('aria-selected', String(i === sel)); if (i === sel) { input.setAttribute('aria-activedescendant', a.id); a.scrollIntoView({ block: 'nearest' }); } }); }
    function go(i) { var x = items[i]; if (!x) return; pal.close(); if (x.action) x.action(); else location.hash = x.href; }
    function search() {
      var q = input.value.trim(), ql = q.toLowerCase();
      var pg = pages.filter(function (p) { return !ql || p.label.toLowerCase().indexOf(ql) !== -1; });
      if (q.length < 2) return render([['Ir para', pg]]);
      var my = ++token;
      fetch('/api/admin/search?q=' + encodeURIComponent(q), { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (d) {
        if (my !== token) return;
        render([
          ['Reservas', (d.bookings || []).map(function (b) { return { icon: 'bx-calendar-check', label: b.reference + ' · ' + b.item_name, sub: b.customer_name + ' · ' + (LABEL[b.status] || b.status) + ' · ' + date(b.date), href: '#/reservas/' + b.reference }; })],
          ['Clientes', (d.customers || []).map(function (c) { return { icon: 'bx-user', label: c.name, sub: c.email + (c.phone ? ' · ' + c.phone : ''), href: '#/clientes?q=' + encodeURIComponent(c.email) }; })],
          ['Facturas', (d.invoices || []).map(function (i) { return { icon: 'bx-receipt', label: (i.number || 'Rascunho') + ' · ' + (i.customer || ''), sub: (LABEL[i.doc_type] || i.doc_type) + ' · ' + mzn(i.total, true), href: '#/facturas/' + i.id }; })],
          ['Ir para', pg]
        ]);
      }).catch(function () {});
    }
    input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(search, 180); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); go(sel); }
    });
    res.addEventListener('click', function (e) { var a = e.target.closest('[data-i]'); if (a) { e.preventDefault(); go(+a.dataset.i); } });
    pal.addEventListener('click', function (e) { if (e.target === pal) pal.close(); });
    search();
    input.focus();
  }
  document.addEventListener('click', function (e) { if (e.target.closest('[data-search-open]')) openPalette(); });
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!$('[data-palette]').open) openPalette(); }
    else if (e.key === '/' && !typing && !$('[data-palette]').open && !$('[data-dialog]').open) { e.preventDefault(); openPalette(); }
  });

  /* ── Experiências: catálogo (rascunho → publicar) e desempenho real ── */
  function thumb(src, cls) {
    if (!src) return '<span class="' + (cls || 'xthumb') + ' xthumb--none" aria-hidden="true"><i class="bx bx-image"></i></span>';
    var p = String(src).replace(/^\.\.\//, '/');
    var opt = p.indexOf('/assets/images/') === 0 ? '/assets/images/_opt/' + p.slice(15).replace(/\.[a-z0-9]+$/i, '') + '-480.webp' : p;
    return '<img class="' + (cls || 'xthumb') + '" src="' + esc(opt) + '" data-fallback="' + esc(p) + '" alt="" loading="lazy" decoding="async">';
  }
  /* Foto ainda sem variantes optimizadas (carregada mas não publicada): mostra o original */
  document.addEventListener('error', function (e) { var t = e.target; if (t && t.tagName === 'IMG' && t.dataset.fallback && t.getAttribute('src') !== t.dataset.fallback) t.src = t.dataset.fallback; }, true);
  function slugify(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); }
  function itemUrl(kind, id) { return (kind === 'stay' ? '/alojamentos/' : '/tours/') + id + '/'; }
  var CHANGE = { novo: 'Novo · por publicar', alterado: 'Alterado · por publicar', removido: 'Retirado · por publicar' };

  function experiences() {
    var edit = can('catalog.edit'), stats = can('bookings.view');
    if (!edit && !stats) return denied('bookings.view');
    Promise.all([stats ? api('GET', '/experiences') : null, edit ? api('GET', '/catalog/items') : null]).then(function (res) {
      var rs = res[0], rc = res[1], bad = [rs, rc].filter(function (x) { return x && !x.ok; })[0];
      if (bad) { view.innerHTML = emptyState('bx-error-circle', 'Não foi possível carregar', errMsg(bad)); return; }
      var perf = {};
      if (rs) rs.data.items.forEach(function (i) { perf[i.id] = i; });
      var all = rc ? rc.data.items : rs.data.items;   // com edição: o rascunho (inclui pacotes ainda não publicados)
      var draft = rc ? rc.data.draft : null, canPub = rc && rc.data.can_publish, kind = '', q = '', pending = false;
      var names = {}; all.forEach(function (i) { names[i.id] = i.name; });
      var head = edit ? '<div class="page-head"><p>Textos, preços, regras e fotos do site. As alterações ficam em <strong>rascunho</strong> e só chegam ao site (e aos preços das reservas) quando forem publicadas.</p>' +
        '<div class="row">' + (canPub ? '<button type="button" class="btn btn--ghost" data-hist><i class="bx bx-history"></i> Versões anteriores</button>' : '') + '<button type="button" class="btn btn--primary" data-new><i class="bx bx-plus"></i> Novo pacote</button></div></div>' : '';
      var bar = !draft ? '<p class="note" style="margin-bottom:14px"><i class="bx bx-info-circle"></i> Só leitura: a edição do catálogo exige a permissão «Editar experiências». Desempenho calculado a partir das reservas reais dos últimos 90 dias.</p>'
        : draft.changes ? '<section class="publish-bar" aria-label="Alterações por publicar"><i class="bx bx-edit-alt" aria-hidden="true"></i><div><strong>' + draft.changes + (draft.changes === 1 ? ' alteração por publicar' : ' alterações por publicar') + '</strong>' +
          '<span>' + esc(draft.items.map(function (id) { return id === '_categories' ? 'Categorias' : names[id] || id; }).join(' · ')) + (draft.updated_by ? ' — última edição por ' + esc(draft.updated_by) + ', ' + dt(draft.updated_at) : '') + '</span></div>' +
          '<div class="row"><button type="button" class="btn btn--sm btn--danger" data-discard>Descartar</button>' + (canPub ? '<button type="button" class="btn btn--primary" data-publish><i class="bx bx-upload"></i> Publicar no site</button>' : '<span class="muted">Um administrador tem de publicar.</span>') + '</div></section>'
        : '<p class="note" style="margin-bottom:14px"><i class="bx bx-check-circle"></i> Sem alterações por publicar: o site mostra a versão publicada.</p>';
      view.innerHTML = head + bar + '<div class="toolbar"><div class="input-icon"><i class="bx bx-search" aria-hidden="true"></i><input type="search" placeholder="Procurar experiência ou local" aria-label="Procurar experiência" data-eq></div>' +
        '<div class="chips">' + [['', 'Todas'], ['tour', 'Experiências'], ['stay', 'Alojamentos']].map(function (x) { return '<button class="chip" data-kind="' + x[0] + '" aria-pressed="' + (x[0] === kind) + '">' + x[1] + '</button>'; }).join('') +
        (draft && draft.changes ? '<button class="chip" data-pending aria-pressed="false">Por publicar <b>' + draft.changes + '</b></button>' : '') + '</div></div><div data-elist></div>' +
        (stats ? '<p class="muted" style="margin-top:10px">Pedidos, confirmadas e canceladas: últimos 90 dias. Próximas: reservas confirmadas com data a partir de hoje.</p>' : '');
      function draw() {
        var list = all.filter(function (i) { return (!kind || i.kind === kind) && (!pending || i.change) && (!q || (i.name + ' ' + (i.location || '') + ' ' + i.id).toLowerCase().indexOf(q) !== -1); });
        $('[data-elist]').innerHTML = list.length ? '<div class="table-wrap"><table><thead><tr><th scope="col">Experiência</th><th scope="col" class="hide-sm">Tipo</th><th scope="col" class="num">Preço desde</th>' +
          (stats ? '<th scope="col" class="num hide-md">Mínimo</th><th scope="col" class="num">Pedidos</th><th scope="col" class="num hide-md">Confirmadas</th><th scope="col" class="num hide-md">Canceladas</th><th scope="col" class="num">Próximas</th><th scope="col" class="hide-md">Último pedido</th>' : '<th scope="col" class="num hide-sm">Fotos</th>') +
          '<th scope="col">Estado</th>' + (edit && stats ? '<th scope="col"><span class="sr-only">Acções</span></th>' : '') + '</tr></thead><tbody>' +
          list.map(function (i) {
            var p = perf[i.id] || {};
            return '<tr data-href="' + (edit ? '#/experiencias/' + encodeURIComponent(i.id) : '#/reservas?item=' + encodeURIComponent(i.id)) + '"><td><div class="xname">' + (edit ? thumb(i.image) : '') + '<div><strong>' + esc(i.name) + '</strong><span class="cell-sub">' + esc(i.location || '') + '</span></div></div></td><td class="hide-sm">' + (i.kind === 'stay' ? 'Alojamento' : 'Experiência') + '</td>' +
              '<td class="num" data-v="' + i.price_from + '">' + (i.price_from ? mzn(i.price_from) : '—') + (i.price_label ? '<span class="cell-sub">' + esc(i.price_label) + '</span>' : '') + '</td>' +
              (stats ? '<td class="num hide-md">' + (p.min_people ? p.min_people + ' pax' : p.min_nights ? p.min_nights + ' noites' : '—') + '</td><td class="num">' + (p.requests || 0) + '</td><td class="num hide-md">' + (p.confirmed || 0) + '</td><td class="num hide-md">' + (p.cancelled || 0) + '</td><td class="num">' + (p.upcoming || 0) + '</td><td class="hide-md" data-v="' + esc(p.last_request || '') + '">' + (p.last_request ? date(p.last_request) : '—') + '</td>' : '<td class="num hide-sm">' + i.photos + '</td>') +
              '<td><div class="badges">' + (i.active ? '<span class="badge badge--confirmado">Activa</span>' : '<span class="badge badge--arquivado">Indisponível</span>') + (i.change ? '<span class="badge badge--pendente">' + esc(CHANGE[i.change] || i.change) + '</span>' : '') + '</div></td>' +
              (edit && stats ? '<td class="num"><a class="btn btn--sm btn--ghost" href="#/reservas?item=' + encodeURIComponent(i.id) + '">Reservas</a></td>' : '') + '</tr>';
          }).join('') + '</tbody></table></div>' : emptyState('bx-compass', 'Nenhuma experiência encontrada', '');
      }
      $('[data-eq]').addEventListener('input', function (e) { q = e.target.value.trim().toLowerCase(); draw(); });
      $$('[data-kind]').forEach(function (b) { b.addEventListener('click', function () { kind = b.dataset.kind; $$('[data-kind]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); draw(); }); });
      var pb = $('[data-pending]'); if (pb) pb.addEventListener('click', function () { pending = !pending; pb.setAttribute('aria-pressed', String(pending)); draw(); });
      draw();
      if (!draft) return;
      $('[data-new]').addEventListener('click', function () { newItem(rc.data.categories); });
      var hb = $('[data-hist]'); if (hb) hb.addEventListener('click', catalogHistory);
      var db = $('[data-discard]');
      if (db) db.addEventListener('click', function () {
        dialog('Descartar o rascunho', '<p>As alterações por publicar (' + draft.changes + ') são apagadas e o rascunho volta a ser igual ao site. As fotos carregadas continuam guardadas no servidor.</p>', 'Descartar', true).then(function (v) {
          if (v) busy(db, api('POST', '/catalog/discard', {})).then(function (r) { if (!r.ok) return toast(errMsg(r), true); toast('Rascunho descartado.'); route(); });
        });
      });
      var pub = $('[data-publish]');
      if (pub) pub.addEventListener('click', function () {
        dialog('Publicar no site', '<p>Vai publicar: <strong>' + esc(draft.items.map(function (id) { return names[id] || id; }).join(', ')) + '</strong>.</p>' +
          '<ul class="muted plain-list"><li>O site público é regenerado (pode demorar até um minuto).</li><li>As novas reservas passam a usar os preços e regras publicados; as reservas já feitas não mudam.</li><li>A versão actual fica guardada em «Versões anteriores».</li></ul>', 'Publicar').then(function (v) {
          if (!v) return;
          busy(pub, api('POST', '/catalog/publish', {})).then(function (r) {
            if (r.ok) { toast('Publicado no site em ' + String(r.data.seconds).replace('.', ',') + ' s.'); route(); return; }
            if (r.data.error !== 'publish_failed') return toast(errMsg(r), true);
            dialog('A publicação falhou', '<p class="note note--warn">' + (r.data.restored ? 'O site <strong>não foi alterado</strong>: a versão anterior foi reposta automaticamente.' : '<strong>Atenção:</strong> não foi possível confirmar a reposição da versão anterior. Contacte o suporte técnico.') + ' O rascunho foi mantido.</p>' +
              '<details><summary>Detalhes técnicos</summary><pre class="log">' + esc(r.data.log || '') + '</pre></details>', 'Fechar');
          });
        });
      });
    });
  }

  function newItem(cats) {
    dialog('Novo pacote',
      '<div class="field"><label>Tipo</label><select name="kind" data-nk><option value="tour">Experiência / tour</option><option value="stay">Alojamento</option></select></div>' +
      '<div class="field"><label>Nome <span class="req" aria-hidden="true">*</span></label><input name="name" required maxlength="120" autocomplete="off" data-nn></div>' +
      '<div class="field" data-ncat><label>Categoria</label><select name="category">' + cats.filter(function (c) { return c.id !== 'island-accommodation'; }).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.pt) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Endereço da página</label><input name="slug" maxlength="60" autocomplete="off" spellcheck="false" data-ns><span class="help" data-nurl></span></div>' +
      '<p class="note">O pacote é criado <strong>desactivado</strong>. Complete textos, preço e fotos, active-o e publique. O endereço não pode ser mudado depois.</p><p class="error" data-nerr role="alert" hidden></p>', 'Criar pacote');
    var d = $('[data-dialog]'), form = $('form', d), touched = false;
    form.noValidate = true;
    function sync() {
      var k = $('[data-nk]', d).value, s = $('[data-ns]', d);
      $('[data-ncat]', d).hidden = k === 'stay';
      if (!touched) s.value = slugify($('[data-nn]', d).value);
      $('[data-nurl]', d).textContent = 'mozcampadventures.co.mz' + itemUrl(k, s.value || '…');
    }
    $('[data-nk]', d).addEventListener('change', sync);
    $('[data-nn]', d).addEventListener('input', sync);
    $('[data-ns]', d).addEventListener('input', function (e) { touched = e.target.value !== ''; e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); sync(); });
    sync();
    form.addEventListener('submit', function (e) {
      if (!e.submitter || e.submitter.value !== 'ok') return;
      e.preventDefault();
      var err = $('[data-nerr]', d), v = { kind: form.kind.value, name: form.name.value.trim(), category: form.category.value, slug: slugify(form.slug.value) };
      if (!v.name) { err.textContent = 'Indique o nome.'; err.hidden = false; form.name.focus(); return; }
      busy(e.submitter, api('POST', '/catalog/items', v)).then(function (r) {
        if (!r.ok) { err.textContent = errMsg(r); err.hidden = false; return; }
        d.close('done');
        toast('Pacote criado (desactivado). Complete-o e active-o.');
        location.hash = '#/experiencias/' + r.data.id;
      });
    });
  }

  function catalogHistory() {
    api('GET', '/catalog/history').then(function (r) {
      if (!r.ok) return toast(errMsg(r), true);
      var v = r.data.versions;
      dialog('Versões anteriores', v.length ? '<p class="muted">Cada publicação guarda a versão que substituiu (as últimas 20). Carregar uma versão coloca-a no rascunho para rever: o site só muda quando publicar.</p>' +
        '<div class="table-wrap"><table data-nosort><thead><tr><th scope="col">Substituída em</th><th scope="col">Publicação de</th><th scope="col">Alterações publicadas</th><th scope="col"><span class="sr-only">Acções</span></th></tr></thead><tbody>' +
        v.map(function (x) { return '<tr><td>' + dt(x.created_at) + '</td><td>' + esc(x.by || '—') + '</td><td>' + esc((x.replaced_by || []).join(', ')) + '</td><td><button type="button" class="btn btn--sm btn--ghost" data-restore="' + esc(x.id) + '">Carregar</button></td></tr>'; }).join('') + '</tbody></table></div>'
        : emptyState('bx-history', 'Ainda não há versões anteriores', 'São criadas a cada publicação.'), 'Fechar');
      var d = $('[data-dialog]');
      $$('[data-restore]', d).forEach(function (b) {
        b.addEventListener('click', function () {
          if (!window.confirm('Substituir o rascunho actual por esta versão? (O site não muda até publicar.)')) return;
          busy(b, api('POST', '/catalog/history/' + b.dataset.restore + '/restore', {})).then(function (r2) {
            if (!r2.ok) return toast(errMsg(r2), true);
            d.close('done'); toast('Versão carregada no rascunho. Reveja e publique.'); route();
          });
        });
      });
    });
  }

  /* ── Editor de um pacote (#/experiencias/<id>) ── */
  var FIELD = { name: ['Nome', 'geral'], category: ['Categoria', 'geral'], description: ['Descrição curta', 'geral'], price_from: ['Preço desde', 'precos'], price_old: ['Preço antigo', 'precos'], price_child: ['Preço criança', 'precos'],
    gallery: ['Galeria', 'galeria'], 'rules.minPeople': ['Mínimo de participantes', 'precos'], 'rules.maxPeople': ['Máximo de participantes', 'precos'], 'rules.minNights': ['Mínimo de noites', 'precos'], 'rules.pricing': ['Forma de cobrança', 'precos'], 'rules.nightRates': ['Tarifas por noites', 'precos'] };
  var FIELD_ERR = { required: 'obrigatório', invalid: 'valor inválido', required_to_activate: 'obrigatório para activar o pacote', invalid_photo: 'há uma foto inválida', below_min: 'não pode ser menor que o mínimo' };
  var OPT_NAME = { boat: ['Barco', 'privateBoatOptions'], extra: ['Extra', 'extras'], transfer: ['Transfer', 'privateTransferOptions'] };
  var UPLOAD_ERR = { photo_too_large: 'Foto demasiado grande (máx. 8 MB).', photo_invalid_type: 'Formato não suportado (use JPEG, PNG ou WebP).', photo_too_small: 'Foto pequena demais (mín. 600×400 px).', photo_too_big_dimensions: 'Foto com dimensões excessivas.', gallery_full: 'A galeria já tem 40 fotos.', photo_missing: 'Ficheiro em falta.' };

  function experienceEdit(m) {
    if (!can('catalog.edit')) return denied('catalog.edit');
    api('GET', '/catalog/items/' + m[1]).then(function (r) {
      if (!r.ok) { view.innerHTML = emptyState('bx-error-circle', r.status === 404 ? 'Pacote não encontrado' : 'Não foi possível carregar', r.status === 404 ? '' : errMsg(r)); return; }
      editor(m[1], r.data);
    });
  }

  function editor(id, data) {
    var isStay = data.kind === 'stay', st, tab = 'geral', lang = 'pt', dirty = false, errors = {}, reg = {}, uploading = [];
    function load(d) {
      data = d;
      st = { item: d.item, en: Array.isArray(d.en) ? {} : d.en, rules: Array.isArray(d.rules) ? {} : d.rules };
      st.item.price_old = st.item.priceOld ? +String(st.item.priceOld).replace(/\D/g, '') || null : null;
      ['gallery', 'itinerary', 'privateBoatOptions', 'extras', 'privateTransferOptions', 'menu'].forEach(function (k) { if (!Array.isArray(st.item[k])) st.item[k] = []; });
    }
    load(data);
    var TABS = [['geral', 'Geral'], ['precos', 'Preços e regras'], ['conteudo', 'Conteúdo'], ['itinerario', 'Itinerário'], isStay ? null : ['opcoes', 'Opções e menu'], ['galeria', 'Galeria']].filter(Boolean);
    var cats = data.categories.filter(function (c) { return c.id !== 'island-accommodation'; }).map(function (c) { return [c.id, c.pt]; });

    view.innerHTML = '<div class="ed-head" data-edhead></div><div class="ed-errors" data-ederr role="alert" hidden></div>' +
      '<div class="ed-bar"><div class="tabs" data-tabs>' + TABS.map(function (t) { return '<button type="button" class="chip" data-tab="' + t[0] + '">' + t[1] + (t[0] === 'galeria' ? ' <b data-gcount></b>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="segmented" data-langs role="group" aria-label="Língua do texto"><button type="button" data-lang="pt">Português</button><button type="button" data-lang="en">English</button></div></div>' +
      '<form class="card ed-panel" data-edform novalidate></form>' +
      '<div class="savebar"><span class="savebar__state" data-dstate aria-live="polite"></span><a class="btn btn--ghost" href="#/experiencias">Voltar à lista</a><button type="button" class="btn btn--primary" data-save><i class="bx bx-save"></i> Guardar rascunho</button></div>';
    var form = $('[data-edform]');

    function head() {
      var it = st.item;
      $('[data-title]').textContent = it.name || id;
      document.title = (it.name || id) + ' · Painel | Moz Camp Adventures';
      $('[data-edhead]').innerHTML = thumb(it.image, 'ed-head__img') + '<div class="ed-head__txt"><h2>' + esc(it.name || id) + '</h2><div class="badges">' +
        (it.disabled ? '<span class="badge badge--arquivado">Indisponível no site</span>' : '<span class="badge badge--confirmado">Activa</span>') +
        (data.change ? '<span class="badge badge--pendente">' + esc(CHANGE[data.change] || data.change) + '</span>' : '') + (data.published ? '' : '<span class="badge">Ainda não publicado</span>') +
        '<span class="muted">' + esc(itemUrl(data.kind, id)) + '</span></div></div>' +
        (data.published ? '<a class="btn btn--ghost btn--sm" href="' + itemUrl(data.kind, id) + '" target="_blank" rel="noopener"><i class="bx bx-link-external"></i> Ver no site</a>' : '');
      $('[data-gcount]').textContent = it.gallery.length;
    }
    function setDirty(v) {
      dirty = v;
      $('[data-dstate]').innerHTML = v ? '<i class="bx bxs-circle"></i> Alterações por guardar' : data.change ? 'Guardado no rascunho · <a href="#/experiencias">publicar na lista</a>' : 'Sem alterações';
      $('[data-dstate]').classList.toggle('is-dirty', v);
    }
    S.leave = function () { return !dirty || window.confirm('Há alterações por guardar neste pacote. Sair sem guardar?'); };
    S.dirty = function () { return dirty; };
    S.save = function () { save($('[data-save]')); };

    /* Campo simples. o.tr = traduzível (em «English» escreve em en.json; o texto PT aparece como sugestão) */
    function F(key, label, o) {
      o = o || {};
      if (lang === 'en' && !o.tr) return '';
      var scope = o.scope || (lang === 'en' ? 'en' : 'item'), obj = st[scope], val = obj[key], t = o.t || 'text';
      var errKey = (scope === 'rules' ? 'rules.' : '') + key, err = scope !== 'en' && errors[errKey], fid = 'ed-' + scope + '-' + key;
      var ph = scope === 'en' ? fmtVal(st.item[key], t) : o.ph || '';
      var a = ' id="' + fid + '" data-b="' + key + '" data-s="' + scope + '" data-t="' + t + '"' + (o.inv ? ' data-inv' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (err ? ' aria-invalid="true"' : '');
      if (t === 'bool') return '<label class="check"><input type="checkbox"' + a + ((o.inv ? !val : val) ? ' checked' : '') + '> <span>' + esc(label) + (o.help ? '<span class="help">' + esc(o.help) + '</span>' : '') + '</span></label>';
      var ctl = t === 'select' ? '<select' + a + '>' + o.options.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(val == null ? '' : val) === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>'
        : t === 'lines' || t === 'paras' || t === 'area' ? '<textarea rows="' + (o.rows || 4) + '"' + a + '>' + esc(fmtVal(val, t)) + '</textarea>'
        : '<input type="' + (t === 'num' ? 'number' : 'text') + '"' + (t === 'num' ? ' min="0" step="1" inputmode="numeric"' : '') + a + ' value="' + esc(val == null ? '' : val) + '">';
      return '<div class="field' + (o.wide ? ' field--wide' : '') + '"><label for="' + fid + '">' + esc(label) + (o.req && scope !== 'en' ? ' <span class="req" aria-hidden="true">*</span>' : '') + (scope === 'en' ? ' <span class="lang-tag">EN</span>' : '') + '</label>' + ctl +
        (o.help ? '<span class="help">' + esc(o.help) + '</span>' : '') + (err ? '<span class="field-error">' + esc(FIELD_ERR[err] || err) + '</span>' : '') + '</div>';
    }
    function fmtVal(v, t) { if (v == null) return ''; if (t === 'lines') return [].concat(v).join('\n'); if (t === 'paras') return [].concat(v).join('\n\n'); return String(v); }
    function readVal(el) {
      var t = el.dataset.t;
      if (t === 'bool') return el.hasAttribute('data-inv') ? !el.checked : el.checked;
      if (t === 'num') return el.value === '' ? null : +el.value;
      if (t === 'lines') return el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (t === 'paras') return el.value.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      return el.value;
    }
    /* Listas (itinerário, barcos, extras, transfers, menu): linhas com subir/descer/remover; o registo liga cada lista ao array do estado */
    function listEd(key, arr, spec, o) {
      reg[key] = { arr: arr, make: o.make };
      return '<div class="rep">' + arr.map(function (row, i) {
        return '<div class="rep__row"><div class="rep__head"><strong>' + esc(o.label) + ' ' + (i + 1) + '</strong>' + (o.fixed ? '' : '<div class="row">' +
          '<button type="button" class="icon-btn icon-btn--sm" data-mv="-1" data-rk="' + key + '" data-ri="' + i + '" aria-label="Subir ' + esc(o.label) + ' ' + (i + 1) + '"' + (i ? '' : ' disabled') + '><i class="bx bx-chevron-up"></i></button>' +
          '<button type="button" class="icon-btn icon-btn--sm" data-mv="1" data-rk="' + key + '" data-ri="' + i + '" aria-label="Descer ' + esc(o.label) + ' ' + (i + 1) + '"' + (i < arr.length - 1 ? '' : ' disabled') + '><i class="bx bx-chevron-down"></i></button>' +
          '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-rm data-rk="' + key + '" data-ri="' + i + '" aria-label="Remover ' + esc(o.label) + ' ' + (i + 1) + '"><i class="bx bx-trash"></i></button></div>') + '</div>' +
          '<div class="form-grid form-grid--' + (o.cols || 2) + '">' + spec.map(function (s) { return cell(key, i, row, s, o.ph && o.ph[i]); }).join('') + '</div>' + (o.inner ? o.inner(row, i) : '') + '</div>';
      }).join('') + (o.fixed ? '' : '<button type="button" class="btn btn--ghost btn--sm" data-add="' + key + '"><i class="bx bx-plus"></i> ' + esc(o.add) + '</button>') + '</div>';
    }
    function cell(key, i, row, s, phRow) {
      var f = s[0], t = s[2] || 'text', fid = 'ed-' + key.replace(/\W/g, '-') + '-' + i + '-' + f, v = row[f], ph = phRow ? fmtVal(phRow[f], t) : '';
      var err = errors[s[4] && s[4].replace('#', i)];
      var a = ' id="' + fid + '" data-rk="' + key + '" data-ri="' + i + '" data-rf="' + f + '" data-t="' + t + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (err ? ' aria-invalid="true"' : '');
      if (t === 'bool') return '<label class="check"><input type="checkbox"' + a + (v ? ' checked' : '') + '> ' + esc(s[1]) + '</label>';
      var ctl = t === 'lines' || t === 'area' ? '<textarea rows="3"' + a + '>' + esc(fmtVal(v, t)) + '</textarea>' : '<input type="' + (t === 'num' ? 'number' : 'text') + '"' + (t === 'num' ? ' min="0" step="1" inputmode="numeric"' : '') + a + ' value="' + esc(v == null ? '' : v) + '">';
      return '<div class="field' + (s[3] ? ' ' + s[3] : '') + '"><label for="' + fid + '">' + esc(s[1]) + (lang === 'en' ? ' <span class="lang-tag">EN</span>' : '') + '</label>' + ctl + (err ? '<span class="field-error">' + esc(FIELD_ERR[err] || err) + '</span>' : '') + '</div>';
    }
    /* Em «English», as opções ligam-se pelo id às entradas de en.json (criadas quando se escreve) */
    function enOptions(k) {
      if (!Array.isArray(st.en[k])) st.en[k] = [];
      return st.item[k].filter(function (o) { return o.id; }).map(function (o) {
        var e = st.en[k].filter(function (x) { return x.id === o.id; })[0];
        if (!e) { e = { id: o.id }; st.en[k].push(e); }
        return e;
      });
    }
    function startEn(k, make) { return '<p class="muted">Sem tradução: o site em inglês mostra o texto em português.</p><button type="button" class="btn btn--ghost btn--sm" data-starten="' + k + '"><i class="bx bx-globe"></i> Traduzir ' + make + '</button>'; }

    function section(title, html, help) { return html ? '<section class="ed-sec"><h3>' + esc(title) + '</h3>' + (help ? '<p class="muted">' + help + '</p>' : '') + html + '</section>' : ''; }
    function renderTab() {
      reg = {};
      var it = st.item, en = lang === 'en', h = '';
      if (tab === 'geral') {
        h = section('Identificação', '<div class="form-grid form-grid--2">' + F('name', 'Nome', { tr: 1, req: 1, max: 120 }) + F('subtitle', 'Subtítulo', { tr: 1, max: 160, ph: 'Ex.: Inhaca · Ilha dos Portugueses' }) +
            (isStay ? F('locationCategory', 'Zona', { t: 'select', options: [['machangulo', 'Machangulo'], ['inhaca', 'Inhaca']] }) : F('category', 'Categoria', { t: 'select', options: cats })) +
            F('location', 'Local / ponto de partida', { max: 120 }) + (isStay ? '' : F('destinations', 'Destinos', { max: 80, ph: 'Ex.: 3 destinos' })) + F('duration', 'Duração', { tr: 1, max: 80, ph: isStay ? 'Ex.: Mínimo 2 noites' : 'Ex.: Dia inteiro' }) +
            F('badge', 'Etiqueta de destaque', { tr: 1, max: 40, help: 'Ex.: Popular. Vazio = sem etiqueta.' }) + F('stars', 'Estrelas (0 a 5)', { t: 'num' }) + '</div>') +
          section('Descrição', F('description', 'Descrição curta', { tr: 1, t: 'area', rows: 3, max: 400, req: 1, help: 'Aparece nos cartões e no Google (cerca de 160 caracteres são mostrados).' })) +
          (en ? '' : section('Visibilidade', F('disabled', 'Visível no site e aberto a reservas', { t: 'bool', inv: 1, help: 'Desactivado, o endereço mostra «indisponível» e não aceita reservas (o pacote nunca é apagado, para não perder o endereço nem o SEO). Para activar é preciso preço, descrição e pelo menos uma foto.' })));
      } else if (tab === 'precos') {
        h = section('Preço', '<div class="form-grid form-grid--2">' + F('price_from', 'Preço desde (MZN)', { t: 'num', req: 1 }) + F('price_old', 'Preço antigo, riscado (MZN)', { t: 'num', help: 'Opcional. Tem de ser maior que o preço.' }) +
            F('priceLabel', 'Unidade do preço', { tr: 1, max: 80, ph: isStay ? 'por pessoa / noite' : 'por adulto', help: 'Ex.: por adulto · por barco (até 8 pax)' }) + F('price_child', 'Preço criança (MZN)', { t: 'num', help: 'Vazio = sem preço de criança.' }) +
            F('priceChildLabel', 'Etiqueta do preço criança', { tr: 1, max: 80, ph: 'Crianças (4–12 anos)' }) + F('cancelPolicy', 'Cancelamento', { tr: 1, max: 120, ph: 'até 48h antes' }) + '</div>') +
          (en ? section('Reserva', F('bookingPeopleLabel', 'Etiqueta do campo de pessoas', { tr: 1, max: 60 })) :
          section('Regras de reserva', '<div class="form-grid form-grid--2">' +
            F('pricing', 'Forma de cobrança', { scope: 'rules', t: 'select', options: isStay ? [['', 'Por pessoa por noite'], ['per-unit-night', 'Por unidade (casa/quarto) por noite']] : [['', 'Por pessoa'], ['per-group', 'Preço fixo por grupo / barco']] }) +
            F('minPeople', 'Mínimo de participantes', { scope: 'rules', t: 'num', help: 'Abaixo do mínimo, o pedido é recusado no site.' }) + F('maxPeople', 'Máximo de participantes', { scope: 'rules', t: 'num' }) +
            (isStay ? F('minNights', 'Mínimo de noites', { scope: 'rules', t: 'num' }) : F('bookingPeopleLabel', 'Etiqueta do campo de pessoas', { tr: 1, max: 60, help: 'Vazio = «Adultos».' })) + '</div>' +
            (isStay ? nightRates() : ''), 'O servidor calcula o preço de cada pedido com estas regras.'));
      } else if (tab === 'conteudo') {
        h = section('Texto da página', F('detailText', 'Texto detalhado', { tr: 1, t: 'paras', rows: 9, help: 'Separe os parágrafos com uma linha em branco.' })) +
          section('Listas', (isStay ? F('features', 'Comodidades', { tr: 1, t: 'lines', rows: 5, help: 'Uma por linha. As três primeiras aparecem no cartão.' }) : '') +
            F('highlights', 'Destaques', { tr: 1, t: 'lines', rows: 5, help: 'Um por linha.' }) +
            '<div class="form-grid form-grid--2">' + F('includes', 'Inclui', { tr: 1, t: 'lines', rows: 6, help: 'Um por linha.' }) + F('excludes', 'Não inclui', { tr: 1, t: 'lines', rows: 6, help: 'Um por linha.' }) + '</div>') +
          section('Informações importantes', F('importantInfo', 'Informações importantes', { tr: 1, t: 'lines', rows: 6, help: 'Uma por linha: ponto de encontro, pagamento, cancelamento, condições…' }));
      } else if (tab === 'itinerario') {
        var stepSpec = [['time', 'Hora', 'text', 'field--narrow'], ['title', 'Título'], ['body', 'Descrição', 'area', 'field--wide'], ['checklist', 'Lista (uma por linha)', 'lines', 'field--wide']];
        h = en ? section('Itinerário em inglês', it.itinerary.length ? (Array.isArray(st.en.itinerary) && st.en.itinerary.length
              ? '<p class="muted">Ao traduzir o itinerário, traduza todos os passos: o site em inglês usa só esta lista.</p>' + listEd('en.itinerary', st.en.itinerary, stepSpec, { label: 'Passo', add: 'Passo', ph: it.itinerary, make: function () { return { time: '', title: '', body: '' }; } })
              : startEn('itinerary', 'o itinerário')) : '<p class="muted">Ainda não há itinerário em português.</p>')
          : section('Itinerário', listEd('itinerary', it.itinerary, stepSpec, { label: 'Passo', add: 'Adicionar passo', make: function () { return { time: '', title: '', body: '', checklist: [] }; } }), 'Os passos aparecem pela ordem desta lista.');
      } else if (tab === 'opcoes') {
        var boatSpec = [['title', 'Nome'], ['price', 'Preço (MZN)', 'num', '', 'boat.#.price'], ['desc', 'Descrição', 'text', 'field--wide'], ['capacity', 'Capacidade (pessoas)', 'num', '', 'boat.#.capacity']];
        var extraSpec = [['title', 'Nome'], ['price', 'Preço (MZN)', 'num', '', 'extra.#.price'], ['desc', 'Descrição', 'text', 'field--wide'], ['perPerson', 'Preço por pessoa', 'bool']];
        var trSpec = [['title', 'Nome'], ['price', 'Preço (MZN, por reserva)', 'num', '', 'transfer.#.price'], ['subtitle', 'Subtítulo', 'text', 'field--wide'], ['notes', 'Notas (uma por linha)', 'lines', 'field--wide']];
        var defTr = data.default_transfers && data.default_transfers.length && !it.privateTransferOptions.length ? '<p class="note">Sem transfers definidos aqui, a página usa os transfers padrão dos beach tours: ' + esc(data.default_transfers.map(function (t) { return t.pt.title + ' (' + mzn(t.price) + ')'; }).join(', ')) + '.</p>' : '';
        if (en) {
          var unsaved = ['privateBoatOptions', 'extras', 'privateTransferOptions'].some(function (k) { return it[k].some(function (o) { return !o.id; }); });
          h = (unsaved ? '<p class="note note--warn">Há opções novas por guardar: guarde o rascunho para as poder traduzir.</p>' : '') +
            section('Barcos privados', it.privateBoatOptions.length ? listEd('en.privateBoatOptions', enOptions('privateBoatOptions'), [['title', 'Nome'], ['desc', 'Descrição', 'text', 'field--wide']], { label: 'Barco', fixed: 1, ph: it.privateBoatOptions.filter(function (o) { return o.id; }) }) + F('boatSelectionLabel', 'Título da escolha de barco', { tr: 1 }) + F('boatSelectionDescription', 'Texto da escolha de barco', { tr: 1, t: 'area', rows: 2 }) : '') +
            section('Extras', it.extras.length ? listEd('en.extras', enOptions('extras'), [['title', 'Nome'], ['desc', 'Descrição', 'text', 'field--wide']], { label: 'Extra', fixed: 1, ph: it.extras.filter(function (o) { return o.id; }) }) : '') +
            section('Transfers privados', it.privateTransferOptions.length ? listEd('en.privateTransferOptions', enOptions('privateTransferOptions'), [['title', 'Nome'], ['subtitle', 'Subtítulo', 'text', 'field--wide'], ['notes', 'Notas (uma por linha)', 'lines', 'field--wide']], { label: 'Transfer', fixed: 1, ph: it.privateTransferOptions.filter(function (o) { return o.id; }) }) : '') +
            section('Menu', it.menu.length ? (Array.isArray(st.en.menu) && st.en.menu.length ? menuEd('en.menu', st.en.menu, it.menu) : startEn('menu', 'o menu')) : '');
          if (!it.privateBoatOptions.length && !it.extras.length && !it.privateTransferOptions.length && !it.menu.length) h = emptyState('bx-globe', 'Nada para traduzir', 'Este pacote não tem barcos, extras, transfers nem menu.');
        } else {
          h = section('Barcos privados', listEd('privateBoatOptions', it.privateBoatOptions, boatSpec, { label: 'Barco', add: 'Adicionar barco', make: function () { return { title: '', desc: '', price: null, capacity: null }; } }) +
              (it.privateBoatOptions.length ? F('boatSelectionRequired', 'Escolha de barco obrigatória na reserva', { t: 'bool', help: 'Para pacotes cobrados por barco (ex.: pesca).' }) + '<div class="form-grid form-grid--2">' + F('boatSelectionLabel', 'Título da escolha de barco', { tr: 1, max: 120 }) + F('boatSelectionDescription', 'Texto da escolha de barco', { tr: 1, max: 400 }) + '</div>' : ''), 'Opção de barco exclusivo, com preço por barco.') +
            section('Extras', listEd('extras', it.extras, extraSpec, { label: 'Extra', add: 'Adicionar extra', make: function () { return { title: '', desc: '', price: null, perPerson: false }; } }), 'Serviços opcionais somados ao total (ex.: massagem, transfer hotel–marina).') +
            section('Transfers privados', defTr + listEd('privateTransferOptions', it.privateTransferOptions, trSpec, { label: 'Transfer', add: 'Adicionar transfer', make: function () { return { title: '', subtitle: '', price: null, notes: [] }; } })) +
            section('Menu', menuEd('menu', it.menu), 'Para pacotes com refeição (ex.: barbecue). Cada menu tem secções com pratos.');
        }
      } else if (tab === 'galeria') {
        h = gallery();
      }
      form.innerHTML = h;
      form.onclick = null;
      $$('[data-tab]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === tab)); });
      $$('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === lang)); });
      $('[data-langs]').hidden = tab === 'galeria';
      form.classList.toggle('is-en', en);
      if (tab === 'galeria') bindGallery();
    }
    function menuEd(key, menus, ph) {
      return listEd(key, menus, [['title', 'Título do menu', 'text', 'field--wide']], { label: 'Menu', add: 'Adicionar menu', cols: 1, ph: ph, make: function () { return { title: '', categories: [{ name: '', items: [] }] }; },
        inner: function (m, i) { if (!Array.isArray(m.categories)) m.categories = []; return '<div class="rep rep--inner">' + listEd(key + '.' + i + '.categories', m.categories, [['name', 'Secção'], ['items', 'Pratos (um por linha)', 'lines', 'field--wide']], { label: 'Secção', add: 'Adicionar secção', ph: ph && ph[i] && ph[i].categories, make: function () { return { name: '', items: [] }; } }) + '</div>'; } });
    }
    function nightRates() {
      var nr = st.rules.nightRates || {}, rows = Object.keys(nr).map(function (n) { return { nights: +n, adult: nr[n][0], child: nr[n][1] }; });
      st._nr = rows;
      return '<div class="ed-sub"><h4>Tarifas por número de noites</h4><p class="muted">Total por pessoa para a estadia (adulto e criança). Acima da última tarifa, cada noite adicional soma a tarifa de 1 noite.</p>' +
        listEd('_nr', rows, [['nights', 'Noites', 'num'], ['adult', 'Adulto (MZN)', 'num'], ['child', 'Criança (MZN)', 'num']], { label: 'Tarifa', add: 'Adicionar tarifa', cols: 3, make: function () { return { nights: rows.length + 1, adult: null, child: null }; } }) +
        (errors['rules.nightRates'] ? '<span class="field-error">Tarifas: ' + esc(FIELD_ERR[errors['rules.nightRates']]) + '</span>' : '') + '</div>';
    }
    function syncNightRates() {
      if (!st._nr) return;
      var o = {};
      st._nr.forEach(function (r) { if (r.nights) o[String(r.nights)] = [r.adult, r.child]; });
      st.rules.nightRates = o;
    }

    /* Galeria: ordem = ordem na página (a 1.ª é o topo da página); «Cartão» = foto dos cartões e da partilha */
    function gallery() {
      var it = st.item, g = it.gallery;
      return '<div class="gal-drop" data-drop><i class="bx bx-cloud-upload" aria-hidden="true"></i><div><strong>Arraste fotos para aqui</strong> ou <label class="link-btn">escolha ficheiros<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-file class="sr-only"></label>' +
        '<span class="muted">JPEG, PNG ou WebP, mínimo 600×400 px. Fotos grandes são reduzidas a 2400 px antes do envio (e perdem os dados de localização do telemóvel).</span></div></div>' +
        (errors.gallery ? '<p class="field-error">Galeria: ' + esc(FIELD_ERR[errors.gallery] || errors.gallery) + '</p>' : '') +
        (g.length || uploading.length ? '<ul class="gal" data-gal>' + g.map(function (src, i) {
          var card = src === it.image;
          return '<li class="gal__item" draggable="true" data-gi="' + i + '"><div class="gal__img">' + thumb(src, 'gal__photo') + '<div class="gal__tags">' + (i === 0 ? '<span class="tag tag--dark">Topo da página</span>' : '') + (card ? '<span class="tag">Cartão</span>' : '') + '</div><span class="gal__n">' + (i + 1) + '</span></div>' +
            '<div class="gal__act"><button type="button" class="icon-btn icon-btn--sm" data-gmv="-1" data-gi="' + i + '" aria-label="Mover foto ' + (i + 1) + ' para trás"' + (i ? '' : ' disabled') + '><i class="bx bx-chevron-left"></i></button>' +
            '<button type="button" class="icon-btn icon-btn--sm" data-gmv="1" data-gi="' + i + '" aria-label="Mover foto ' + (i + 1) + ' para a frente"' + (i < g.length - 1 ? '' : ' disabled') + '><i class="bx bx-chevron-right"></i></button>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-gtop="' + i + '"' + (i ? '' : ' disabled') + '>Topo</button><button type="button" class="btn btn--sm btn--ghost" data-gcard="' + i + '"' + (card ? ' disabled' : '') + '>Cartão</button>' +
            '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-grm="' + i + '" aria-label="Retirar foto ' + (i + 1) + ' da galeria"><i class="bx bx-trash"></i></button></div></li>';
        }).join('') + uploading.map(function (u) { return '<li class="gal__item is-up"><div class="gal__img"><span class="spin" aria-hidden="true"></span></div><div class="gal__act"><span class="muted">A enviar ' + esc(u) + '…</span></div></li>'; }).join('') + '</ul>'
          : emptyState('bx-image-add', 'Ainda sem fotos', 'Carregue pelo menos uma foto para poder activar o pacote.')) +
        '<p class="muted" style="margin-top:12px">Arraste as fotos para mudar a ordem. «Retirar» tira a foto da galeria (o ficheiro fica guardado, para poder repor versões anteriores). As fotos novas são optimizadas para o site quando publicar.</p>';
    }
    function bindGallery() {
      var it = st.item, drop = $('[data-drop]'), dragFrom = null;
      $('[data-file]').addEventListener('change', function (e) { upload(e.target.files); e.target.value = ''; });
      ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { if (dragFrom === null) { e.preventDefault(); drop.classList.add('is-over'); } }); });
      ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('is-over'); }); });
      drop.addEventListener('drop', function (e) { if (dragFrom === null && e.dataTransfer.files.length) { e.preventDefault(); upload(e.dataTransfer.files); } });
      $$('.gal__item[draggable]').forEach(function (li) {
        li.addEventListener('dragstart', function (e) { dragFrom = +li.dataset.gi; e.dataTransfer.effectAllowed = 'move'; li.classList.add('is-drag'); });
        li.addEventListener('dragend', function () { dragFrom = null; li.classList.remove('is-drag'); });
        li.addEventListener('dragover', function (e) { if (dragFrom !== null) e.preventDefault(); });
        li.addEventListener('drop', function (e) { if (dragFrom === null) return; e.preventDefault(); moveTo(dragFrom, +li.dataset.gi); });
      });
      function moveTo(a, b) { if (a === b) return; var x = it.gallery.splice(a, 1)[0]; it.gallery.splice(b, 0, x); changed(); renderTab(); }
      form.onclick = function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.gmv) { var i = +b.dataset.gi; moveTo(i, i + +b.dataset.gmv); focusAfter('[data-gi="' + (i + +b.dataset.gmv) + '"][data-gmv="' + b.dataset.gmv + '"]'); }
        else if (b.dataset.gtop) { moveTo(+b.dataset.gtop, 0); }
        else if (b.dataset.gcard) { it.image = it.gallery[+b.dataset.gcard]; changed(); renderTab(); head(); }
        else if (b.dataset.grm) {
          var src = it.gallery.splice(+b.dataset.grm, 1)[0];
          if (it.image === src) it.image = it.gallery[0] || '';
          changed(); renderTab(); head();
        }
      };
    }
    function focusAfter(sel) { var el = $(sel, form); if (el && !el.disabled) el.focus(); }
    /* Redução no browser (máx. 2400 px, JPEG): ficheiros leves e sem metadados (GPS) */
    function prepare(file) {
      if (!window.createImageBitmap) return Promise.resolve(file);
      return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bmp) {
        var s = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
        if (s === 1 && file.type !== 'image/jpeg' && file.size < 4e6) return file;
        var c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
        return new Promise(function (res) { c.toBlob(function (b) { res(b ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.88); });
      }).catch(function () { return file; });
    }
    function upload(files) {
      var okN = 0;
      var list = Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type); });
      if (!list.length) return toast('Escolha ficheiros de imagem (JPEG, PNG ou WebP).', true);
      list.forEach(function (f) { uploading.push(f.name); });
      renderTab();
      list.reduce(function (p, file) {
        return p.then(function () { return prepare(file); }).then(function (blob) {
          var fd = new FormData(); fd.append('photo', blob, blob.name || file.name);
          return fetch('/api/admin/catalog/items/' + encodeURIComponent(id) + '/photos', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': S.csrf, Accept: 'application/json' }, body: fd })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
            .catch(function () { return { ok: false, data: { error: 'network' } }; });
        }).then(function (r) {
          uploading.splice(uploading.indexOf(file.name), 1);
          if (r.ok) {
            okN++;
            if (errors.gallery) { delete errors.gallery; showErrors(); }
            st.item.gallery.push(r.data.path);
            if (!st.item.image) st.item.image = r.data.path;
            data.change = data.change || 'alterado';
          } else toast(file.name + ': ' + (UPLOAD_ERR[r.data.error] || errMsg(r)), true);
          if (tab === 'galeria') renderTab();
          head();
        });
      }, Promise.resolve()).then(function () { if (okN && okN === list.length) toast(okN === 1 ? 'Foto carregada para o rascunho.' : okN + ' fotos carregadas para o rascunho.'); });
    }

    function changed() { setDirty(true); }
    form.addEventListener('input', function (e) {
      var el = e.target;
      if (el.dataset.b) {
        st[el.dataset.s][el.dataset.b] = readVal(el);
        if (el.dataset.b === 'name' && el.dataset.s === 'item') head();
      } else if (el.dataset.rk && reg[el.dataset.rk]) {
        reg[el.dataset.rk].arr[+el.dataset.ri][el.dataset.rf] = readVal(el);
        if (el.dataset.rk === '_nr') syncNightRates();
      } else return;
      el.removeAttribute('aria-invalid');
      changed();
    });
    form.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || tab === 'galeria') return;
      var r = b.dataset.rk && reg[b.dataset.rk], i = +b.dataset.ri;
      if (b.dataset.add && reg[b.dataset.add]) { reg[b.dataset.add].arr.push(reg[b.dataset.add].make()); }
      else if (r && b.hasAttribute('data-rm')) { r.arr.splice(i, 1); }
      else if (r && b.dataset.mv) { var j = i + +b.dataset.mv; r.arr.splice(j, 0, r.arr.splice(i, 1)[0]); }
      else if (b.dataset.starten === 'itinerary') { st.en.itinerary = st.item.itinerary.map(function (s) { return { time: s.time || '', title: '', body: '', checklist: [] }; }); }
      else if (b.dataset.starten === 'menu') { st.en.menu = st.item.menu.map(function (m) { return { title: '', categories: (m.categories || []).map(function () { return { name: '', items: [] }; }) }; }); }
      else return;
      if (b.dataset.rk === '_nr' || b.dataset.add === '_nr') syncNightRates();
      changed(); renderTab();
      if (b.dataset.mv) focusAfter('[data-rk="' + b.dataset.rk + '"][data-ri="' + (i + +b.dataset.mv) + '"][data-mv="' + b.dataset.mv + '"]');
    });
    $$('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { tab = b.dataset.tab; renderTab(); }); });
    $$('[data-lang]').forEach(function (b) { b.addEventListener('click', function () { lang = b.dataset.lang; renderTab(); }); });

    function showErrors() {
      var keys = Object.keys(errors), box = $('[data-ederr]');
      box.hidden = !keys.length;
      if (!keys.length) return;
      box.innerHTML = '<i class="bx bx-error-circle" aria-hidden="true"></i><div><strong>Corrija antes de guardar:</strong><ul>' + keys.map(function (k) {
        var f = FIELD[k], m = k.match(/^(boat|extra|transfer)\.(\d+)\.(\w+)$/);
        if (m) f = [OPT_NAME[m[1]][0] + ' ' + (+m[2] + 1) + ' — ' + (m[3] === 'price' ? 'preço' : 'capacidade'), 'opcoes'];
        f = f || [k, 'geral'];
        return '<li><button type="button" class="link-btn" data-goto="' + f[1] + '">' + esc(f[0]) + '</button>: ' + esc(FIELD_ERR[errors[k]] || errors[k]) + '</li>';
      }).join('') + '</ul></div>';
      $$('[data-goto]', box).forEach(function (b) { b.addEventListener('click', function () { tab = b.dataset.goto; lang = 'pt'; renderTab(); var el = $('[aria-invalid=true]', form) || $('.field-error', form); if (el) { el.scrollIntoView({ block: 'center' }); if (el.focus) el.focus(); } }); });
      box.scrollIntoView({ block: 'nearest' });
    }
    /* Ids das opções novas (ligam a opção à reserva e à tradução) */
    function prepIds() {
      ['privateBoatOptions', 'extras', 'privateTransferOptions'].forEach(function (k) {
        var used = {};
        st.item[k].forEach(function (o) { if (o.id) used[o.id] = 1; });
        st.item[k].forEach(function (o) { if (!o.id && o.title) { var b = slugify(o.title) || 'opcao', s = b, n = 2; while (used[s]) s = b + '-' + n++; o.id = s; used[s] = 1; } });
      });
    }
    function save(btn) {
      prepIds();
      if (st.item.gallery.length) st.item.heroImage = st.item.gallery[0];
      busy(btn, api('POST', '/catalog/items/' + encodeURIComponent(id), { item: st.item, en: st.en, rules: st.rules })).then(function (r) {
        if (!r.ok) {
          if (r.data.error === 'validation_failed') { errors = r.data.fields || {}; showErrors(); renderTab(); toast('Há campos por corrigir.', true); return; }
          return toast(errMsg(r), true);
        }
        errors = {}; showErrors();
        load(r.data); head(); renderTab(); setDirty(false);
        toast('Rascunho guardado. Publique na lista de experiências para actualizar o site.');
      });
    }
    $('[data-save]').addEventListener('click', function (e) { save(e.currentTarget); });
    head(); renderTab(); setDirty(false);
  }

  /* ── Tabelas ordenáveis (no ecrã): clique no cabeçalho; números, datas e valores MZN ── */
  function cellValue(td) {
    if (!td) return '';
    if (td.dataset.v !== undefined) return isNaN(+td.dataset.v) || td.dataset.v === '' ? td.dataset.v : +td.dataset.v;
    var t = td.textContent.trim();
    var dm = t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s*(\d{2}):(\d{2}))?/);
    if (dm) return +new Date(+dm[3], +dm[2] - 1, +dm[1], +(dm[4] || 0), +(dm[5] || 0));
    var nm = t.replace(/\s*MZN$/, '').match(/^-?[\d.]+(,\d+)?$/);
    if (nm) return +t.replace(/\s*MZN$/, '').replace(/\./g, '').replace(',', '.');
    return t.toLowerCase();
  }
  function enhanceTables(root) {
    $$('table:not([data-nosort]):not([data-enhanced])', root).forEach(function (table) {
      var head = table.tHead && table.tHead.rows[0], body = table.tBodies[0];
      if (!head || !body || body.rows.length < 2 || table.closest('[data-lines]')) return;
      table.setAttribute('data-enhanced', '');
      Array.prototype.forEach.call(head.cells, function (th, idx) {
        if (!th.textContent.trim()) return;
        th.setAttribute('data-sort', ''); th.tabIndex = 0; th.setAttribute('aria-sort', 'none');
        var sortBy = function () {
          var asc = th.getAttribute('aria-sort') !== 'ascending';
          Array.prototype.forEach.call(head.cells, function (x) { if (x.hasAttribute('data-sort')) x.setAttribute('aria-sort', 'none'); });
          th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
          var rows = Array.prototype.slice.call(body.rows);
          rows.sort(function (a, b) { var x = cellValue(a.cells[idx]), y = cellValue(b.cells[idx]); return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1); });
          rows.forEach(function (r) { body.appendChild(r); });
        };
        th.addEventListener('click', sortBy);
        th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(); } });
      });
    });
  }
  /* Liga cada <label> de .field ao seu campo (for/id), para leitores de ecrã e clique na etiqueta */
  var fieldSeq = 0;
  function linkLabels(root) {
    $$('.field', root).forEach(function (fl) {
      var label = $('label', fl), ctl = $('input:not([type=checkbox]):not([type=radio]), select, textarea', fl);
      if (!label || !ctl || label.htmlFor) return;
      if (!ctl.id) ctl.id = 'fld-' + (++fieldSeq);
      label.htmlFor = ctl.id;
    });
  }
  new MutationObserver(function () { enhanceTables(view); linkLabels(view); }).observe(view, { childList: true, subtree: true });
  new MutationObserver(function () { linkLabels($('[data-dialog]')); }).observe($('[data-dialog]'), { childList: true, subtree: true });

  /* ── Arranque ──────────────────────────────────────── */
  if ((location.hash || '').indexOf('#/definir-senha') === 0) { route(); return; }
  api('GET', '/me').then(function (r) { if (r.ok) start(r.data); else showAuth('login'); });
})();
