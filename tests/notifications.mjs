/**
 * MOZ CAMP ADVENTURES — tests/notifications.mjs
 * Notificações ao cliente, registo/reenvio de e-mails e área do cliente
 * — SÓ em desenvolvimento (mail.transport = 'log'; domínios .invalid simulam falha).
 *   API_BASE, PHP_CLI, MCA_CONFIG, PSQL (ver tests/admin.mjs)
 */

import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

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
const lastMail = (kind, relId) => { const r = sql(`SELECT json_build_object('id', id, 'status', status, 'subject', subject, 'body', body, 'lang', lang, 'att', attachments, 'to', to_addr) FROM email_log WHERE kind = '${kind}'${relId ? ` AND related_id = ${relId}` : ''} ORDER BY id DESC LIMIT 1`); return r ? JSON.parse(r) : null; };
const count = kind => +sql(`SELECT count(*) FROM email_log WHERE kind = '${kind}'`);
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
    const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    if (data && data.csrf) c.csrf = data.csrf;
    return { status: r.status, data };
  };
  return c;
}
/* Lê sempre o corpo (evita um erro interno do fetch do Node com respostas não lidas) */
const pub = async (path, body) => {
  const r = await fetch(BASE + '/api' + path, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, headers: r.headers, buf, json: async () => JSON.parse(buf.toString()) };
};
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

sql('TRUNCATE rate_limits');
const email = `admin-notif-${randomUUID().slice(0, 6)}@teste.local`;
const tok = execSync(`${PHP_CLI} api/bin/create-user.php "Admin Notificações" ${email} admin`, { encoding: 'utf8' }).match(/token=([a-f0-9]{64})/)[1];
await fetch(BASE + '/api/admin/setup-password', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok, password: 'Notifica-2026x' }) });
const admin = client();
await admin.call('POST', '/login', { email, password: 'Notifica-2026x' });

