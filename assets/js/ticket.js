/**
 * MOZ CAMP ADVENTURES — ticket.js
 * Ticket do pedido de reserva: dados da reserva + QR code com o link pessoal
 * da área do cliente (/reserva/#r=…&t=…). Usado no fim do pedido (site.js) e
 * na área do cliente (client.js). Não é factura nem recibo (esses são
 * documentos fiscais emitidos pela equipa).
 * Depende de /assets/vendor/qrcode/qrcode.js (qrcode-generator, MIT).
 */
(function () {
  'use strict';

  var TXT = {
    pt: {
      title: 'Ticket do pedido', ref: 'Referência', exp: 'Experiência', date: 'Data', people: 'Participantes', name: 'Nome', issued: 'Pedido em',
      adults: function (n) { return n === 1 ? '1 adulto' : n + ' adultos'; }, children: function (n) { return n === 1 ? '1 criança' : n + ' crianças'; },
      total: 'Total estimado', toConfirm: 'a confirmar', qr: 'Leia o código para acompanhar o pedido', qrAlt: 'QR code com o link da reserva',
      st: { pedido: 'Pedido recebido — aguarda confirmação', confirmada: 'Reserva confirmada', concluida: 'Concluída', cancelada: 'Cancelada' },
      note: 'Este ticket não é uma factura nem um recibo. A reserva só fica confirmada depois de a equipa confirmar a disponibilidade e o pagamento.',
      print: 'Imprimir / guardar PDF', locale: 'pt-PT'
    },
    en: {
      title: 'Booking request ticket', ref: 'Reference', exp: 'Experience', date: 'Date', people: 'Participants', name: 'Name', issued: 'Requested on',
      adults: function (n) { return n === 1 ? '1 adult' : n + ' adults'; }, children: function (n) { return n === 1 ? '1 child' : n + ' children'; },
      total: 'Estimated total', toConfirm: 'to be confirmed', qr: 'Scan the code to follow your request', qrAlt: 'QR code with the booking link',
      st: { pedido: 'Request received — awaiting confirmation', confirmada: 'Booking confirmed', concluida: 'Completed', cancelada: 'Cancelled' },
      note: 'This ticket is not an invoice or a receipt. The booking is only confirmed once our team confirms availability and payment.',
      print: 'Print / save as PDF', locale: 'en-GB'
    }
  };

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function mzn(n) { return Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' MZN'; }
  function day(v, L) { return v ? new Date(String(v).slice(0, 10) + 'T00:00:00').toLocaleDateString(L.locale, { day: 'numeric', month: 'long', year: 'numeric' }) : '—'; }

  function qrSvg(url, L) {
    if (!url || typeof window.qrcode !== 'function') return '';
    var q = window.qrcode(0, 'M');
    q.addData(url);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true, title: L.qrAlt });
  }

  /**
   * b: { reference, status, item, service_date | checkin+checkout, adults, children, name, lines, total, to_confirm, created, url, lang }
   * Devolve o HTML do ticket e do botão de impressão.
   */
  function html(b) {
    var L = TXT[b.lang === 'en' ? 'en' : 'pt'];
    var when = b.service_date ? day(b.service_date, L) : day(b.checkin, L) + ' → ' + day(b.checkout, L);
    var people = L.adults(b.adults) + (b.children ? ' · ' + L.children(b.children) : '');
    var issued = b.created ? new Date(String(b.created).replace(' ', 'T')) : new Date();
    var status = b.status || 'pedido';
    var row = function (k, v) { return '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>'; };
    return '<article class="ticket" data-ticket data-qr="' + esc(b.url || '') + '">' +
      '<header class="ticket__head"><img src="/assets/images/logo/logo_moz_camp_adventures.webp" alt="" width="52" height="52">' +
        '<div><strong>Moz Camp Adventures</strong><small>Marina, Escola Náutica · Maputo</small></div><span class="ticket__label">' + esc(L.title) + '</span></header>' +
      '<p class="ticket__status ticket__status--' + esc(status) + '">' + esc(L.st[status] || status) + '</p>' +
      '<div class="ticket__main">' +
        '<dl class="ticket__data"><div class="ticket__ref"><dt>' + esc(L.ref) + '</dt><dd data-reference>' + esc(b.reference) + '</dd></div>' +
          row(L.exp, b.item) + row(L.date, when) + row(L.people, people) + (b.name ? row(L.name, b.name) : '') +
          row(L.issued, issued.toLocaleString(L.locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })) + '</dl>' +
        (b.url ? '<figure class="ticket__qr">' + qrSvg(b.url, L) + '<figcaption>' + esc(L.qr) + '</figcaption></figure>' : '') +
      '</div>' +
      '<div class="ticket__cut" aria-hidden="true"></div>' +
      '<div class="summary">' + (b.lines || []).map(function (l) {
        return '<div><span>' + esc(l.label) + '</span><span>' + (l.amount === null || l.amount === undefined ? esc(l.note || L.toConfirm) : mzn(l.amount)) + '</span></div>';
      }).join('') +
      '<div class="summary__total"><span>' + esc(L.total) + '</span><span>' + (b.to_confirm ? esc(L.toConfirm) : mzn(b.total)) + '</span></div></div>' +
      '<p class="ticket__note">' + esc(L.note) + '</p>' +
      '<footer class="ticket__foot">+258 84 440 6543 · booking@mozcampadventures.co.mz · mozcampadventures.co.mz</footer>' +
    '</article>' +
    '<button type="button" class="btn-x btn-x--ghost btn-x--block ticket__print" data-ticket-print><i class="bx bx-printer"></i> ' + esc(L.print) + '</button>';
  }

  /* Imprime só o ticket: cópia num contentor directo do <body>, o resto da página fica escondido
     (ver @media print em site.css). No telemóvel, a impressão permite «Guardar como PDF». */
  function cleanup() {
    document.documentElement.classList.remove('is-printing-ticket');
    var box = document.getElementById('ticket-print');
    if (box) box.remove();
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-ticket-print]');
    if (!btn) return;
    var src = btn.previousElementSibling && btn.previousElementSibling.matches('[data-ticket]') ? btn.previousElementSibling : document.querySelector('[data-ticket]');
    if (!src) return;
    cleanup();
    var box = document.createElement('div');
    box.id = 'ticket-print';
    box.appendChild(src.cloneNode(true));
    document.body.appendChild(box);
    document.documentElement.classList.add('is-printing-ticket');
    window.print();
  });
  window.addEventListener('afterprint', cleanup);

  window.MCATicket = { html: html };
})();
