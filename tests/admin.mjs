/**
 * MOZ CAMP ADVENTURES — tests/admin.mjs
 * =====================================================
 * Testes do painel e da facturação — SÓ em base de dados de desenvolvimento.
 *   API_BASE=http://localhost:8791
 *   PHP_CLI="php -c php.ini"  MCA_CONFIG=<config dev>   (para criar utilizadores de teste)
 *   PSQL="psql -h localhost -p 55432 -U mca -d mca" (+ PGPASSWORD)
 * Uso: node tests/admin.mjs
 * =====================================================
 */

import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.API_BASE || 'http://localhost:8791';
const ORIGIN = process.env.API_ORIGIN || BASE;
const { PHP_CLI, PSQL } = process.env;
if (!PHP_CLI || !PSQL) { console.error('Defina PHP_CLI, MCA_CONFIG e PSQL (ver cabeçalho).'); process.exit(2); }

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

/** Cliente HTTP com cookie de sessão e token CSRF. */
function client() {
  const c = { cookie: '', csrf: '' };
  c.call = async (method, path, body, opt = {}) => {
    const headers = { Origin: opt.origin === undefined ? ORIGIN : opt.origin };
    if (!headers.Origin) delete headers.Origin;
    if (c.cookie) headers.Cookie = c.cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && c.csrf && opt.csrf !== false) headers['X-CSRF-Token'] = c.csrf;
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
/** Cria um utilizador de teste pela linha de comandos e devolve o token do link. */
function cliUser(name, email, role) {
  const out = execSync(`${PHP_CLI} api/bin/create-user.php "${name}" ${email} ${role}`, { encoding: 'utf8' });
  return out.match(/token=([a-f0-9]{64})/)[1];
}
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const run = randomUUID().slice(0, 6);
const PASS = 'Teste-segura-123';
const adminEmail = `admin-${run}@teste.local`, mgrEmail = `gerente-${run}@teste.local`;
sql('TRUNCATE rate_limits');

/* ── A. Autenticação ─────────────────────────────────── */
const anon = client();
await test('A1 sem sessão → 401', async () => (await anon.call('GET', '/me')).status, 401);
const adminToken = cliUser('Admin Teste', adminEmail, 'admin');
await test('A2 palavra-passe fraca → 422', async () => (await anon.call('POST', '/setup-password', { token: adminToken, password: 'curta' })).data.error, 'weak_password');
await test('A3 definir palavra-passe pelo link', async () => (await anon.call('POST', '/setup-password', { token: adminToken, password: PASS })).data.ok, true);
await test('A4 link de configuração não é reutilizável', async () => (await anon.call('POST', '/setup-password', { token: adminToken, password: PASS })).data.error, 'invalid_or_expired_token');
await test('A5 palavra-passe errada → 401', async () => (await anon.call('POST', '/login', { email: adminEmail, password: 'errada-123' })).status, 401);
const admin = client();
await test('A6 login → sessão, perfil e permissões', async () => { const r = await admin.call('POST', '/login', { email: adminEmail, password: PASS }); return [r.status, r.data.user.role_code, r.data.user.permissions, !!admin.cookie, admin.csrf.length]; }, [200, 'admin', ['*'], true, 64]);
await test('A7 cookie da sessão: HttpOnly e SameSite=Strict', async () => {
  const r = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: adminEmail, password: PASS }) });
  const c = r.headers.get('set-cookie') || ''; return [/HttpOnly/i.test(c), /SameSite=Strict/i.test(c)];
}, [true, true]);
await test('A8 escrita sem token CSRF → 403', async () => (await admin.call('POST', '/bookings/MCA-2026-00001/notes', { text: 'x' }, { csrf: false })).data.error, 'csrf_invalid');
await test('A9 escrita com Origin de outro site → 403', async () => (await admin.call('POST', '/bookings/MCA-2026-00001/notes', { text: 'nota' }, { origin: 'https://evil.example' })).data.error, 'origin_not_allowed');
await test('A10 força bruta: 6.ª tentativa falhada → 429', async () => { let r; for (let i = 0; i < 6; i++) r = await anon.call('POST', '/login', { email: mgrEmail, password: 'x' + i }); return r.status; }, 429);
sql('TRUNCATE rate_limits');

