/**
 * MOZ CAMP ADVENTURES — tests/messaging.mjs
 * =====================================================
 * E-mail pelo Resend e avisos à equipa pelo WhatsApp (Meta Cloud API) — SÓ em desenvolvimento.
 * Não envia nada para fora: arranca um servidor falso (Resend + Meta) em 127.0.0.1:8799 e um
 * segundo servidor PHP (localhost:8792) com uma configuração temporária que aponta para ele.
 *   PHP_CLI="php -c php.ini"   MCA_CONFIG=<config dev>   PSQL="psql … -d mca" (+ PGPASSWORD)
 * Repõe a definição «whatsapp» no fim.
 * Uso: node tests/messaging.mjs
 * =====================================================
 */

import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { PHP_CLI, MCA_CONFIG, PSQL } = process.env;
if (!PHP_CLI || !MCA_CONFIG || !PSQL) { console.error('Defina PHP_CLI, MCA_CONFIG e PSQL (ver cabeçalho).'); process.exit(2); }
const PORT = 8792, BASE = `http://localhost:${PORT}`, MOCK = 'http://127.0.0.1:8799';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sql = q => execSync(`${PSQL} -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/* ── Servidor falso: regista os pedidos; a resposta de cada fornecedor é configurável ── */
const seen = [];
const reply = { resend: [], meta: [] };   // filas de respostas forçadas [status, corpo]; vazio = sucesso
const mock = createServer((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null, who = req.url.startsWith('/emails') ? 'resend' : 'meta';
    seen.push({ who, url: req.url, auth: req.headers.authorization, body });
    const forced = reply[who].shift();
    const [status, out] = forced || (who === 'resend' ? [200, { id: 'resend-' + randomUUID() }] : [200, { messaging_product: 'whatsapp', contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id: 'wamid.TEST' + randomUUID() }] }]);
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
  });
});
await new Promise(r => mock.listen(8799, '127.0.0.1', r));

/* ── Configuração temporária: a de desenvolvimento + Resend/Meta apontados para o servidor falso ── */
const dir = mkdtempSync(join(tmpdir(), 'mca-msg-'));
const cfg = join(dir, 'config.php');
writeFileSync(cfg, `<?php
$c = require ${JSON.stringify(resolve(MCA_CONFIG))};
$c['app']['allowed_origins'][] = '${BASE}';
$c['mail'] = array_merge($c['mail'], ['transport' => 'resend', 'resend_key' => 're_test_123', 'resend_url' => '${MOCK}/emails']);
$c['whatsapp'] = ['mode' => 'api', 'token' => 'EAAG-test-token', 'phone_number_id' => '1234567890', 'template' => 'nova_reserva', 'language' => 'pt_PT', 'button' => true, 'api_base' => '${MOCK}', 'api_version' => 'v21.0'];
return $c;
`);
const [phpExe, ...phpArgs] = PHP_CLI.match(/"[^"]+"|\S+/g).map(s => s.replace(/^"|"$/g, ''));
const php = spawn(phpExe, [...phpArgs, '-S', `localhost:${PORT}`, 'tests/dev-router.php'], { env: { ...process.env, MCA_CONFIG: cfg }, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch { /* a arrancar */ } await sleep(250); }

const results = [];
async function test(name, fn, expected) {
  try {
    const got = await fn();
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(expected)}`}`);
  } catch (e) { results.push(false); console.log(`FAIL  ${name}  → erro: ${e.message.split('\n')[0]}`); }
}
function client() {
  const c = { cookie: '', csrf: '' };
  c.call = async (method, path, body) => {
    const headers = { Origin: BASE };
    if (c.cookie) headers.Cookie = c.cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && c.csrf) headers['X-CSRF-Token'] = c.csrf;
    const r = await fetch(BASE + '/api/admin' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get('set-cookie');
    if (set && set.startsWith('mca_admin=')) c.cookie = set.split(';')[0];
    const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
    if (data && data.csrf) c.csrf = data.csrf;
    return { status: r.status, data };
  };
  return c;
}
const cliUser = (name, email, role) => execSync(`${PHP_CLI} api/bin/create-user.php "${name}" ${email} ${role}`, { encoding: 'utf8', env: { ...process.env, MCA_CONFIG: cfg } }).match(/token=([a-f0-9]{64})/)[1];
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const book = (extra = {}) => fetch(BASE + '/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE },
  body: JSON.stringify({ idempotency_key: randomUUID(), item: 'ponta-douro-day-trip', lang: 'pt', date: day(12), adults: 3, children: 1, name: 'Joana Teste', phone: '+258 84 555 1212', email: 'joana@example.com', ...extra }) }).then(async r => ({ status: r.status, data: await r.json() }));

const run = randomUUID().slice(0, 6), PASS = 'Mensagens-teste-2026';
const before = sql("SELECT value FROM settings WHERE key = 'whatsapp'");
const teamBefore = sql("SELECT value FROM settings WHERE key = 'email_team'");
const anon = client(), admin = client(), mgr = client();
try {
  const at = cliUser('Admin Mensagens', `admin-msg-${run}@teste.local`, 'admin');
  await anon.call('POST', '/setup-password', { token: at, password: PASS });
  await admin.call('POST', '/login', { email: `admin-msg-${run}@teste.local`, password: PASS });
  const mt = cliUser('Gerente Mensagens', `gerente-msg-${run}@teste.local`, 'gerente');
  await anon.call('POST', '/setup-password', { token: mt, password: PASS });
  await mgr.call('POST', '/login', { email: `gerente-msg-${run}@teste.local`, password: PASS });
  seen.length = 0;   // convites ao painel também saem por e-mail

  /* Definições */
  await test('S1 estado dos canais (sem segredos): Resend configurado, Meta configurada, id mascarado', async () => {
    const c = (await admin.call('GET', '/settings')).data.channels;
    return [c.email.transport, c.email.configured, c.whatsapp.configured, c.whatsapp.phone_number_id, JSON.stringify(c).includes('re_test_123') || JSON.stringify(c).includes('EAAG')];
  }, ['resend', true, true, '••••••7890', false]);
  await test('S2 número inválido → 422 com o número', async () => { const r = await admin.call('POST', '/settings/whatsapp', { enabled: true, recipients: ['12'] }); return [r.status, r.data.error, r.data.number]; }, [422, 'whatsapp_invalid_number', '12']);
  await test('S3 activar sem números → 422', async () => (await admin.call('POST', '/settings/whatsapp', { enabled: true, recipients: [] })).data.error, 'whatsapp_no_recipients');
  await test('S4 números normalizados (84… → 258…, +27…) e sem repetidos', async () => (await admin.call('POST', '/settings/whatsapp', { enabled: true, recipients: ['84 123 4567', '+27 82 000 0000', '00258841234567'] })).data.channels.whatsapp.recipients, ['258841234567', '27820000000']);
  await test('S5 gerente não altera os números nem envia testes (403)', async () => [(await mgr.call('POST', '/settings/whatsapp', { enabled: false, recipients: [] })).status, (await mgr.call('POST', '/notifications/test', { channel: 'email' })).status], [403, 403]);

  await test('S6 destinatários dos avisos: e-mail inválido → 422; lista guardada sem repetidos', async () => {
    const bad = await admin.call('POST', '/settings/email_team', { recipients: ['equipa@exemplo'] });
    const ok = await admin.call('POST', '/settings/email_team', { recipients: ['Equipa@Example.com', 'outro@example.com', 'equipa@example.com'] });
    return [bad.status, bad.data.email, ok.data.channels.email.team_list, ok.data.channels.email.team];
  }, [422, 'equipa@exemplo', ['equipa@example.com', 'outro@example.com'], 'equipa@example.com, outro@example.com']);

  /* Pedido de reserva → Resend (equipa + cliente) e WhatsApp (2 números) */
  const b1 = await book();
  const ref = b1.data.reference;
  const mails = seen.filter(s => s.who === 'resend'), was = seen.filter(s => s.who === 'meta');
  await test('B1 pedido aceite (201) e resposta pública sem estado do WhatsApp', () => [b1.status, 'whatsapp' in (b1.data.email || {})], [201, false]);
  await test('B2 Resend: 2 e-mails (equipa = 1 e-mail para toda a lista; cliente com resposta para booking@; HTML da marca + texto)', () => [mails.length, mails.every(m => m.auth === 'Bearer re_test_123'), mails[0]?.body.to, mails[0]?.body.subject.includes(ref), mails[1]?.body.to, mails[1]?.body.reply_to, /Moz Camp Adventures <.+@.+>/.test(mails[0]?.body.from), /<!DOCTYPE html>/.test(mails[1]?.body.html || '') && mails[1].body.html.includes(ref) && /Recebemos o seu pedido/.test(mails[1].body.html), !!mails[1]?.body.text],
    [2, true, ['equipa@example.com', 'outro@example.com'], true, ['joana@example.com'], 'booking@mozcampadventures.co.mz', true, true, true]);
  await test('B3 Meta: 1 mensagem por número, modelo nova_reserva/pt_PT, URL e token correctos', () => [was.length, was.map(w => w.body.to).sort(), was.every(w => w.url === '/v21.0/1234567890/messages' && w.auth === 'Bearer EAAG-test-token'), was[0]?.body.template.name, was[0]?.body.template.language.code],
    [2, ['258841234567', '27820000000'], true, 'nova_reserva', 'pt_PT']);
  await test('B4 Meta: 7 variáveis (ref, experiência, data, pessoas, cliente, telefone, total) e botão com a referência', () => {
    const p = was[0].body.template.components[0].parameters.map(x => x.text), btn = was[0].body.template.components[1];
    return [p.length, p[0] === ref, p[2] === day(12), p[3], p[4], p[5], /MZN$/.test(p[6]), btn.sub_type, btn.parameters[0].text === ref, p.every(x => !/[\n\t]/.test(x))];
  }, [7, true, true, '4 (3 adultos, 1 crianças)', 'Joana Teste', '+258 84 555 1212', true, 'url', true, true]);
  await test('B5 registos: e-mail com fornecedor e id do Resend; WhatsApp «sent» com wamid', () => [
    sql(`SELECT count(*) FROM email_log e JOIN bookings b ON b.id = e.related_id AND e.related_type = 'booking' WHERE b.reference = '${ref}' AND e.status = 'sent' AND e.provider = 'resend' AND e.provider_id LIKE 'resend-%'`),
    sql(`SELECT count(*) FROM whatsapp_messages w JOIN bookings b ON b.id = w.booking_id WHERE b.reference = '${ref}' AND w.status = 'sent' AND w.provider_id LIKE 'wamid.%'`)], ['2', '2']);
  await test('B6 painel: registo do WhatsApp visível para quem gere e-mails (gerente)', async () => { const r = await mgr.call('GET', '/whatsapp'); return [r.status, r.data.messages.some(m => m.params[0] === ref), r.data.status.enabled]; }, [200, true, true]);

  /* Falhas do fornecedor: ficam registadas e não bloqueiam o pedido */
  seen.length = 0;
  reply.resend.push([403, { statusCode: 403, name: 'validation_error', message: 'The mozcampadventures.co.mz domain is not verified.' }]);   // só o e-mail à equipa (pedido sem e-mail do cliente)
  reply.meta.push([400, { error: { message: '(#132001) Template name does not exist in the translation', type: 'OAuthException', code: 132001, error_data: { messaging_product: 'whatsapp', details: 'template name (nova_reserva) does not exist in pt_PT' } } }]);
  const b2 = await book({ email: '' });
  await test('F1 Resend e Meta recusam → pedido continua aceite (201)', () => b2.status, 201);
  await test('F2 erro do Resend registado com o motivo', () => sql(`SELECT e.status || ' | ' || e.error FROM email_log e JOIN bookings b ON b.id = e.related_id AND e.related_type = 'booking' WHERE b.reference = '${b2.data.reference}' AND e.kind = 'booking_team'`), 'failed | Resend HTTP 403 — validation_error: The mozcampadventures.co.mz domain is not verified.');
  await test('F3 erro da Meta registado com o detalhe; o 2.º número enviado na mesma', () => sql(`SELECT string_agg(w.status || coalesce(' | ' || w.error, ''), ' ; ' ORDER BY w.id) FROM whatsapp_messages w JOIN bookings b ON b.id = w.booking_id WHERE b.reference = '${b2.data.reference}'`),
    'failed | Meta HTTP 400 — 132001: template name (nova_reserva) does not exist in pt_PT ; sent');
  seen.length = 0; reply.resend.length = reply.meta.length = 0;
  reply.resend.push([429, { statusCode: 429, name: 'rate_limit_exceeded', message: 'Too many requests' }]);
  await test('F4 Resend 429 (limite por segundo) → repete uma vez e envia', async () => { const r = await admin.call('POST', '/notifications/test', { channel: 'email' }); return [r.data.results[0].status, seen.filter(s => s.who === 'resend').length]; }, ['sent', 2]);

  /* Anexos (factura PDF) pelo Resend */
  seen.length = 0;
  const inv = (await admin.call('POST', '/invoices', { booking: ref, type: 'FT' })).data.invoice;
  await admin.call('POST', `/invoices/${inv.id}/issue`);
  const sentInv = await admin.call('POST', `/invoices/${inv.id}/send`);
  await test('A1 factura enviada pelo Resend com o PDF em anexo (base64)', () => {
    const m = seen.find(s => s.who === 'resend');
    const a = m?.body.attachments?.[0];
    return [sentInv.status, !!a && /\.pdf$/.test(a.filename), !!a && Buffer.from(a.content, 'base64').subarray(0, 5).toString() === '%PDF-'];
  }, [200, true, true]);

  /* Testes do painel e interruptor */
  seen.length = 0;
  await test('T1 «Enviar WhatsApp de teste» → um envio por número', async () => { const r = await admin.call('POST', '/notifications/test', { channel: 'whatsapp' }); return [r.data.results.map(x => x.status), seen.filter(s => s.who === 'meta').map(s => s.body.template.components[0].parameters[0].text)]; }, [['sent', 'sent'], ['MCA-TESTE', 'MCA-TESTE']]);
  await admin.call('POST', '/settings/whatsapp', { enabled: false, recipients: ['258841234567'] });
  seen.length = 0;
  await book();
  await test('T2 WhatsApp desligado → nenhum envio à Meta; e-mails continuam', () => [seen.filter(s => s.who === 'meta').length, seen.filter(s => s.who === 'resend').length], [0, 2]);
  await test('T3 auditoria regista testes e alterações', async () => { const e = (await admin.call('GET', '/audit')).data.entries.map(x => x.action); return ['settings_whatsapp', 'email_test', 'whatsapp_test'].every(a => e.includes(a)); }, true);
} finally {
  sql(`UPDATE settings SET value = '${before.replace(/'/g, "''")}'::jsonb WHERE key = 'whatsapp'`);
  if (teamBefore) sql(`UPDATE settings SET value = '${teamBefore.replace(/'/g, "''")}'::jsonb WHERE key = 'email_team'`); else sql("DELETE FROM settings WHERE key = 'email_team'");
  php.kill(); mock.close();
  rmSync(dir, { recursive: true, force: true });
}
const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} testes passaram`);
process.exit(ok === results.length ? 0 : 1);