/* ── Reservas ───────────────────────────────────────── */
const enB = await (await pub('/bookings', { idempotency_key: randomUUID(), item: 'whale-watching', lang: 'en', date: day(20), adults: 2, name: 'Jane Traveller', phone: '+44 7700 900123', email: 'jane@example.com' })).json();
const recv = lastMail('booking_client', +sql(`SELECT id FROM bookings WHERE reference = '${enB.reference}'`));
await test('N1 pedido EN: e-mail de recepção em inglês com link da área do cliente', () => [recv.status, recv.lang, /\/en\/booking\/#r=MCA-\d{4}-\d{5}&t=[a-f0-9]{48}/.test(recv.body)], ['logged', 'en', true]);
const c1 = await admin.call('POST', `/bookings/${enB.reference}/status`, { status: 'confirmada', notify: true });
const m1 = lastMail('notify_booking_confirmed');
await test('N2 confirmar → resultado real devolvido e e-mail EN «Booking confirmed»', () => [c1.data.email, m1.subject, m1.lang], ['logged', `Booking confirmed — ${enB.reference}`, 'en']);
const ptB = (await admin.call('POST', '/bookings', { item: 'maputo-city-tour', date: day(15), adults: 2, name: 'Carla Mabunda', phone: '+258 84 123 4567', email: 'carla@example.com', channel: 'whatsapp' })).data;
await admin.call('POST', `/bookings/${ptB.reference}/status`, { status: 'confirmada' });
await test('N3 reserva PT → «Reserva confirmada», com nome e link /reserva/', () => { const m = lastMail('notify_booking_confirmed'); return [m.subject, m.body.startsWith('Olá Carla Mabunda,'), m.body.includes('/reserva/#r=')]; }, [`Reserva confirmada — ${ptB.reference}`, true, true]);
const before = count('notify_booking_completed');
const c4 = await admin.call('POST', `/bookings/${ptB.reference}/status`, { status: 'concluida', notify: false });
await test('N4 «Notificar» desmarcado → nada enviado', () => [c4.data.email, count('notify_booking_completed') - before], ['skipped', 0]);
const ptC = (await admin.call('POST', '/bookings', { item: 'maputo-city-tour', date: day(16), adults: 2, name: 'Rui Tembe', phone: '+258 84 222 3333', email: 'rui@example.com', channel: 'whatsapp' })).data;
await admin.call('POST', '/settings/notifications', { booking_received: true, booking_confirmed: true, booking_cancelled: false, booking_completed: true, payment_confirmed: true, payment_refused: true, payment_reversed: true, refund: true, invoice_voided: true });
const c5 = await admin.call('POST', `/bookings/${ptC.reference}/status`, { status: 'cancelada', note: 'Cliente desistiu' });
await test('N5 tipo desligado nas Definições → «disabled»', () => c5.data.email, 'disabled');
await admin.call('POST', '/settings/notifications', { booking_received: true, booking_confirmed: true, booking_cancelled: true, booking_completed: true, payment_confirmed: true, payment_refused: true, payment_reversed: true, refund: true, invoice_voided: true });
await admin.call('POST', `/bookings/${enB.reference}/status`, { status: 'concluida' });
await test('N6 concluída → convite para avaliar com link da experiência', () => lastMail('notify_booking_completed').body.includes('/en/tours/whale-watching/#avaliacoes'), true);
const noMail = (await admin.call('POST', '/bookings', { item: 'maputo-city-tour', date: day(17), adults: 2, name: 'Sem Email', phone: '+258 84 444 5555', channel: 'whatsapp' })).data;
await test('N7 cliente sem e-mail → «no_email» (o painel avisa para usar WhatsApp)', async () => (await admin.call('POST', `/bookings/${noMail.reference}/status`, { status: 'confirmada' })).data.email, 'no_email');

/* ── Facturas e pagamentos ──────────────────────────── */
const d = (await admin.call('POST', '/invoices', { booking: ptB.reference, type: 'FT' })).data.invoice;
await admin.call('POST', `/invoices/${d.id}/draft`, { customer: { name: 'Carla Mabunda', email: 'carla@example.com', phone: '+258 84 123 4567' }, lines: [{ description: 'City tour', qty: 1, unit_price: 8000 }] });
const inv = (await admin.call('POST', `/invoices/${d.id}/issue`)).data.invoice;
const p1 = await admin.call('POST', `/invoices/${inv.id}/payments`, { method: 'M-Pesa', amount: 3000, paid_on: today, reference: 'N-' + randomUUID().slice(0, 8), confirm: true });
const mp1 = lastMail('notify_payment_confirmed');
await test('N8 pagamento parcial → e-mail com recibo em anexo e saldo em dívida', () => [p1.data.email, mp1.att.length, existsSync(mp1.att[0].path), mp1.body.includes('Valor ainda em dívida: 5.000,00 MZN')], ['logged', 1, true, true]);
await admin.call('POST', `/invoices/${inv.id}/payments`, { method: 'Nedbank', amount: 5000, paid_on: today, reference: 'N-' + randomUUID().slice(0, 8), confirm: true });
await test('N9 liquidação → «A factura está totalmente paga»', () => lastMail('notify_payment_confirmed').body.includes('A factura está totalmente paga'), true);
const sent = await admin.call('POST', `/invoices/${inv.id}/send`);
await test('N10 envio da factura: anexo por caminho (reenviável) e link da área do cliente', () => { const m = lastMail('invoice', inv.id); return [sent.data.status, m.att[0].path !== null, m.body.includes('/reserva/#r=')]; }, ['logged', true, true]);
const pays = (await admin.call('GET', `/invoices/${inv.id}`)).data.invoice.payments;
const rv = await admin.call('POST', `/payments/${pays[1].id}/reverse`, { reason: 'Transferência devolvida' });
await test('N11 reversão → e-mail «Pagamento anulado» com motivo', () => [rv.data.email, lastMail('notify_payment_reversed').body.includes('Transferência devolvida')], ['logged', true]);
const rf = await admin.call('POST', `/invoices/${inv.id}/refunds`, { method: 'M-Pesa', amount: 1000, paid_on: today, notes: 'Desconto pós-venda' });
await test('N12 reembolso → e-mail «Reembolso efectuado»', () => [rf.data.email, lastMail('notify_refund').subject], ['logged', `Reembolso efectuado — ${inv.number}`]);
const pend = await admin.call('POST', `/invoices/${inv.id}/payments`, { method: 'M-Pesa', amount: 100, paid_on: today, reference: 'N-' + randomUUID().slice(0, 8) });
const pid = pend.data.payments.find(p => p.status === 'em_verificacao').id;
await test('N13 recusar pagamento registado no painel → cliente não é avisado («skipped»)', async () => (await admin.call('POST', `/payments/${pid}/refuse`, { note: 'Não consta' })).data.email, 'skipped');
const d2 = (await admin.call('POST', '/invoices', { booking: ptB.reference, type: 'FT' })).data.invoice;
await admin.call('POST', `/invoices/${d2.id}/draft`, { customer: { name: 'Carla Mabunda', email: 'carla@example.com' }, lines: [{ description: 'Extra', qty: 1, unit_price: 500 }] });
const inv2 = (await admin.call('POST', `/invoices/${d2.id}/issue`)).data.invoice;
const vd = await admin.call('POST', `/invoices/${inv2.id}/void`, { reason: 'Emitida por engano' });
await test('N14 factura anulada → e-mail ao cliente com o motivo', () => [vd.data.email, lastMail('notify_invoice_voided').body.includes('Emitida por engano')], ['logged', true]);

/* ── Falhas e reenvio ───────────────────────────────── */
const bad = (await admin.call('POST', '/bookings', { item: 'maputo-city-tour', date: day(18), adults: 2, name: 'Endereço Errado', phone: '+258 84 666 7777', email: 'cliente@dominio-errado.invalid', channel: 'whatsapp' })).data;
const fb = await admin.call('POST', `/bookings/${bad.reference}/status`, { status: 'confirmada' });
await test('N15 falha de envio é reportada como «failed» (não como enviado) e a reserva fica confirmada', () => [fb.data.email, fb.data.booking.status], ['failed', 'confirmada']);
const failed = (await admin.call('GET', '/emails?status=failed')).data.emails.find(e => e.to_addr === 'cliente@dominio-errado.invalid');
await test('N16 registo de e-mails mostra a falha com o erro', () => [!!failed, !!failed?.error, failed?.resendable], [true, true, true]);
const rs = await admin.call('POST', `/emails/${failed.id}/resend`);
await test('N17 reenvio de endereço inválido continua «failed» (honesto) e fica ligado ao original', () => [rs.data.status, +sql(`SELECT resent_of FROM email_log WHERE id = ${rs.data.id}`)], ['failed', failed.id]);
const okMail = JSON.parse(sql("SELECT json_build_object('id', id) FROM email_log WHERE kind = 'notify_booking_confirmed' AND status = 'logged' ORDER BY id DESC LIMIT 1"));
const rs2 = await admin.call('POST', `/emails/${okMail.id}/resend`);
await test('N18 reenvio com anexo/corpo guardado funciona', () => rs2.data.status, 'logged');
await test('N19 resumo conta e-mails falhados por reenviar', async () => (await admin.call('GET', '/dashboard')).data.emails_failed >= 1, true);

/* ── Área do cliente ─────────────────────────────────── */
const link = (await admin.call('POST', `/bookings/${ptB.reference}/client-link`, {})).data.link;
const P = new URLSearchParams(link.split('#')[1]);
const cred = { ref: P.get('r'), token: P.get('t') };
const view = await (await pub('/client/booking', cred)).json();
await test('C1 área do cliente: reserva, facturas, saldos e recibos (sem e-mail/telefone)', () => [view.booking.reference, view.invoices.length >= 2, view.receipts.length >= 2, 'customer_phone' in view.booking, 'email' in view.booking], [ptB.reference, true, true, false, false]);
await test('C2 token errado → 404', async () => (await pub('/client/booking', { ref: cred.ref, token: 'b'.repeat(48) })).status, 404);
await test('C3 token de outra reserva → 404', async () => (await pub('/client/booking', { ref: enB.reference, token: cred.token })).status, 404);
const docRes = await pub('/client/document', { ...cred, kind: 'invoice', id: inv.id });
await test('C4 cliente descarrega a SUA factura (PDF)', async () => [docRes.status, docRes.headers.get('content-type'), docRes.buf.subarray(0, 5).toString()], [200, 'application/pdf', '%PDF-']);
const otherInv = +sql(`SELECT i.id FROM invoices i JOIN bookings b ON b.id = i.booking_id WHERE b.reference <> '${ptB.reference}' AND i.status = 'emitida' LIMIT 1`);
await test('C5 factura de OUTRA reserva com o meu link → 404', async () => (await pub('/client/document', { ...cred, kind: 'invoice', id: otherInv })).status, 404);
const rcId = view.receipts[0].id;
await test('C6 cliente descarrega o recibo', async () => (await pub('/client/document', { ...cred, kind: 'receipt', id: rcId })).status, 200);
await test('C7 link de comprovativo só para facturas com saldo (paga → 404)', async () => (await pub('/client/proof-link', { ...cred, id: inv2.id })).status, 404);
const revoked = (await admin.call('POST', `/bookings/${ptB.reference}/client-link`, { revoke: true })).data.link;
await test('C8 revogar invalida o link antigo; o novo funciona', async () => [(await pub('/client/booking', cred)).status, (await pub('/client/booking', { ref: cred.ref, token: new URLSearchParams(revoked.split('#')[1]).get('t') })).status], [404, 200]);
await test('C9 downloads do cliente ficam na auditoria', () => +sql("SELECT count(*) FROM audit_log WHERE action IN ('client_invoice_download', 'client_receipt_download')") >= 2, true);

const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} testes passaram`);
process.exit(pass === results.length ? 0 : 1);