/* ── B. Permissões ───────────────────────────────────── */
const mgrToken = cliUser('Gerente Teste', mgrEmail, 'gerente');
await anon.call('POST', '/setup-password', { token: mgrToken, password: PASS });
const mgr = client();
await mgr.call('POST', '/login', { email: mgrEmail, password: PASS });
await test('B1 gerente vê reservas', async () => (await mgr.call('GET', '/bookings')).status, 200);
await test('B2 gerente NÃO gere utilizadores', async () => (await mgr.call('GET', '/users')).status, 403);
await test('B3 gerente NÃO vê definições', async () => (await mgr.call('GET', '/settings')).status, 403);
const users = (await admin.call('GET', '/users')).data;
const adminRole = users.roles.find(r => r.code === 'admin'), mgrRole = users.roles.find(r => r.code === 'gerente');
await test('B4 perfil Administrador não é editável', async () => (await admin.call('POST', `/roles/${adminRole.id}`, { name: 'X', permissions: [] })).data.error, 'system_role_locked');
await test('B5 permissões desconhecidas são ignoradas', async () => (await admin.call('POST', '/roles', { name: `Operações ${run}`, permissions: ['bookings.view', 'hack.all'] })).data.roles.find(r => r.name === `Operações ${run}`).permissions, ['bookings.view']);
const me1 = users.users.find(u => u.email === adminEmail);
const otherAdmins = Number(sql("SELECT count(*) FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='admin' AND u.active")) - 1;
if (otherAdmins === 0) await test('B6 não é possível desactivar o último administrador', async () => (await admin.call('POST', `/users/${me1.id}`, { active: false })).data.error, 'last_admin');

/* ── C. Reservas no painel ───────────────────────────── */
const manual = await mgr.call('POST', '/bookings', { item: 'ponta-douro-day-trip', date: day(12), adults: 4, name: `Cliente WhatsApp ${run}`, phone: '+258 84 111 2222', email: 'cliente@example.com', channel: 'whatsapp' });
const REF = manual.data.reference;
await test('C1 pedido manual (WhatsApp) → referência e total do servidor', () => [/^MCA-\d{4}-\d{5}$/.test(REF), manual.data.total], [true, 32000]);
await test('C2 pesquisa por referência', async () => (await mgr.call('GET', '/bookings?q=' + REF)).data.bookings.map(b => b.reference), [REF]);
await test('C3 pesquisa por nome do cliente', async () => (await mgr.call('GET', '/bookings?q=' + encodeURIComponent(`whatsapp ${run}`))).data.bookings.length, 1);
await test('C4 transição inválida (pedido → concluída) → 422', async () => (await mgr.call('POST', `/bookings/${REF}/status`, { status: 'concluida' })).data.error, 'invalid_transition');
await test('C5 confirmar pedido', async () => (await mgr.call('POST', `/bookings/${REF}/status`, { status: 'confirmada' })).data.booking.status, 'confirmada');
await test('C6 cancelar exige motivo', async () => (await mgr.call('POST', `/bookings/${REF}/status`, { status: 'cancelada' })).data.error, 'cancel_reason_required');
await test('C7 nota interna fica no histórico', async () => (await mgr.call('POST', `/bookings/${REF}/notes`, { text: 'Cliente pediu recolha às 6h.' })).data.booking.events.map(e => e.type), ['created', 'status_changed', 'note']);

