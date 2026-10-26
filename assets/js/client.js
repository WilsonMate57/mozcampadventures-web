/**
 * MOZ CAMP ADVENTURES — client.js
 * Área do cliente (/reserva/ e /en/booking/): estado da reserva, facturas,
 * recibos e envio de comprovativo. O link (#r=REF&t=TOKEN) é uma assinatura
 * do servidor; só dá acesso aos documentos desta reserva. Os documentos são
 * pedidos por POST (o token não vai para logs nem URLs).
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-client]');
  if (!root) return;
  var en = root.dataset.lang === 'en';
  var p = new URLSearchParams(location.hash.slice(1));
  var cred = { ref: p.get('r') || '', token: p.get('t') || '' };
  var $ = function (s) { return root.querySelector(s); };
  var L = en
    ? { ref: 'Reference', exp: 'Experience', date: 'Date', people: 'People', status: 'Status', adults: 'adults', children: 'children', number: 'Number', total: 'Total', paid: 'Paid', balance: 'Balance', pay: 'Payment', pdf: 'PDF', none: 'None yet.', proof: 'Send proof of payment',
        st: { pedido: 'Request received — awaiting confirmation', confirmada: 'Confirmed', concluida: 'Completed', cancelada: 'Cancelled', emitida: 'Issued', anulada: 'Cancelled', emitido: 'Issued', anulado: 'Cancelled', pendente: 'Unpaid', parcial: 'Partly paid', pago: 'Paid', reembolsado: 'Refunded' }, FT: 'Invoice', PF: 'Pro-forma', locale: 'en-GB' }
    : { ref: 'Referência', exp: 'Experiência', date: 'Data', people: 'Pessoas', status: 'Estado', adults: 'adultos', children: 'crianças', number: 'Número', total: 'Total', paid: 'Pago', balance: 'Em dívida', pay: 'Pagamento', pdf: 'PDF', none: 'Ainda não há.', proof: 'Enviar comprovativo',
        st: { pedido: 'Pedido recebido — aguarda confirmação', confirmada: 'Confirmada', concluida: 'Concluída', cancelada: 'Cancelada', emitida: 'Emitida', anulada: 'Anulada', emitido: 'Emitido', anulado: 'Anulado', pendente: 'Por pagar', parcial: 'Parcialmente pago', pago: 'Pago', reembolsado: 'Reembolsado' }, FT: 'Factura', PF: 'Pró-forma', locale: 'pt-PT' };

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function mzn(n) { return Number(n || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ |\s/g, '.') + ' MZN'; }
  function d(v) { return v ? new Date(String(v).slice(0, 10) + 'T00:00:00').toLocaleDateString(L.locale, { day: 'numeric', month: 'long', year: 'numeric' }) : '—'; }
  function post(url, extra) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, cred, extra || {})) }); }
  function fail() { $('[data-c-loading]').hidden = true; $('[data-c-error]').hidden = false; $('[data-c-body]').hidden = true; }
  /* Tabela que, em ecrãs estreitos, vira cartões (etiqueta em data-label) */
  function table(head, rows) {
    var labelled = rows.map(function (r) { var i = 0; return r.replace(/<td/g, function () { return '<td data-label="' + esc(head[i++] || '') + '"'; }); });
    return '<div class="client-table"><table><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + labelled.join('') + '</tbody></table></div>';
  }

  if (!/^MCA-\d{4}-\d{5,}$/.test(cred.ref) || !/^[a-f0-9]{48}$/.test(cred.token)) return fail();

  post('/api/client/booking').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (data) {
    var b = data.booking;
    $('[data-c-loading]').hidden = true;
    $('[data-c-body]').hidden = false;
    var when = b.service_date ? d(b.service_date) : d(b.checkin) + ' → ' + d(b.checkout);
    $('[data-c-summary]').innerHTML =
      '<div><small>' + L.ref + '</small><strong>' + esc(b.reference) + '</strong></div><div><small>' + L.exp + '</small><strong>' + esc(b.item) + '</strong></div>' +
      '<div><small>' + L.date + '</small><strong>' + esc(when) + '</strong></div><div><small>' + L.status + '</small><strong data-c-status>' + esc(L.st[b.status] || b.status) + '</strong></div>';
    var inv = data.invoices;
    $('[data-c-invoices]').innerHTML = inv.length ? table([L.number, L.total, L.paid, L.balance, L.status, ''], inv.map(function (i) {
      var payable = i.type === 'FT' && i.status === 'emitida' && i.balance > 0;
      return '<tr><td><span><strong>' + esc(L[i.type]) + '</strong><br>' + esc(i.number) + '<br><small>' + d(i.date) + '</small></span></td><td>' + mzn(i.total) + '</td><td>' + (i.paid != null ? mzn(i.paid) : '—') + '</td><td>' + (i.balance != null ? mzn(i.balance) : '—') + '</td>' +
        '<td>' + esc(L.st[i.status === 'anulada' ? 'anulada' : (i.pay_status || i.status)] || i.status) + '</td><td class="client-actions"><button type="button" class="btn-x btn-x--ghost btn-x--sm" data-doc="invoice" data-id="' + i.id + '" data-name="' + esc(i.number) + '">' + L.pdf + '</button>' +
        (payable ? '<button type="button" class="btn-x btn-x--primary btn-x--sm" data-proof="' + i.id + '">' + L.proof + '</button>' : '') + '</td></tr>';
    })) : '<p class="muted">' + L.none + '</p>';
    $('[data-c-receipts]').innerHTML = data.receipts.length ? table([L.number, L.total, L.status, ''], data.receipts.map(function (rc) {
      return '<tr><td><span>' + esc(rc.number) + '<br><small>' + d(rc.date) + ' · ' + esc(rc.invoice) + '</small></span></td><td>' + mzn(rc.amount) + '</td><td>' + esc(L.st[rc.status]) + '</td><td><button type="button" class="btn-x btn-x--ghost btn-x--sm" data-doc="receipt" data-id="' + rc.id + '" data-name="' + esc(rc.number) + '">' + L.pdf + '</button></td></tr>';
    })) : '<p class="muted">' + L.none + '</p>';
  }).catch(fail);

  root.addEventListener('click', function (e) {
    var doc = e.target.closest('[data-doc]'), proof = e.target.closest('[data-proof]');
    if (doc) {
      doc.disabled = true;
      post('/api/client/document', { kind: doc.dataset.doc, id: +doc.dataset.id })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
        .then(function (blob) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = doc.dataset.name.replace(/\//g, '-') + '.pdf';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        })
        .catch(function () { alert(en ? 'Could not download the document.' : 'Não foi possível descarregar o documento.'); })
        .then(function () { doc.disabled = false; });
    }
    if (proof) {
      post('/api/client/proof-link', { id: +proof.dataset.proof }).then(function (r) { return r.json(); }).then(function (x) { if (x.link) location.href = x.link; });
    }
  });
})();
