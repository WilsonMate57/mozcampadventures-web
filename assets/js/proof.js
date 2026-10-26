/**
 * MOZ CAMP ADVENTURES — proof.js
 * Página /pagamento/#t=<token>: o cliente vê o saldo da sua factura e envia
 * o comprovativo. Cria um pagamento «declarado», que só conta depois de a
 * equipa confirmar a entrada dos fundos.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-proof]');
  if (!root) return;
  var token = (location.hash.match(/t=([a-f0-9]{48})/) || [])[1];
  var $ = function (s) { return root.querySelector(s); };
  function fmt(n) { return Number(n || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ |\s/g, '.') + ' MZN'; }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function fail() { $('[data-proof-loading]').hidden = true; $('[data-proof-error]').hidden = false; }
  if (!token) return fail();

  var MSG = {
    proof_too_large: 'O ficheiro tem mais de 5 MB. / File is larger than 5 MB.',
    proof_invalid_type: 'Use um PDF, JPG ou PNG. / Please use a PDF, JPG or PNG.',
    proof_missing: 'Escolha o ficheiro do comprovativo. / Please choose the proof file.',
    duplicate_payment: 'Esta transacção já foi registada. / This transaction was already submitted.',
    invalid_amount: 'Indique o valor pago. / Please enter the amount paid.',
    invalid_paid_on: 'Indique uma data válida (até hoje). / Please enter a valid date.',
    invalid_method: 'Escolha o método. / Please choose the method.',
    too_many_requests: 'Demasiados envios. Tente mais tarde ou use o WhatsApp. / Too many attempts.',
    invalid_link: 'O link expirou. / The link has expired.'
  };

  fetch('/api/proof/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token }) })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      $('[data-proof-loading]').hidden = true;
      $('[data-proof-body]').hidden = false;
      $('[data-f=invoice]').textContent = d.invoice;
      $('[data-f=total]').textContent = fmt(d.total);
      $('[data-f=paid]').textContent = fmt(d.paid);
      $('[data-f=balance]').textContent = fmt(d.balance);
      $('[data-f=methods]').innerHTML = d.methods.map(function (m) { return '<li><i class="bx bx-check"></i><span><strong>' + esc(m.label) + '</strong> — ' + esc(m.detail) + '</span></li>'; }).join('');
      var sel = $('#pf-method');
      sel.innerHTML = d.methods.map(function (m) { return '<option>' + esc(m.label) + '</option>'; }).join('');
      $('#pf-amount').value = d.balance > 0 ? d.balance : '';
      var today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
      $('#pf-date').max = today; $('#pf-date').value = today;
      if (d.balance <= 0) {
        $('[data-proof-form]').innerHTML = '<p class="notice"><i class="bx bx-check-circle"></i>Esta factura está liquidada. Obrigado! / This invoice is fully paid. Thank you!</p>';
      }
    })
    .catch(fail);

  var form = $('[data-proof-form]');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('[data-proof-msg]'), btn = form.querySelector('button[type=submit]');
    var file = form.proof.files[0];
    if (!file) { msg.className = 'form-msg is-err'; msg.textContent = MSG.proof_missing; return; }
    if (file.size > 5 * 1024 * 1024) { msg.className = 'form-msg is-err'; msg.textContent = MSG.proof_too_large; return; }
    var fd = new FormData(form);
    fd.append('token', token);
    btn.disabled = true;
    fetch('/api/proof', { method: 'POST', body: fd })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (res.ok) {
          form.innerHTML = '<div class="notice"><i class="bx bx-check-circle"></i><p><strong>Comprovativo recebido.</strong> A nossa equipa vai verificar a entrada dos fundos e enviar-lhe o recibo.<br><span lang="en">Proof received. Our team will verify the payment and send you a receipt.</span></p></div>';
          if (window.mcaTrack) window.mcaTrack('submit_payment_proof', {});
        } else {
          msg.className = 'form-msg is-err';
          msg.textContent = MSG[res.d.error] || 'Não foi possível enviar. Contacte-nos por WhatsApp. / Could not send. Please contact us on WhatsApp.';
        }
      })
      .catch(function () { btn.disabled = false; msg.className = 'form-msg is-err'; msg.textContent = 'Erro de ligação. / Connection error.'; });
  });
})();