/* ── D. Facturação ───────────────────────────────────── */
const draft = (await mgr.call('POST', '/invoices', { booking: REF, type: 'FT' })).data.invoice;
await test('D1 rascunho criado a partir da reserva (linhas e total)', () => [draft.status, draft.number, draft.lines.length, Number(draft.total)], ['rascunho', null, 1, 32000]);
const edit = await mgr.call('POST', `/invoices/${draft.id}/draft`, {
  customer: { name: `Cliente WhatsApp ${run}`, email: 'cliente@example.com', phone: '+258 84 111 2222', nuit: '123456789', address: 'Av. Julius Nyerere, Maputo' },
  lines: [{ description: "Ponta D'Ouro — Dia Completo: 4 adultos", qty: 4, unit_price: 8000, amount: 1 }, { description: 'Desconto autorizado (grupo)', qty: 1, unit_price: -2000 }],
  notes: 'Recolha às 06h00.'
});
await test('D2 edição do rascunho: valores recalculados no servidor (ignora amount do cliente)', () => [Number(edit.data.invoice.total), edit.data.invoice.lines[0].amount], [30000, 32000]);
await test('D3 total negativo → 422', async () => (await mgr.call('POST', `/invoices/${draft.id}/draft`, { customer: { name: 'X Y' }, lines: [{ description: 'd', qty: 1, unit_price: -1 }] })).data.error, 'negative_total');
await test('D4 NUIT do cliente inválido → 422', async () => (await mgr.call('POST', `/invoices/${draft.id}/draft`, { customer: { name: 'Ana Silva', nuit: '12' }, lines: [{ description: 'd', qty: 1, unit_price: 1 }] })).data.error, 'invalid_customer_nuit');
const issued = (await mgr.call('POST', `/invoices/${draft.id}/issue`)).data.invoice;
const year = new Date().getFullYear();
await test('D5 emitir → número FT-AAAA/NNNN, data, PDF com hash', () => [new RegExp(`^FT-${year}/\\d{4}$`).test(issued.number), issued.status, issued.pdf_sha256?.length], [true, 'emitida', 64]);
await test('D6 cópia dos dados da empresa e de pagamento no documento', () => [issued.company.nuit, issued.payment_info.methods.filter(m => m.type === 'bank').length], ['459001987', 2]);
const pdf = await mgr.call('GET', `/invoices/${draft.id}/pdf`);
await test('D7 PDF: tipo, assinatura %PDF e hash igual ao registado', async () => [pdf.type, pdf.data.subarray(0, 5).toString(), (await import('node:crypto')).createHash('sha256').update(pdf.data).digest('hex') === issued.pdf_sha256], ['application/pdf', '%PDF-', true]);
writeFileSync('docs/visual-review/depois/factura-exemplo.pdf', pdf.data);
await test('D8 PDF sem sessão → 401', async () => (await anon.call('GET', `/invoices/${draft.id}/pdf`)).status, 401);
await test('D9 factura emitida não se edita pela API → 409', async () => (await mgr.call('POST', `/invoices/${draft.id}/draft`, { customer: { name: 'Outro' }, lines: [] })).data.error, 'not_draft');
await test('D10 nem pela base de dados: UPDATE do total recusado', () => sqlFails(`UPDATE invoices SET total = 1 WHERE id = ${draft.id}`), 'recusado');
await test('D11 nem DELETE de factura emitida', () => sqlFails(`DELETE FROM invoices WHERE id = ${draft.id}`), 'recusado');
await test('D12 gerente sem permissão de anular → 403', async () => (await mgr.call('POST', `/invoices/${draft.id}/void`, { reason: 'Erro no valor' })).status, 403);
await admin.call('POST', `/roles/${mgrRole.id}`, { name: mgrRole.name, permissions: [...mgrRole.permissions, 'invoices.void'] });
await test('D13 administrador atribui «anular» ao Gerente → anulação sem motivo recusada', async () => (await mgr.call('POST', `/invoices/${draft.id}/void`, { reason: '' })).data.error, 'void_reason_required');
const voided = (await mgr.call('POST', `/invoices/${draft.id}/void`, { reason: 'Valor do desconto incorrecto' })).data.invoice;
await test('D14 anulação com motivo: estado, autor e histórico', () => [voided.status, voided.voided_by_name, voided.events.map(e => e.type)], ['anulada', 'Gerente Teste', ['issued', 'voided']]);
await test('D15 anular novamente → 409', async () => (await mgr.call('POST', `/invoices/${draft.id}/void`, { reason: 'Outra vez' })).status, 409);
await test('D16 factura anulada não muda nem pela BD', () => sqlFails(`UPDATE invoices SET void_reason = 'x' WHERE id = ${draft.id}`), 'recusado');
await admin.call('POST', `/roles/${mgrRole.id}`, { name: mgrRole.name, permissions: mgrRole.permissions });

