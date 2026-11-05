/**
 * MOZ CAMP ADVENTURES — tests/whatsapp.mjs
 * =====================================================
 * Mensagens a clientes, webhook, fila e credenciais do WhatsApp — SÓ em desenvolvimento.
 * Não envia nada para fora: servidor falso da Meta em 127.0.0.1:8798 e PHP em localhost:8793
 * com configuração temporária. Repõe as definições no fim.
 *   PHP_CLI="php -c php.ini"   MCA_CONFIG=<config dev>   PSQL="psql … -d mca"
 * Uso: node tests/whatsapp.mjs
 * =====================================================
 */

import { spawn, exec, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { PHP_CLI, MCA_CONFIG, PSQL } = process.env;
if (!PHP_CLI || !MCA_CONFIG || !PSQL) { console.error('Defina PHP_CLI, MCA_CONFIG e PSQL (ver cabeçalho).'); process.exit(2); }
const PORT = 8793, BASE = `http://localhost:${PORT}`, MOCK = 'http://127.0.0.1:8798';
const TOKEN = 'EAAG-secret-token-xyz', APP_SECRET = 'app-secret-abc', VERIFY = 'verify-me-123';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sql = q => execSync(`${PSQL} -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const run = Date.now().toString().slice(-7);

const seen = [], reply = [];
let wam = 0;
const mock = createServer((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null;
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
    const forced = reply.shift();
    if (forced === 'drop') return req.socket.destroy();     // ligação cortada: sem resposta
    const [status, out] = forced || (req.method === 'GET' ? [200, { display_phone_number: '+258 84 000 0000', verified_name: 'Moz Camp Adventures', quality_rating: 'GREEN' }] : [200, { messages: [{ id: `wamid.${run}.${++wam}` }] }]);
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
  });
});
await new Promise(r => mock.listen(8798, '127.0.0.1', r));

const dir = mkdtempSync(join(tmpdir(), 'mca-wa-'));
const cfg = join(dir, 'config.php');
writeFileSync(cfg, `<?php
$c = require ${JSON.stringify(resolve(MCA_CONFIG))};
$c['app']['allowed_origins'][] = '${BASE}';
$c['whatsapp'] = ['mode' => 'api', 'template' => 'nova_reserva', 'language' => 'pt_PT', 'api_base' => '${MOCK}', 'api_version' => 'v21.0'];
return $c;
`);
const [phpExe, ...phpArgs] = PHP_CLI.match(/"[^"]+"|\S+/g).map(s => s.replace(/^"|"$/g, ''));
const php = spawn(phpExe, [...phpArgs, '-S', `localhost:${PORT}`, 'tests/dev-router.php'], { env: { ...process.env, MCA_CONFIG: cfg }, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch { /* a arrancar */ } await sleep(250); }
/* Assíncrono: o servidor falso corre neste processo e tem de continuar a responder */
const worker = () => promisify(exec)(`${PHP_CLI} api/bin/worker.php`, { env: { ...process.env, MCA_CONFIG: cfg } });

const results = [];
async function test(name, fn, expected) {
  try {
    const got = await fn();
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(expected)}`}`);
  } catch (e) { results.push(false); console.log(`FAIL  ${name}  → erro: ${e.message.split('\n')[0]}`); }
}
const admin = { cookie: '', csrf: '' };
admin.call = async (method, path, body) => {
  const headers = { Origin: BASE };
  if (admin.cookie) headers.Cookie = admin.cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && admin.csrf) headers['X-CSRF-Token'] = admin.csrf;
  const r = await fetch(BASE + '/api/admin' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = r.headers.get('set-cookie');
  if (set && set.startsWith('mca_admin=')) admin.cookie = set.split(';')[0];
  const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
  if (data && data.csrf) admin.csrf = data.csrf;
  return { status: r.status, data };
};
const book = async (n, over = {}) => {
  sql('DELETE FROM rate_limits');
  const r = await fetch(BASE + '/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ idempotency_key: randomUUID(), item: 'maputo-city-tour', date: day(40 + n), adults: 2, name: 'Cliente Teste', phone: `+258 84 ${run}`, email: 'cliente@example.com', lang: 'pt', website: '', ...over }) });
  return { status: r.status, data: await r.json() };
};
const sign = raw => 'sha256=' + createHmac('sha256', APP_SECRET).update(raw).digest('hex');
const hook = async (value, signature) => {
  const raw = JSON.stringify({ entry: [{ changes: [{ value }] }] });
  const r = await fetch(BASE + '/api/whatsapp/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature ?? sign(raw) }, body: raw });
  return r.status;
};
const msg = ref => sql(`SELECT m.kind || '|' || m.status || '|' || m.lang FROM whatsapp_messages m JOIN bookings b ON b.id = m.booking_id WHERE b.reference = '${ref}' AND m.audience = 'customer' ORDER BY m.id`).split(/\r?\n/).filter(Boolean);
const posts = () => seen.filter(s => s.method === 'POST');
const keep = ['whatsapp', 'whatsapp_api', 'whatsapp_secrets', 'team_events'].map(k => [k, sql(`SELECT value FROM settings WHERE key = '${k}'`)]);

try {
  sql('DELETE FROM rate_limits');
  const email = `admin-wa-${run}@teste.local`, PASS = 'Mensagens-teste-2026';
  const token = execSync(`${PHP_CLI} api/bin/create-user.php "Admin WhatsApp" ${email} admin`, { encoding: 'utf8', env: { ...process.env, MCA_CONFIG: cfg } }).match(/token=([a-f0-9]{64})/)[1];
  await admin.call('POST', '/setup-password', { token, password: PASS });
  const login = await admin.call('POST', '/login', { email, password: PASS });
  if (login.status !== 200) throw new Error('login falhou: ' + login.status);
  sql("UPDATE settings SET value = '{\"enabled\": false, \"recipients\": []}'::jsonb WHERE key = 'whatsapp'");
  sql("DELETE FROM settings WHERE key IN ('whatsapp_secrets', 'team_events')");

  /* Credenciais */
  const saved = await admin.call('POST', '/whatsapp/settings', { phone_number_id: '1234567890', waba_id: '555', app_id: '777', api_version: 'v21.0', sender_number: '+258 84 999 9999', customer_enabled: true, reminder_days: 1, token: TOKEN, app_secret: APP_SECRET, verify_token: VERIFY });
  await test('K1 credenciais guardadas e devolvidas só como estado', () => [saved.status, saved.data.status.has_token, saved.data.status.has_app_secret, JSON.stringify(saved.data).includes(TOKEN), JSON.stringify(saved.data).includes(APP_SECRET)], [200, true, true, false, false]);
  await test('K2 na base de dados o token está cifrado', () => { const v = sql("SELECT value FROM settings WHERE key = 'whatsapp_secrets'"); return [v.includes(TOKEN), v.includes(APP_SECRET), v.length > 40]; }, [false, false, true]);
  await test('K3 auditoria não contém segredos', () => sql(`SELECT count(*) FROM audit_log WHERE data::text LIKE '%${TOKEN}%'`), '0');
  await test('K4 definições do painel não mostram segredos', async () => { const t = JSON.stringify((await admin.call('GET', '/settings')).data); return [t.includes(TOKEN), t.includes(VERIFY), t.includes('1234567890')]; }, [false, false, false]);
  await test('K5 guardar sem token mantém o anterior', async () => (await admin.call('POST', '/whatsapp/settings', { token: '', app_id: '778' })).data.status.has_token, true);
  await test('K6 identificador inválido → 422', async () => (await admin.call('POST', '/whatsapp/settings', { phone_number_id: 'abc' })).data.error, 'whatsapp_invalid_id');
  await test('K7 número remetente recusado como destinatário da equipa', async () => (await admin.call('POST', '/settings/whatsapp', { enabled: true, recipients: ['+258 84 999 9999'] })).data.error, 'whatsapp_sender_recipient');

  /* Ligação */
  await test('L1 testar ligação devolve o número e a qualidade', async () => { const d = (await admin.call('POST', '/whatsapp/check', {})).data; return [d.ok, d.number, d.quality, seen.at(-1).auth === `Bearer ${TOKEN}`]; }, [true, '+258 84 000 0000', 'GREEN', true]);
  reply.push([401, { error: { code: 190, message: 'Error validating access token: Session has expired' } }]);
  await test('L2 token expirado é identificado', async () => { const d = (await admin.call('POST', '/whatsapp/check', {})).data; return [d.ok, d.expired]; }, [false, true]);

  /* Consentimento */
  const noConsent = await book(1);
  await test('C1 sem consentimento: reserva feita, nenhuma mensagem', () => [noConsent.status, msg(noConsent.data.reference).length, posts().length], [201, 0, 0]);
  const stringy = await book(2, { whatsapp_opt_in: 'false' });
  await test('C2 consentimento só com verdadeiro explícito', () => [stringy.status, sql(`SELECT whatsapp_opt_in FROM bookings WHERE reference = '${stringy.data.reference}'`)], [201, 'f']);
  const pt = await book(3, { whatsapp_opt_in: true });
  const ptRef = pt.data.reference;
  await test('C3 com consentimento (PT): enviada com o modelo e a língua certos', () => { const p = posts().at(-1).body; return [msg(ptRef), p.template.name, p.template.language.code, p.template.components[0].parameters.map(x => x.text)[1], p.template.components[0].parameters.length, 'whatsapp' in pt.data]; }, [['booking_received|sent|pt'], 'mca_reserva_recebida', 'pt_PT', ptRef, 8, false]);
  const en = await book(4, { whatsapp_opt_in: true, lang: 'en' });
  await test('C4 com consentimento (EN): modelo em inglês', () => { const p = posts().at(-1).body; return [msg(en.data.reference), p.template.language.code, p.template.components[0].parameters[7].text]; }, [['booking_received|sent|en'], 'en_US', 'Request received']);

  /* Falhas */
  reply.push([400, { error: { code: 132001, message: 'Template does not exist', error_data: { details: 'template name does not exist' } } }]);
  const bad = await book(5, { whatsapp_opt_in: true });
  await test('F1 erro da Meta: reserva mantém-se, mensagem fica falhada com o motivo', () => [bad.status, msg(bad.data.reference), sql(`SELECT error LIKE '%132001%' FROM whatsapp_messages m JOIN bookings b ON b.id = m.booking_id WHERE b.reference = '${bad.data.reference}'`)], [201, ['booking_received|failed|pt'], 't']);
  const badId = sql(`SELECT m.id FROM whatsapp_messages m JOIN bookings b ON b.id = m.booking_id WHERE b.reference = '${bad.data.reference}'`);
  const before = posts().length;
  const [r1, r2] = await Promise.all([admin.call('POST', `/whatsapp/${badId}/resend`, {}), admin.call('POST', `/whatsapp/${badId}/resend`, {})]);
  await test('R1 dois reenvios em simultâneo enviam uma só vez, na mesma linha', () => [[r1.status, r2.status].sort(), posts().length - before, msg(bad.data.reference)], [[200, 409], 1, ['booking_received|sent|pt']]);
  await test('R2 mensagem enviada não pode ser reenviada', async () => (await admin.call('POST', `/whatsapp/${badId}/resend`, {})).status, 409);

  reply.push([503, { error: { code: 1, message: 'Temporarily unavailable' } }]);
  const tmp = await book(6, { whatsapp_opt_in: true });
  await test('F2 falha temporária fica pendente', () => msg(tmp.data.reference), ['booking_received|pending|pt']);
  const n2 = posts().length;
  await worker();
  await test('F3 antes do tempo de espera o worker não repete', () => posts().length - n2, 0);
  sql(`UPDATE whatsapp_messages SET next_attempt_at = now() WHERE status = 'pending'`);
  await worker(); await worker();
  await test('F4 o worker repete uma vez e fica enviada', () => [posts().length - n2, msg(tmp.data.reference)], [1, ['booking_received|sent|pt']]);

  const dead = await book(7);
  sql(`UPDATE bookings SET whatsapp_opt_in = true WHERE reference = '${dead.data.reference}'`);
  sql(`INSERT INTO whatsapp_messages (kind, to_number, template, booking_id, dedupe_key, locked_at) SELECT 'booking_received', '258840000001', 'x', id, 'lost:${run}', now() - interval '10 minutes' FROM bookings WHERE reference = '${dead.data.reference}'`);
  const n3 = posts().length;
  await worker();
  await test('F5 envio interrompido não se repete sozinho', () => [posts().length - n3, msg(dead.data.reference)], [0, ['booking_received|failed|pt']]);

  reply.push('drop');
  const cut = await book(15, { whatsapp_opt_in: true });
  const n5 = posts().length;
  await worker();
  await test('F6 sem resposta da Meta: falhada, avisa para confirmar e não se repete', () => [cut.status, msg(cut.data.reference), posts().length - n5, sql(`SELECT error LIKE '%confirme antes%' FROM whatsapp_messages m JOIN bookings b ON b.id = m.booking_id WHERE b.reference = '${cut.data.reference}'`)], [201, ['booking_received|failed|pt'], 0, 't']);

  /* Webhook */
  const verify = q => fetch(`${BASE}/api/whatsapp/webhook?${q}`);
  await test('W1 verificação com token certo devolve o desafio', async () => { const r = await verify(`hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=12345`); return [r.status, await r.text()]; }, [200, '12345']);
  await test('W2 verificação com token errado → 403', async () => (await verify('hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1')).status, 403);
  const wamid = sql(`SELECT provider_id FROM whatsapp_messages m JOIN bookings b ON b.id = m.booking_id WHERE b.reference = '${ptRef}'`);
  const ts = Math.floor(Date.now() / 1000);
  await test('W3 assinatura inválida → 403 e nada muda', async () => [await hook({ statuses: [{ id: wamid, status: 'delivered', timestamp: ts }] }, 'sha256=00'), msg(ptRef)], [403, ['booking_received|sent|pt']]);
  await test('W4 entrega confirmada', async () => [await hook({ statuses: [{ id: wamid, status: 'delivered', timestamp: ts }] }), msg(ptRef)], [200, ['booking_received|delivered|pt']]);
  await test('W5 leitura confirmada', async () => [await hook({ statuses: [{ id: wamid, status: 'read', timestamp: ts }] }), msg(ptRef)], [200, ['booking_received|read|pt']]);
  await test('W6 evento fora de ordem não faz o estado recuar', async () => { const o = sql(`SELECT count(*) FROM whatsapp_events WHERE wamid = '${wamid}'`); await hook({ statuses: [{ id: wamid, status: 'sent', timestamp: ts }] }); return [msg(ptRef), +sql(`SELECT count(*) FROM whatsapp_events WHERE wamid = '${wamid}'`) - +o]; }, [['booking_received|read|pt'], 1]);
  await test('W7 evento repetido é ignorado', async () => { await hook({ statuses: [{ id: wamid, status: 'read', timestamp: ts }] }); return sql(`SELECT count(*) FROM whatsapp_events WHERE wamid = '${wamid}' AND event_key LIKE '%:read'`); }, '1');
  const enId = sql(`SELECT provider_id FROM whatsapp_messages m JOIN bookings b ON b.id = m.booking_id WHERE b.reference = '${en.data.reference}'`);
  await test('W8 falha de entrega regista o motivo', async () => { await hook({ statuses: [{ id: enId, status: 'failed', timestamp: ts, errors: [{ code: 131026, title: 'Message undeliverable' }] }] }); return [msg(en.data.reference), sql(`SELECT error FROM whatsapp_messages WHERE provider_id = '${enId}'`)]; }, [['booking_received|failed|en'], 'Meta 131026: Message undeliverable']);
  const out = posts().length;
  const from = `25884${run}`;
  await test('W9 STOP regista a saída e não responde', async () => [await hook({ messages: [{ id: `wamid.in.${run}`, from, type: 'text', text: { body: ' Stop ' } }] }), sql(`SELECT source FROM whatsapp_optouts WHERE number = '${from}'`), posts().length - out], [200, 'whatsapp', 0]);
  await test('W10 mensagem recebida aparece no histórico', async () => (await admin.call('GET', '/whatsapp')).data.inbound.some(m => m.from_number === from), true);
  const blocked = await book(8, { whatsapp_opt_in: true });
  await test('W11 depois do STOP o número não recebe mais', () => [blocked.status, msg(blocked.data.reference).length], [201, 0]);
  await test('W12 reenvio a quem saiu é recusado', async () => { const r = await admin.call('POST', `/whatsapp/${sql(`SELECT id FROM whatsapp_messages WHERE provider_id = '${enId}'`)}/resend`, {}); return [r.status, r.data.error]; }, [422, 'whatsapp_not_allowed']);
  sql(`DELETE FROM whatsapp_optouts WHERE number = '${from}'`);

  /* Estados da reserva */
  const c = await book(9, { whatsapp_opt_in: true });
  await admin.call('POST', `/bookings/${c.data.reference}/status`, { status: 'confirmada', note: '', notify: true });
  await test('E1 confirmar envia a confirmação', () => msg(c.data.reference), ['booking_received|sent|pt', 'booking_confirmed|sent|pt']);
  await admin.call('POST', `/bookings/${c.data.reference}/whatsapp-change`, { note: 'Saída às 09:00 em vez das 08:00' });
  await test('E2 aviso de alteração leva o texto', () => [msg(c.data.reference).length, posts().at(-1).body.template.name, posts().at(-1).body.template.components[0].parameters[4].text], [3, 'mca_reserva_alterada', 'Saída às 09:00 em vez das 08:00']);
  await test('E3 alteração sem texto → 422', async () => (await admin.call('POST', `/bookings/${c.data.reference}/whatsapp-change`, { note: '' })).data.error, 'note_required');
  const quiet = await book(10, { whatsapp_opt_in: true });
  await admin.call('POST', `/bookings/${quiet.data.reference}/status`, { status: 'confirmada', note: '', notify: false });
  await test('E4 «não notificar» também vale para o WhatsApp', () => msg(quiet.data.reference).length, 1);
  await admin.call('POST', `/bookings/${quiet.data.reference}/status`, { status: 'cancelada', note: 'Mau tempo', notify: true });
  await test('E5 cancelar envia o motivo', () => [msg(quiet.data.reference).at(-1), posts().at(-1).body.template.components[0].parameters[4].text], ['booking_cancelled|sent|pt', 'Mau tempo']);

  /* Lembretes */
  const rem = await book(11, { whatsapp_opt_in: true, date: day(1) });
  if (rem.status === 201) {
    await admin.call('POST', `/bookings/${rem.data.reference}/status`, { status: 'confirmada', note: '', notify: false });
    sql(`UPDATE bookings SET service_date = (now() AT TIME ZONE 'Africa/Maputo')::date + 1 WHERE reference = '${rem.data.reference}'`);
    const hour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Maputo' })).getHours();
    await worker(); await worker();
    await test('M1 lembrete enviado uma só vez, a partir das 08:00', () => msg(rem.data.reference).filter(x => x.startsWith('activity_reminder')).length, hour >= 8 ? 1 : 0);
  }

  /* Desligado e indicadores */
  await admin.call('POST', '/whatsapp/settings', { events: { booking_received: false } });
  const off = await book(12, { whatsapp_opt_in: true });
  await test('D1 tipo de mensagem desligado não envia', () => msg(off.data.reference).length, 0);
  await admin.call('POST', '/whatsapp/settings', { customer_enabled: false, events: { booking_received: true } });
  const off2 = await book(13, { whatsapp_opt_in: true });
  await test('D2 envio a clientes desligado não envia', () => msg(off2.data.reference).length, 0);
  await admin.call('POST', '/settings/whatsapp', { enabled: true, recipients: ['258841234567'] });
  await admin.call('POST', '/settings/team_events', { email_new_booking: true, email_proof: true, whatsapp_new_booking: false });
  const n4 = posts().length;
  await book(14);
  await test('D3 aviso interno desligado não vai à equipa', () => posts().length - n4, 0);
  await test('I1 indicadores e filtros vêm da base de dados', async () => { const d = (await admin.call('GET', `/whatsapp?status=read&q=${ptRef}`)).data; return [d.messages.length, d.messages[0].status, d.stats.read >= 1, d.stats.failed >= 1]; }, [1, 'read', true, true]);
  await test('I2 sem sessão o histórico é recusado', async () => (await fetch(BASE + '/api/admin/whatsapp')).status, 401);
} catch (e) {
  results.push(false);
  console.log('FAIL  execução interrompida: ' + e.message);
} finally {
  for (const [k, v] of keep) {
    if (v) sql(`INSERT INTO settings (key, value) VALUES ('${k}', '${v.replace(/'/g, "''")}'::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    else sql(`DELETE FROM settings WHERE key = '${k}'`);
  }
  php.kill();
  mock.close();
  rmSync(dir, { recursive: true, force: true });
}
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} testes passaram`);
process.exit(failed ? 1 : 0);
