/**
 * MOZ CAMP ADVENTURES — tests/payments.mjs
 * =====================================================
 * Pagamentos, saldos, recibos e comprovativos — SÓ em desenvolvimento.
 * Inclui os cenários A–F do caderno de encargos.
 *   API_BASE, PHP_CLI, MCA_CONFIG, PSQL (ver tests/admin.mjs)
 * =====================================================
 */

import { execSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const BASE = process.env.API_BASE || 'http://localhost:8791';
const ORIGIN = BASE;
const { PHP_CLI, PSQL } = process.env;
const results = [];
async function test(name, fn, expected) {
  try {
    const got = await fn();
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(expected)}`}`);
  } catch (e) { results.push(false); console.log(`FAIL  ${name}  → erro: ${e.message.split('\n')[0]}`); }
}
const sql = q => execSync(`${PSQL} -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sqlFails = q => { try { sql(q); return 'permitido'; } catch { return 'recusado'; } };
function client() {
  const c = { cookie: '', csrf: '' };
  c.call = async (method, path, body) => {
    const headers = { Origin: ORIGIN };
    if (c.cookie) headers.Cookie = c.cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['X-CSRF-Token'] = c.csrf;
    const r = await fetch(BASE + '/api/admin' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get('set-cookie');
    if (set && set.startsWith('mca_admin=')) c.cookie = set.split(';')[0];
    const type = r.headers.get('content-type') || '';
    const data = type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    if (data && data.csrf) c.csrf = data.csrf;
    return { status: r.status, data, type };
  };
  return c;
}
async function login(name, role) {
  const email = `${role}-pay-${randomUUID().slice(0, 6)}@teste.local`;
  const token = execSync(`${PHP_CLI} api/bin/create-user.php "${name}" ${email} ${role}`, { encoding: 'utf8' }).match(/token=([a-f0-9]{64})/)[1];
  await fetch(BASE + '/api/admin/setup-password', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: 'Pagamentos-2026' }) });
  const c = client();
  await c.call('POST', '/login', { email, password: 'Pagamentos-2026' });
  return c;
}
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

sql('TRUNCATE rate_limits');
const admin = await login('Admin Pagamentos', 'admin');
const mgr = await login('Gerente Pagamentos', 'gerente');

/** Factura FT emitida de exactamente $total MZN. */
async function invoiceOf(total, type = 'FT') {
  const b = await admin.call('POST', '/bookings', { item: 'maputo-city-tour', date: day(15), adults: 2, name: 'Cliente Pagamentos', phone: '+258 84 777 8888', email: 'pagador@example.com', channel: 'whatsapp' });
  const d = (await admin.call('POST', '/invoices', { booking: b.data.reference, type })).data.invoice;
  await admin.call('POST', `/invoices/${d.id}/draft`, { customer: { name: 'Cliente Pagamentos', email: 'pagador@example.com' }, lines: [{ description: 'Serviço de teste', qty: 1, unit_price: total }] });
  return (await admin.call('POST', `/invoices/${d.id}/issue`)).data.invoice;
}
const pay = (c, id, amount, extra = {}) => c.call('POST', `/invoices/${id}/payments`, { method: 'M-Pesa', amount, paid_on: today, reference: 'MP' + randomUUID().slice(0, 10), ...extra });
const bal = async id => (await admin.call('GET', `/invoices/${id}`)).data.invoice.balance;

/* ── Cenário A — pagamento parcial ───────────────────── */
const inv = await invoiceOf(30000);
const before = (await admin.call('GET', '/dashboard')).data;
const a = await pay(admin, inv.id, 10000, { confirm: true });
await test('A  30.000 + pagamento confirmado de 10.000 → «parcial», saldo 20.000', () => [a.status, a.data.balance.pay_status, a.data.balance.balance], [200, 'parcial', 20000]);
const rcA = a.data.payments[0];
await test('A2 recibo RC-AAAA/NNNN emitido automaticamente', () => [/^RC-\d{4}\/\d{4}$/.test(rcA.receipt_number), rcA.receipt_status], [true, 'emitido']);
const rcPdf = await admin.call('GET', `/receipts/${rcA.receipt_id}/pdf`);
await test('A3 PDF do recibo disponível e íntegro', () => [rcPdf.type, rcPdf.data.subarray(0, 5).toString(), createHash('sha256').update(rcPdf.data).digest('hex') === sql(`SELECT pdf_sha256 FROM receipts WHERE id=${rcA.receipt_id}`)], ['application/pdf', '%PDF-', true]);
(await import('node:fs')).writeFileSync('docs/visual-review/depois/recibo-exemplo.pdf', rcPdf.data);

/* ── Cenário B — liquidação ──────────────────────────── */
const b = await pay(admin, inv.id, 20000, { confirm: true, method: 'Nedbank' });
await test('B  + 20.000 confirmados → «pago», saldo 0', () => [b.data.balance.pay_status, b.data.balance.balance], ['pago', 0]);
await test('B2 recebido no resumo aumenta exactamente 30.000', async () => (await admin.call('GET', '/dashboard')).data.received_month - before.received_month, 30000);
await test('B3 pagamento acima do saldo é recusado (factura já paga)', async () => { const r = await pay(admin, inv.id, 1, { confirm: true }); return [r.status, r.data.error]; }, [422, 'exceeds_balance']);
await test('B4 a tentativa recusada não deixa registo pendente órfão', async () => [(await bal(inv.id)).awaiting, sql(`SELECT count(*) FROM payments WHERE invoice_id = ${inv.id}`)], [0, '2']);

/* ── Cenário C — comprovativo por verificar ──────────── */
const invC = await invoiceOf(30000);
const link = (await admin.call('POST', `/invoices/${invC.id}/proof-link`)).data.link;
const tok = link.split('#t=')[1];
const info = await fetch(BASE + '/api/proof/info', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok }) }).then(r => r.json());
await test('C0 link do cliente mostra a factura, o saldo e os métodos (sem dados pessoais)', () => [info.invoice, info.balance, info.name, info.methods.map(m => m.label), 'email' in info], [invC.number, 30000, 'Cliente', ['Nedbank', 'Millennium bim', 'M-Pesa'], false]);
const upload = async (fields, bytes, name = 'comprovativo.pdf', type = 'application/pdf') => {
  const fd = new FormData();
  Object.entries({ token: tok, method: 'M-Pesa', amount: '30000', paid_on: today, reference: 'MPC' + randomUUID().slice(0, 8), ...fields }).forEach(([k, v]) => fd.append(k, v));
  fd.append('proof', new Blob([bytes], { type }), name);
  const r = await fetch(BASE + '/api/proof', { method: 'POST', headers: { Origin: ORIGIN }, body: fd });
  return { status: r.status, data: await r.json() };
};
const proofRef = 'MPC-' + randomUUID().slice(0, 8);
const up = await upload({ reference: proofRef }, Buffer.from('%PDF-1.4\n% comprovativo de teste\n%%EOF'));
await test('C  comprovativo do cliente → «declarado»', () => [up.status, up.data.status], [201, 'declarado']);
await test('C2 com comprovativo pendente a factura NÃO passa a «pago»', async () => { const x = await bal(invC.id); return [x.pay_status, x.balance, x.awaiting]; }, ['pendente', 30000, 1]);
await test('C3 ficheiro com extensão .pdf mas conteúdo de texto → 415', async () => (await upload({}, Buffer.from('isto não é um pdf'))).status, 415);
await test('C4 ficheiro acima de 5 MB → 413', async () => (await upload({}, Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024 + 10)]))).status, 413);
const declared = (await admin.call('GET', `/invoices/${invC.id}`)).data.invoice.payments.find(p => p.reference === proofRef);
const proofFile = await admin.call('GET', `/payments/${declared.id}/proof`);
await test('C5 equipa vê o comprovativo no painel', () => [proofFile.status, proofFile.type], [200, 'application/pdf']);
await test('C6 gerente sem permissão de confirmar → 403', async () => (await mgr.call('POST', `/payments/${declared.id}/confirm`, {})).status, 403);
const conf = await admin.call('POST', `/payments/${declared.id}/confirm`, { note: 'Fundos verificados no extracto M-Pesa' });
await test('C7 após verificação e confirmação → «pago» e recibo', () => [conf.data.balance.pay_status, !!conf.data.payments.find(p => p.id === declared.id).receipt_number], ['pago', true]);

/* ── Cenário D — pagamento duplicado ─────────────────── */
const invD = await invoiceOf(50000);
const dupRef = 'BIM-' + randomUUID().slice(0, 8);
const d1 = await pay(admin, invD.id, 10000, { method: 'Millennium bim', reference: dupRef });
const d2 = await pay(admin, invD.id, 10000, { method: 'Millennium bim', reference: dupRef.toLowerCase() });
await test('D  mesma transacção (método + referência, sem distinguir maiúsculas) → 409', () => [d1.status, d2.status, d2.data.error], [200, 409, 'duplicate_payment']);
const twin = 'MP-' + randomUUID().slice(0, 8);
const both = await Promise.all([pay(admin, invD.id, 5000, { reference: twin }), pay(admin, invD.id, 5000, { reference: twin })]);
await test('D2 duplo envio simultâneo da mesma transacção → só um registo', () => [both.map(x => x.status).sort(), sql(`SELECT count(*) FROM payments WHERE reference='${twin}'`)], [[200, 409], '1']);
const pend = (await admin.call('GET', `/invoices/${invD.id}`)).data.invoice.payments.filter(p => p.status === 'em_verificacao');
await test('D3 pagamentos registados sem confirmação não contam', async () => (await bal(invD.id)).paid, 0);

/* concorrência: duas confirmações que, juntas, excederiam o saldo */
const invR = await invoiceOf(30000);
const p1 = (await pay(admin, invR.id, 20000)).data.payments[0].id;
const p2 = (await pay(admin, invR.id, 20000)).data.payments.find(p => p.id !== p1).id;
const race = await Promise.all([admin.call('POST', `/payments/${p1}/confirm`, {}), admin.call('POST', `/payments/${p2}/confirm`, {})]);
await test('D4 duas confirmações simultâneas de 20.000 numa factura de 30.000 → só uma passa', async () => [race.map(r => r.status).sort(), (await bal(invR.id)).paid], [[200, 422], 20000]);

const invR2 = await invoiceOf(30000);
const race2 = await Promise.all([pay(admin, invR2.id, 20000, { confirm: true }), pay(admin, invR2.id, 20000, { confirm: true })]);
await test('D5 dois registos+confirmação simultâneos que excedem o saldo → um passa, o outro recusado, nada pendente', async () => { const x = await bal(invR2.id); return [race2.map(r => r.status).sort(), x.paid, x.awaiting]; }, [[200, 422], 20000, 0]);

/* ── Cenário E — reversão e reembolso ────────────────── */
const rev = await admin.call('POST', `/payments/${b.data.payments.find(p => p.amount == 20000).id}/reverse`, { reason: 'Transferência devolvida pelo banco' });
await test('E  reversão autorizada → estado recalculado («parcial», saldo 20.000)', () => [rev.data.balance.pay_status, rev.data.balance.balance], ['parcial', 20000]);
const revd = rev.data.payments.find(p => p.status === 'revertido');
await test('E2 histórico preservado: pagamento «revertido», recibo «anulado», motivo e autor', () => [revd.reverse_reason, revd.receipt_status, revd.reversed_by_name], ['Transferência devolvida pelo banco', 'anulado', 'Admin Pagamentos']);
await test('E3 reversão sem motivo → 422', async () => (await admin.call('POST', `/payments/${rcA.id}/reverse`, { reason: '' })).data.error, 'reason_required');
await test('E4 valor de pagamento não pode ser alterado (BD)', () => sqlFails(`UPDATE payments SET amount = 1 WHERE id = ${rcA.id}`), 'recusado');
await test('E5 pagamentos não podem ser apagados (BD)', () => sqlFails(`DELETE FROM payments WHERE id = ${rcA.id}`), 'recusado');
await test('E6 pagamento revertido não volta a confirmado (BD)', () => sqlFails(`UPDATE payments SET status = 'confirmado' WHERE id = ${revd.id}`), 'recusado');
await test('E7 recibo não pode ser alterado nem apagado (BD)', () => [sqlFails(`UPDATE receipts SET amount = 1 WHERE id = ${rcA.receipt_id}`), sqlFails(`DELETE FROM receipts WHERE id = ${rcA.receipt_id}`)], ['recusado', 'recusado']);
await test('E8 reembolso acima do valor pago → 422', async () => (await admin.call('POST', `/invoices/${inv.id}/refunds`, { method: 'M-Pesa', amount: 10001, paid_on: today, notes: 'Cancelamento pelo cliente' })).data.error, 'refund_exceeds_paid');
const rf = await admin.call('POST', `/invoices/${inv.id}/refunds`, { method: 'M-Pesa', amount: 10000, paid_on: today, notes: 'Cancelamento pelo cliente' });
await test('E9 reembolso total → «reembolsado», pago 0', () => [rf.data.balance.pay_status, rf.data.balance.paid], ['reembolsado', 0]);
await test('E10 gerente sem permissão de reembolso → 403', async () => (await mgr.call('POST', `/invoices/${inv.id}/refunds`, { method: 'M-Pesa', amount: 1, paid_on: today, notes: 'teste x' })).status, 403);

/* ── Cenário F — acesso indevido ─────────────────────── */
const anonInv = await fetch(BASE + `/api/admin/invoices/${invC.id}`).then(r => r.status);
await test('F  factura de outro cliente sem sessão → 401', () => anonInv, 401);
const otherTok = await fetch(BASE + '/api/proof/info', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'a'.repeat(48) }) });
await test('F2 link de comprovativo inválido/de outra factura → 404', () => otherTok.status, 404);
const link2 = (await admin.call('POST', `/invoices/${invD.id}/proof-link`)).data.link.split('#t=')[1];
const infoD = await fetch(BASE + '/api/proof/info', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: link2 }) }).then(r => r.json());
await test('F3 cada link só dá acesso à sua própria factura', () => [infoD.invoice === invD.number, infoD.invoice !== invC.number], [true, true]);
const relink = await admin.call('POST', `/invoices/${invC.id}/proof-link`);
const oldTok = await fetch(BASE + '/api/proof/info', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok }) });
await test('F4 gerar novo link invalida o anterior', () => [relink.status, oldTok.status], [200, 404]);
await test('F5 comprovativo de outro cliente: só com sessão', async () => (await fetch(BASE + `/api/admin/payments/${declared.id}/proof`)).status, 401);

/* ── Regras complementares ───────────────────────────── */
await test('G1 factura com pagamentos não pode ser anulada', async () => (await admin.call('POST', `/invoices/${invC.id}/void`, { reason: 'Teste de anulação' })).data.error, 'invoice_has_payments');
const pf = await invoiceOf(10000, 'PF');
await test('G2 pagamentos só em facturas FT (não em pró-forma)', async () => (await pay(admin, pf.id, 100)).data.error, 'payments_only_on_ft');
await test('G3 método de pagamento não aceite → 422', async () => (await pay(admin, invD.id, 100, { method: 'Bitcoin' })).data.error, 'invalid_method');
await test('G4 data de pagamento no futuro → 422', async () => (await pay(admin, invD.id, 100, { paid_on: day(3) })).data.error, 'invalid_paid_on');
await test('G5 recusar pagamento exige motivo; depois fica fechado', async () => {
  const e1 = (await admin.call('POST', `/payments/${pend[0].id}/refuse`, { note: '' })).data.error;
  const ok = (await admin.call('POST', `/payments/${pend[0].id}/refuse`, { note: 'Não consta no extracto' })).status;
  const again = (await admin.call('POST', `/payments/${pend[0].id}/confirm`, {})).status;
  return [e1, ok, again];
}, ['reason_required', 200, 409]);
const bk = (await admin.call('GET', '/bookings?q=Cliente%20Pagamentos')).data.bookings[0];
const det = (await admin.call('GET', `/bookings/${bk.reference}`)).data.booking;
await test('G6 reserva mostra situação financeira separada do estado operacional', () => [typeof det.finance.balance, det.status !== det.finance.status], ['number', true]);
const listed = (await admin.call('GET', '/invoices?pay=parcial')).data.invoices;
await test('G7 filtro de facturas por estado de pagamento', () => listed.every(i => i.pay_status === 'parcial') && listed.length > 0, true);
const audit = (await admin.call('GET', '/audit')).data.entries.map(e => e.action);
await test('G8 auditoria regista registo, confirmação, reversão, reembolso e recusa', () => ['payment_registered', 'payment_confirmed', 'payment_reversed', 'refund_recorded', 'payment_refused', 'proof_link_created'].every(x => audit.includes(x)), true);
await test('G9 eventos de pagamento são só de acréscimo', () => sqlFails('DELETE FROM payment_events WHERE id = (SELECT min(id) FROM payment_events)'), 'recusado');

const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} testes passaram`);
process.exit(pass === results.length ? 0 : 1);