/* concorrência: 10 rascunhos emitidos em simultâneo */
const drafts = [];
for (let i = 0; i < 10; i++) drafts.push((await mgr.call('POST', '/invoices', { booking: REF, type: 'FT' })).data.invoice.id);
const outs = await Promise.all(drafts.map(id => mgr.call('POST', `/invoices/${id}/issue`)));
const seqs = outs.map(o => +o.data.invoice.number.split('/')[1]).sort((a, b) => a - b);
await test('D17 10 emissões simultâneas → números únicos e consecutivos (sem buracos)', () => [outs.every(o => o.status === 200), new Set(seqs).size, seqs[9] - seqs[0]], [true, 10, 9]);
const dup = (await mgr.call('POST', '/invoices', { booking: REF, type: 'FT' })).data.invoice.id;
const twice = await Promise.all([mgr.call('POST', `/invoices/${dup}/issue`), mgr.call('POST', `/invoices/${dup}/issue`)]);
await test('D18 emitir o mesmo rascunho duas vezes em simultâneo → uma emite, a outra 409', () => twice.map(t => t.status).sort(), [200, 409]);
const pf = (await mgr.call('POST', `/invoices/${(await mgr.call('POST', '/invoices', { booking: REF, type: 'PF' })).data.invoice.id}/issue`)).data.invoice;
await test('D19 pró-forma tem série própria PF-AAAA/NNNN', () => new RegExp(`^PF-${year}/\\d{4}$`).test(pf.number), true);
const sent = await mgr.call('POST', `/invoices/${pf.id}/send`);
await test('D20 envio ao cliente: estado real do e-mail registado', () => [sent.data.status, sent.data.to], ['logged', 'cliente@example.com']);
const path = sql(`SELECT pdf_path FROM invoices WHERE id = ${pf.id}`);
const original = readFileSync(path);
writeFileSync(path, Buffer.concat([original, Buffer.from('%alterado')]));
await test('D21 PDF alterado no disco é detectado (500 pdf_integrity_error)', async () => (await mgr.call('GET', `/invoices/${pf.id}/pdf`)).data.error, 'pdf_integrity_error');
writeFileSync(path, original);
await test('D22 reserva cancelada não pode ser facturada', async () => {
  await mgr.call('POST', `/bookings/${REF}/status`, { status: 'cancelada', note: 'Cliente desistiu' });
  return (await mgr.call('POST', '/invoices', { booking: REF, type: 'FT' })).data.error;
}, 'booking_cancelled');
await test('D23 pesquisa de facturas por referência da reserva', async () => (await mgr.call('GET', '/invoices?q=' + REF)).data.invoices.length >= 12, true);

/* ── E. Definições, avaliações, auditoria ────────────── */
const settings = (await admin.call('GET', '/settings')).data;
const methods = settings.payment.methods.map(m => m.label === 'e-Mola' ? { ...m, number: '+258 86 000 0000' } : m);
await test('E1 administrador actualiza instruções de pagamento (e-Mola)', async () => (await admin.call('POST', '/settings/payment', { methods, note: settings.payment.note })).data.payment.methods.find(m => m.label === 'e-Mola').pending ?? false, false);
await admin.call('POST', '/settings/payment', { methods: settings.payment.methods, note: settings.payment.note });   // repõe
await test('E2 NUIT da empresa inválido → 422', async () => (await admin.call('POST', '/settings/company', { ...settings.company, nuit: 'abc' })).data.error, 'invalid_nuit');
const rv = await fetch(BASE + '/api/reviews', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Paula', rating: 4, text: `Muito bom ${run}`, item: 'maputo-city-tour' }) });
const pend = (await mgr.call('GET', '/reviews?status=pendente')).data.reviews.find(r => r.body === `Muito bom ${run}`);
await mgr.call('POST', `/reviews/${pend.id}`, { status: 'aprovada' });
await test('E3 avaliação aprovada no painel aparece no site', async () => [rv.status, (await (await fetch(BASE + '/api/reviews?item=maputo-city-tour')).json()).reviews.some(r => r.text === `Muito bom ${run}`)], [201, true]);
const audit = (await admin.call('GET', '/audit')).data.entries.map(e => e.action);
await test('E4 auditoria regista login falhado, emissão, anulação, permissões e definições', () => ['login_failed', 'invoice_issued', 'invoice_voided', 'role_saved', 'settings_payment', 'review_aprovada'].every(a => audit.includes(a)), true);
await test('E5 auditoria é só de acréscimo', () => sqlFails('DELETE FROM audit_log WHERE id = (SELECT min(id) FROM audit_log)'), 'recusado');
await test('E6 logout invalida a sessão', async () => { await mgr.call('POST', '/logout'); return (await mgr.call('GET', '/me')).status; }, 401);

const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} testes passaram`);
process.exit(pass === results.length ? 0 : 1);
