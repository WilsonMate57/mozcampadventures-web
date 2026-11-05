/**
 * MOZ CAMP ADVENTURES — tests/chat.mjs
 * =====================================================
 * Live Chat pela API, integração com reservas, disponibilidade e WhatsApp, e carga do polling.
 * SÓ em desenvolvimento (e-mail e WhatsApp em modo de teste: nada sai para fora).
 *   API_BASE (por omissão http://localhost:8791)   PHP_CLI   MCA_CONFIG   PSQL
 * Uso: node tests/chat.mjs
 * =====================================================
 */

import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { PHP_CLI, MCA_CONFIG, PSQL } = process.env;
if (!PHP_CLI || !MCA_CONFIG || !PSQL) { console.error('Defina PHP_CLI, MCA_CONFIG e PSQL (ver cabeçalho).'); process.exit(2); }
const BASE = process.env.API_BASE || 'http://localhost:8791';
const STORAGE = 'C:/Users/kumbe/mca-dev/storage';
const sql = q => execSync(`${PSQL} -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const worker = () => execSync(`${PHP_CLI} api/bin/worker.php`, { encoding: 'utf8' });
const run = randomUUID().slice(0, 6), PASS = 'Conversa-teste-2026', IT = 'whale-watching';
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const results = [];
async function test(name, fn, expected) {
  try {
    const got = await fn();
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(expected)}`}`);
  } catch (e) { results.push(false); console.log(`FAIL  ${name}  → erro: ${e.message.split('\n')[0]}`); }
}

/* Cada visitante tem o seu cookie, como browsers diferentes */
function visitor() {
  const v = { cookie: '' };
  v.req = async (method, path, body, opts = {}) => {
    const headers = { ...(opts.noOrigin ? {} : { Origin: BASE }) };
    if (v.cookie) headers.Cookie = v.cookie;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(BASE + path, { method, headers, body: payload });
    const set = r.headers.get('set-cookie') || '';
    if (set.startsWith('mca_chat=')) { v.raw = set; v.cookie = set.split(';')[0]; }
    const type = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, data: type.includes('json') ? await r.json() : null };
  };
  v.call = (method, path, body, opts) => v.req(method, '/api/chat' + path, body, opts);
  v.start = (extra = {}) => { sql('DELETE FROM rate_limits'); return v.call('POST', '/start', { name: 'Ana Teste', email: `ana-${run}@example.com`, phone: '+258 84 123 4567', subject: 'safaris', message: 'Olá, têm vagas?', lang: 'pt', page: '/tours/whale-watching/', website: '', ...extra }); };
  v.say = (body, client_id = randomUUID()) => v.call('POST', '/messages', { body, client_id });
  v.poll = (after = 0, open = true) => v.call('GET', `/poll?after=${after}${open ? '&open=1' : ''}`);
  return v;
}
function staff() {
  const c = { cookie: '', csrf: '' };
  c.call = async (method, path, body, opts = {}) => {
    const headers = { Origin: BASE };
    if (c.cookie) headers.Cookie = c.cookie;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    if (method !== 'GET' && c.csrf && opts.csrf !== false) headers['X-CSRF-Token'] = c.csrf;
    const r = await fetch(BASE + '/api/admin' + path, { method, headers, body: payload });
    const set = r.headers.get('set-cookie');
    if (set && set.startsWith('mca_admin=')) c.cookie = set.split(';')[0];
    const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
    if (data && data.csrf) c.csrf = data.csrf;
    return { status: r.status, data };
  };
  return c;
}
async function user(c, name, email, role) {
  const token = execSync(`${PHP_CLI} api/bin/create-user.php "${name}" ${email} ${role}`, { encoding: 'utf8' }).match(/token=([a-f0-9]{64})/)[1];
  await c.call('POST', '/setup-password', { token, password: PASS });
  const r = await c.call('POST', '/login', { email, password: PASS });
  if (r.status !== 200) throw new Error('login falhou: ' + email);
}
const convId = email => sql(`SELECT id FROM chat_conversations WHERE email = '${email}' ORDER BY id DESC LIMIT 1`);
const fileForm = (bytes, name, type, cid = randomUUID()) => { const f = new FormData(); f.append('file', new Blob([bytes], { type }), name); f.append('client_id', cid); return f; };

const keep = ['chat', 'whatsapp_api'].map(k => [k, sql(`SELECT value FROM settings WHERE key = '${k}'`)]);
const setChat = v => sql(`UPDATE settings SET value = '${JSON.stringify(v)}'::jsonb WHERE key = 'chat'`);
const CHAT = { enabled: true, hours: {}, retention_months: 12, notify_offline: true };
const admin = staff(), mgr = staff(), other = staff(), anon = staff();
const a = visitor(), b = visitor();

try {
  sql('DELETE FROM rate_limits');
  sql("UPDATE chat_agents SET status = 'offline'");
  setChat(CHAT);
  await user(admin, 'Admin Chat', `admin-chat-${run}@teste.local`, 'admin');
  await user(mgr, 'Gerente Chat', `gerente-chat-${run}@teste.local`, 'gerente');
  sql(`INSERT INTO roles (code, name, permissions) VALUES ('sem-chat-${run}', 'Sem chat', ARRAY['dashboard.view'])`);
  const tok = execSync(`${PHP_CLI} api/bin/create-user.php "Sem Chat" sem-chat-${run}@teste.local gerente`, { encoding: 'utf8' }).match(/token=([a-f0-9]{64})/)[1];
  await other.call('POST', '/setup-password', { token: tok, password: PASS });
  sql(`UPDATE users SET role_id = (SELECT id FROM roles WHERE code = 'sem-chat-${run}') WHERE email = 'sem-chat-${run}@teste.local'`);
  await other.call('POST', '/login', { email: `sem-chat-${run}@teste.local`, password: PASS });
  const adminId = sql(`SELECT id FROM users WHERE email = 'admin-chat-${run}@teste.local'`), mgrId = sql(`SELECT id FROM users WHERE email = 'gerente-chat-${run}@teste.local'`);

  /* Identificação do visitante */
  await test('V1 estado sem equipa: offline e sem sessão', async () => { const d = (await a.call('GET', '/status')).data; return [d.enabled, d.state, d.session]; }, [true, 'offline', false]);
  await test('V2 sem cookie, a consulta é recusada', async () => (await a.call('GET', '/poll')).status, 401);
  await test('V3 token inventado é recusado', async () => { const x = visitor(); x.cookie = 'mca_chat=' + 'a'.repeat(64); return (await x.call('GET', '/poll')).status; }, 401);
  for (const [name, extra, code] of [['nome', { name: 'A' }, 'invalid_name'], ['e-mail', { email: 'nao-email' }, 'invalid_email'], ['telefone', { phone: '12' }, 'invalid_phone'], ['assunto', { subject: 'x' }, 'invalid_subject'], ['mensagem', { message: '  ' }, 'invalid_message']]) {
    await test(`V4 validação no servidor: ${name}`, async () => (await visitor().start(extra)).data.error, code);
  }
  await test('V5 telefone é opcional', async () => { const x = visitor(); return (await x.start({ phone: '', email: `sem-tel-${run}@example.com` })).status; }, 200);
  await test('V6 campo-armadilha → 400', async () => (await visitor().start({ website: 'http://spam' })).status, 400);
  await test('V7 origem desconhecida → 403', async () => (await a.call('POST', '/start', { name: 'X' }, { noOrigin: true })).status, 403);
  sql('DELETE FROM rate_limits');
  await test('V8 limite de conversas por IP → 429', async () => { let last; for (let i = 0; i < 7; i++) last = await visitor().call('POST', '/start', { name: 'Y', email: 'e', subject: 'other', message: 'x' }); return last.status; }, 429);

  const emailA = `ana-${run}@example.com`, emailB = `bruno-${run}@example.com`;
  const started = await a.start({ item: IT });
  const idA = convId(emailA);
  await test('C1 visitante inicia conversa offline: sem conta, cookie protegido', () => [started.status, started.data.state, /HttpOnly/i.test(a.raw), /SameSite=Strict/i.test(a.raw), sql(`SELECT offline FROM chat_conversations WHERE id = ${idA}`)], [200, 'offline', true, true, 't']);
  await test('C2 na base de dados só fica o hash do token', () => sql(`SELECT token_hash = '${a.cookie.split('=')[1]}' FROM chat_conversations WHERE id = ${idA}`), 'f');
  await test('C3 sem equipa, a equipa é avisada por e-mail', () => sql(`SELECT count(*) FROM email_log WHERE kind = 'chat_offline' AND related_id = ${idA}`), '1');
  await test('C4 sessão repetida não cria outra conversa', async () => (await a.call('POST', '/start', { name: 'Ana', email: emailA, subject: 'other', message: 'x' })).data.error, 'chat_exists');
  await test('C5 sessão recuperada ao voltar (mesmo cookie)', async () => { const s = (await a.call('GET', '/status')).data; const p = (await a.poll()).data; return [s.session, p.messages.map(m => m.body)]; }, [true, ['Olá, têm vagas?']]);

  /* Atendimento */
  await test('P1 sem sessão de equipa → 401; sem permissão → 403', async () => [(await anon.call('GET', '/chat')).status, (await other.call('GET', '/chat')).status, (await other.call('POST', `/chat/${idA}/messages`, { body: 'x', client_id: randomUUID() })).status], [401, 403, 403]);
  await test('P2 escrita sem token CSRF → 403', async () => (await admin.call('POST', `/chat/${idA}/messages`, { body: 'x', client_id: randomUUID() }, { csrf: false })).status, 403);
  await test('P3 equipa recebe a conversa com contexto do pacote', async () => { const d = (await admin.call('GET', `/chat/${idA}`)).data; return [d.conversation.name, d.conversation.subject_label, d.conversation.origin_page, d.item.id, d.messages.length, 'token_hash' in d.conversation, 'ip_hash' in d.conversation]; }, ['Ana Teste', 'Safaris', '/tours/whale-watching/', IT, 1, false, false]);
  await test('P4 lista: conta como nova, não atribuída e a aguardar', async () => { const c = (f) => admin.call('GET', `/chat?filter=${f}&q=${emailA}`).then(r => r.data.conversations.length); const row = (await admin.call('GET', `/chat?filter=new`)).data.conversations.find(x => +x.id === +idA); return [row.unread, row.assigned_to, row.last_preview, await c('open')]; }, [1, null, 'Olá, têm vagas?', 1]);

  await admin.call('POST', '/chat/heartbeat', { status: 'online', active: true });
  await test('D1 agente online com heartbeat e actividade', async () => (await visitor().call('GET', '/status')).data.state, 'online');

  const cid = randomUUID();
  const r1 = await admin.call('POST', `/chat/${idA}/messages`, { body: 'Temos sim!', client_id: cid });
  await test('R1 equipa responde; fica responsável e a primeira resposta é registada', () => [r1.status, sql(`SELECT assigned_to = ${adminId}, first_response_at IS NOT NULL FROM chat_conversations WHERE id = ${idA}`)], [200, 't|t']);
  await test('R2 visitante recebe a resposta na consulta seguinte, só com o primeiro nome', async () => { const m = (await a.poll(+started.data.message.id)).data.messages; return [m.length, m[0].from, m[0].author, m[0].body, m[0].cid]; }, [1, 'agent', 'Admin', 'Temos sim!', null]);
  await test('R3 repetir com o mesmo id não duplica (equipa)', async () => { await admin.call('POST', `/chat/${idA}/messages`, { body: 'Temos sim!', client_id: cid }); return sql(`SELECT count(*) FROM chat_messages WHERE conversation_id = ${idA} AND sender = 'agent'`); }, '1');
  const vc = randomUUID();
  await test('R4 repetir com o mesmo id não duplica (visitante)', async () => { const x = await a.say('Obrigada', vc); const y = await a.say('Obrigada', vc); return [x.data.message.id === y.data.message.id, sql(`SELECT count(*) FROM chat_messages WHERE conversation_id = ${idA} AND client_id = '${vc}'`)]; }, [true, '1']);
  await test('R5 estado «lida»: visitante vê quando a equipa leu', async () => { await admin.call('GET', `/chat/${idA}?read=1`); const p = (await a.poll()).data; return p.read_upto >= +sql(`SELECT max(id) FROM chat_messages WHERE conversation_id = ${idA} AND sender = 'visitor'`); }, true);
  await test('R6 por ler: conta com a janela fechada e limpa ao abrir', async () => { await admin.call('POST', `/chat/${idA}/messages`, { body: 'Mais uma coisa', client_id: randomUUID() }); const closed = (await a.poll(0, false)).data.unread; const open = (await a.poll(0, true)).data.unread; return [closed, open]; }, [1, 0]);
  await test('R7 indicador de escrita nos dois sentidos', async () => { await a.call('POST', '/typing', {}); await admin.call('POST', `/chat/${idA}/typing`, {}); return [(await admin.call('GET', `/chat/${idA}`)).data.conversation.visitor_typing, (await a.poll()).data.typing]; }, [true, true]);
  await test('R8 mensagem vazia → 422; id inválido → 422', async () => [(await a.say('   ')).status, (await a.call('POST', '/messages', { body: 'x', client_id: '1' })).status], [422, 422]);
  await test('R9 texto com HTML é guardado como texto', async () => { const t = '<img src=x onerror=alert(1)>'; await a.say(t); return (await a.poll()).data.messages.at(-1).body === t; }, true);
  sql('DELETE FROM rate_limits');
  await test('R10 limite de mensagens por minuto → 429', async () => { let last; for (let i = 0; i < 32; i++) last = await a.say('spam ' + i); return last.status; }, 429);
  sql('DELETE FROM rate_limits');

  /* Isolamento */
  await b.start({ name: 'Bruno Teste', email: emailB, phone: '', subject: 'transfers', message: 'Mensagem privada do Bruno' });
  const idB = convId(emailB);
  await test('I1 cada visitante só vê a sua conversa', async () => { const pa = JSON.stringify((await a.poll()).data), pb = JSON.stringify((await b.poll()).data); return [pa.includes('Bruno'), pb.includes('Temos sim'), pb.includes('Ana')]; }, [false, false, false]);
  const up = await a.call('POST', '/upload', fileForm(PNG, 'mapa.png', 'image/png'));
  const fileId = up.data.message?.id;
  await test('I2 ficheiro de outro visitante → 404; sem sessão → 401', async () => [(await b.call('GET', `/file/${fileId}`)).status, (await visitor().call('GET', `/file/${fileId}`)).status], [404, 401]);

  /* Ficheiros */
  await test('F1 imagem válida aceite, com o tipo real e protegida', async () => { const r = await a.call('GET', `/file/${fileId}`); return [up.status, up.data.message.file.name, r.status, r.headers.get('content-type'), r.headers.get('x-content-type-options'), /sandbox/.test(r.headers.get('content-security-policy'))]; }, [200, 'mapa.png', 200, 'image/png', 'nosniff', true]);
  await test('F2 equipa abre o ficheiro no painel', async () => (await fetch(`${BASE}/api/admin/chat/file/${fileId}`, { headers: { Cookie: admin.cookie } })).status, 200);
  await test('F3 ficheiro fora da pasta pública', () => { const p = sql(`SELECT file_path FROM chat_messages WHERE id = ${fileId}`); return [p.startsWith(`chat/${idA}/`), existsSync(join(STORAGE, p)), !p.includes('mapa')]; }, [true, true, true]);
  await test('F4 executável com nome de imagem → 415', async () => (await a.call('POST', '/upload', fileForm(Buffer.from('MZ\x90\x00 fake'), 'foto.png', 'image/png'))).status, 415);
  await test('F5 SVG com script → 415', async () => (await a.call('POST', '/upload', fileForm(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg', 'image/svg+xml'))).status, 415);
  await test('F6 PNG falso (só a assinatura) → 415', async () => (await a.call('POST', '/upload', fileForm(Buffer.concat([PNG.subarray(0, 8), Buffer.from('lixo')]), 'x.png', 'image/png'))).status, 415);
  await test('F7 mais de 5 MB → 413', async () => (await a.call('POST', '/upload', fileForm(Buffer.concat([PNG, Buffer.alloc(5242881)]), 'grande.png', 'image/png'))).status, 413);
  await test('F8 PDF é aceite e descarregado, nunca aberto no site', async () => { const u = await a.call('POST', '/upload', fileForm(Buffer.from('%PDF-1.4\n%fim'), '../../evil name.pdf', 'application/pdf')); const r = await a.call('GET', `/file/${u.data.message.id}`); return [u.data.message.file.name.includes('/'), /^attachment/.test(r.headers.get('content-disposition'))]; }, [false, true]);

  /* Notas internas */
  const SECRET = `nota-secreta-${run}`;
  await admin.call('POST', `/chat/${idA}/notes`, { body: SECRET });
  await test('N1 nota visível à equipa', async () => (await mgr.call('GET', `/chat/${idA}`)).data.notes.map(n => n.body), [SECRET]);
  await test('N2 nota nunca chega ao visitante', async () => { const t = JSON.stringify([(await a.poll()).data, (await a.call('GET', '/status')).data]); return [t.includes(SECRET), sql(`SELECT count(*) FROM chat_messages WHERE body LIKE '%${SECRET}%'`)]; }, [false, '0']);
  await test('N3 auditoria regista a nota sem o texto', () => [sql(`SELECT count(*) FROM audit_log WHERE action = 'chat_note' AND entity_id = '${idA}'`), sql(`SELECT count(*) FROM audit_log WHERE data::text LIKE '%${SECRET}%'`)], ['1', '0']);

  /* Vários administradores */
  await test('M1 dois agentes a assumir ao mesmo tempo: só um fica', async () => { const r = await Promise.all([admin.call('POST', `/chat/${idB}/assign`, { take: true }), mgr.call('POST', `/chat/${idB}/assign`, { take: true })]); return [r.map(x => x.status).sort(), sql(`SELECT assigned_to IN (${adminId}, ${mgrId}) FROM chat_conversations WHERE id = ${idB}`)]; }, [[200, 409], 't']);
  await test('M2 atribuir a outro agente', async () => { await admin.call('POST', `/chat/${idB}/assign`, { user_id: +mgrId }); return sql(`SELECT assigned_to FROM chat_conversations WHERE id = ${idB}`); }, mgrId);
  await test('M3 não atribui a quem não atende', async () => (await admin.call('POST', `/chat/${idB}/assign`, { user_id: +sql(`SELECT id FROM users WHERE email = 'sem-chat-${run}@teste.local'`) })).data.error, 'chat_invalid_agent');
  await test('M4 agente vê que outro está a escrever', async () => { await admin.call('POST', `/chat/${idB}/typing`, {}); const c = (await mgr.call('GET', `/chat/${idB}`)).data.conversation, own = (await admin.call('GET', `/chat/${idB}`)).data.conversation; return [c.other_typing, c.typing_name, own.other_typing]; }, [true, 'Admin Chat', false]);
  await test('M5 respostas de dois agentes chegam ao visitante pela ordem', async () => { await mgr.call('POST', `/chat/${idB}/messages`, { body: 'Olá do gerente', client_id: randomUUID() }); await admin.call('POST', `/chat/${idB}/messages`, { body: 'Olá do admin', client_id: randomUUID() }); return (await b.poll()).data.messages.filter(m => m.from === 'agent').map(m => m.author); }, ['Gerente', 'Admin']);

  /* Filtros, pesquisa, encerrar */
  await test('L1 pesquisa por nome, e-mail e telefone', async () => { const f = async t => (await admin.call('GET', `/chat?q=${encodeURIComponent(t)}`)).data.conversations.some(c => +c.id === +idA); return [await f('Ana Tes'), await f(emailA), await f('84 123 4567'), await f('nada-disto-existe')]; }, [true, true, true, false]);
  await test('L2 pesquisa trata % como texto', async () => (await admin.call('GET', '/chat?q=%25')).data.conversations.length, 0);
  await test('E1 encerrar: sai das abertas e bloqueia a resposta', async () => { await admin.call('POST', `/chat/${idB}/close`, {}); const has = async f => (await admin.call('GET', `/chat?filter=${f}`)).data.conversations.some(c => +c.id === +idB); return [await has('open'), await has('closed'), (await admin.call('POST', `/chat/${idB}/messages`, { body: 'x', client_id: randomUUID() })).data.error, (await b.poll()).data.status]; }, [false, true, 'chat_closed', 'closed']);
  await test('E2 reabrir no painel', async () => { await admin.call('POST', `/chat/${idB}/reopen`, {}); return sql(`SELECT status, closed_at IS NULL FROM chat_conversations WHERE id = ${idB}`); }, 'open|t');
  await test('E3 visitante que escreve reabre a conversa, com o histórico', async () => { await admin.call('POST', `/chat/${idB}/close`, {}); await b.say('Ainda preciso de ajuda'); return [sql(`SELECT status FROM chat_conversations WHERE id = ${idB}`), (await b.poll()).data.messages.length > 2]; }, ['open', true]);
  await test('E4 operações registadas na auditoria', () => ['chat_assign', 'chat_close', 'chat_reopen', 'chat_status'].map(x => +sql(`SELECT count(*) FROM audit_log WHERE action = '${x}'`) > 0), [true, true, true, true]);

  /* Disponibilidade da equipa */
  const state = async () => (await visitor().call('GET', '/status')).data.state;
  await test('D2 sem interacção durante 15 minutos: ausente, mesmo com o painel aberto', async () => { sql(`UPDATE chat_agents SET last_active_at = now() - interval '16 minutes' WHERE user_id = ${adminId}`); await admin.call('POST', '/chat/heartbeat', { active: false }); return state(); }, 'away');
  await test('D3 interacção real volta a online', async () => { await admin.call('POST', '/chat/heartbeat', { active: true }); return state(); }, 'online');
  await test('D4 sem heartbeat há mais de 90 s: offline, mesmo marcado online', async () => { sql(`UPDATE chat_agents SET last_seen_at = now() - interval '2 minutes' WHERE user_id = ${adminId}`); return state(); }, 'offline');
  await test('D5 estado escolhido offline prevalece', async () => { await admin.call('POST', '/chat/heartbeat', { status: 'offline' }); return state(); }, 'offline');
  await test('D6 agente desactivado não conta', async () => { await admin.call('POST', '/chat/heartbeat', { status: 'online' }); await mgr.call('POST', '/chat/heartbeat', { status: 'offline' }); sql(`UPDATE users SET active = false WHERE id = ${adminId}`); const s = await state(); sql(`UPDATE users SET active = true WHERE id = ${adminId}`); return s; }, 'offline');
  await test('D7 fora do horário: offline, mesmo com agente online', async () => { await admin.call('POST', '/chat/heartbeat', { status: 'online' }); const n = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Maputo' })).getDay() || 7; const other = n === 7 ? 1 : n + 1; setChat({ ...CHAT, hours: { [other]: { from: '08:00', to: '17:00' } } }); const s = await state(); setChat(CHAT); return s; }, 'offline');
  const hoursFile = join(tmpdir(), `mca-chat-hours-${run}.php`);
  writeFileSync(hoursFile, `<?php require ${JSON.stringify(resolve('api/src/Chat.php'))};
$h = ['1' => ['from' => '08:00', 'to' => '17:00']]; $m = new DateTimeZone('Africa/Maputo');
foreach (['2026-11-02 07:59', '2026-11-02 08:00', '2026-11-02 16:59', '2026-11-02 17:00', '2026-11-03 09:00'] as $t) echo (int) Chat::withinHours($h, new DateTimeImmutable($t, $m));
echo (int) Chat::withinHours(['1' => ['from' => '00:00', 'to' => '01:00']], (new DateTimeImmutable('2026-11-01 22:30', new DateTimeZone('UTC')))->setTimezone($m));   // domingo em UTC, segunda em Maputo
echo (int) Chat::withinHours([], new DateTimeImmutable('now'));`);
  const hours = execSync(`${PHP_CLI} ${hoursFile}`, { encoding: 'utf8' });
  rmSync(hoursFile);
  await test('D8 horário de Maputo: limites do dia, dia fechado, transição de dia desde UTC, sem horário', () => hours, '0110011');
  await test('D9 horário inválido → 422; retenção limitada a 24 meses', async () => { const bad = await admin.call('POST', '/chat/settings', { enabled: true, hours: { 1: { from: '18:00', to: '08:00' } } }); const ok = await admin.call('POST', '/chat/settings', { enabled: true, notify_offline: true, retention_months: 99, hours: {} }); return [bad.data.error, ok.data.settings.retention_months]; }, ['chat_invalid_hours', 24]);
  await test('D10 definições só com settings.manage', async () => (await mgr.call('POST', '/chat/settings', { enabled: false })).status, 403);
  await test('D11 chat desligado: desaparece do site e não aceita conversas', async () => { await admin.call('POST', '/chat/settings', { enabled: false, retention_months: 12, notify_offline: true, hours: {} }); const s = (await visitor().call('GET', '/status')).data; const r = await visitor().start({ email: `off-${run}@example.com` }); setChat(CHAT); return [s, r.status]; }, [{ enabled: false }, 503]);

  /* E-mail a quem saiu */
  const c = visitor(), emailC = `carla-${run}@example.com`;
  await c.start({ name: 'Carla Teste', email: emailC, lang: 'en', message: 'Hello' });
  const idC = convId(emailC);
  await admin.call('POST', `/chat/${idC}/messages`, { body: 'First reply', client_id: randomUUID() });
  await admin.call('POST', `/chat/${idC}/messages`, { body: 'Second reply', client_id: randomUUID() });
  worker();
  await test('O1 resposta recente ainda não vai por e-mail', () => sql(`SELECT count(*) FROM email_log WHERE kind = 'chat_reply' AND related_id = ${idC}`), '0');
  sql(`UPDATE chat_conversations SET created_at = now() - interval '1 hour', visitor_seen_at = NULL WHERE id = ${idC}`);
  sql(`UPDATE chat_messages SET created_at = now() - interval '10 minutes' WHERE conversation_id = ${idC}`);
  worker(); worker();
  await test('O2 visitante ausente: um só e-mail com as respostas, na língua dele', () => sql(`SELECT count(*), max(subject), bool_and(body LIKE '%First reply%' AND body LIKE '%Second reply%') FROM email_log WHERE kind = 'chat_reply' AND related_id = ${idC}`), '1|Reply from Moz Camp Adventures|t');
  const dPoll = visitor(), emailD = `dina-${run}@example.com`;
  await dPoll.start({ name: 'Dina Teste', email: emailD });
  const idD = convId(emailD);
  await admin.call('POST', `/chat/${idD}/messages`, { body: 'Vista a tempo', client_id: randomUUID() });
  await dPoll.poll();
  sql(`UPDATE chat_conversations SET visitor_seen_at = now() - interval '1 hour', created_at = now() - interval '1 hour' WHERE id = ${idD}`);
  sql(`UPDATE chat_messages SET created_at = now() - interval '10 minutes' WHERE conversation_id = ${idD}`);
  worker();
  await test('O3 mensagem lida não vai por e-mail', () => sql(`SELECT count(*) FROM email_log WHERE kind = 'chat_reply' AND related_id = ${idD}`), '0');

  /* Retenção */
  const dir = join(STORAGE, 'chat', idA);
  await test('T1 dentro do prazo fica guardada', () => { worker(); return sql(`SELECT count(*) FROM chat_conversations WHERE id = ${idA}`); }, '1');
  const old = visitor(), emailO = `antigo-${run}@example.com`;
  await old.start({ name: 'Antigo Teste', email: emailO });
  const idO = convId(emailO);
  await old.call('POST', '/upload', fileForm(PNG, 'velho.png', 'image/png'));
  await admin.call('POST', `/chat/${idO}/notes`, { body: 'nota antiga' });
  sql(`UPDATE chat_conversations SET last_message_at = now() - interval '13 months' WHERE id = ${idO}`);
  worker();
  await test('T2 fora do prazo: conversa, mensagens, notas e ficheiros apagados', () => [sql(`SELECT count(*) FROM chat_conversations WHERE id = ${idO}`), sql(`SELECT count(*) FROM chat_messages WHERE conversation_id = ${idO}`), sql(`SELECT count(*) FROM chat_notes WHERE conversation_id = ${idO}`), existsSync(join(STORAGE, 'chat', idO))], ['0', '0', '0', false]);
  await test('T3 sessão apagada deixa de funcionar', async () => (await old.poll()).status, 401);
  await test('T4 terminar neste dispositivo apaga o cookie; a equipa mantém a conversa', async () => { const r = await dPoll.call('POST', '/end', {}); const gone = /mca_chat=(deleted)?;/.test(dPoll.raw) || /Max-Age=0|expires=Thu, 01-Jan-1970/i.test(dPoll.raw); return [r.status, gone, sql(`SELECT count(*) FROM chat_conversations WHERE id = ${idD}`)]; }, [200, true, '1']);

  /* Integração: pacote → chat → reserva → disponibilidade → WhatsApp → painel */
  await admin.call('POST', '/chat/heartbeat', { status: 'online', active: true });
  sql(`UPDATE settings SET value = value || '{"customer_enabled": true}'::jsonb WHERE key = 'whatsapp_api'`);
  await admin.call('POST', `/availability/rules/${IT}`, { mode: 'request', capacity: 8 });
  const date = day(75);
  const left = async () => (await (await fetch(`${BASE}/api/availability?item=${IT}&from=${date}&to=${date}`)).json()).days[date].left;
  const t = visitor(), emailT = `turista-${run}@example.com`;
  const before = await left();
  await t.start({ name: 'Turista Teste', email: emailT, item: IT, subject: 'reservations', message: 'Há vagas nessa data?' });
  const idT = convId(emailT);
  await admin.call('POST', `/chat/${idT}/messages`, { body: 'Sim, há vagas.', client_id: randomUUID() });
  sql('DELETE FROM rate_limits');
  const booked = await t.req('POST', '/api/bookings', { idempotency_key: randomUUID(), item: IT, lang: 'pt', date, adults: 3, children: 0, name: 'Turista Teste', phone: '+258 84 987 6543', email: emailT, whatsapp_opt_in: true });
  const ref = booked.data.reference;
  await test('X1 reserva feita depois de conversar', () => booked.status, 201);
  await test('X2 capacidade actualizada', async () => [before, await left()], [8, 5]);
  await test('X3 WhatsApp ao cliente registado com consentimento', () => sql(`SELECT m.kind, m.status FROM whatsapp_messages m JOIN bookings b ON b.id = m.booking_id WHERE b.reference = '${ref}'`), 'booking_received|logged');
  await test('X4 equipa avisada da reserva', () => sql(`SELECT count(*) FROM email_log e JOIN bookings b ON b.id = e.related_id WHERE b.reference = '${ref}' AND e.kind = 'booking_team'`), '1');
  await test('X5 painel de atendimento mostra a reserva e o pacote', async () => { const d = (await admin.call('GET', `/chat/${idT}`)).data; return [d.booking.reference, d.booking.pax, d.item.id]; }, [ref, 3, IT]);
  await test('X6 reserva aponta para a conversa', async () => (await admin.call('GET', `/bookings/${ref}`)).data.booking.chat_id, +idT);
  await test('X7 reserva de quem não conversou não fica ligada a nenhuma conversa', async () => { sql('DELETE FROM rate_limits'); const r = await visitor().req('POST', '/api/bookings', { idempotency_key: randomUUID(), item: IT, lang: 'pt', date: day(76), adults: 1, children: 0, name: 'Sem Chat', phone: '+258 84 555 0000', email: '' }); return (await admin.call('GET', `/bookings/${r.data.reference}`)).data.booking.chat_id; }, null);
  await test('X8 associar reserva manualmente', async () => { const r = await admin.call('POST', `/chat/${idA}/booking`, { reference: ref }); return [r.status, (await admin.call('GET', `/chat/${idA}`)).data.booking.reference, (await admin.call('POST', `/chat/${idA}/booking`, { reference: 'MCA-2000-00001' })).status]; }, [200, ref, 404]);
  await test('X9 reservas com o mesmo e-mail são sugeridas', async () => (await admin.call('GET', `/chat/${convId(emailT)}`)).data.related.length, 0);

  /* Indicadores */
  await test('S1 indicadores vêm dos registos', async () => { const s = (await admin.call('GET', '/chat')).data.stats; const r = sql(`SELECT count(*) FROM chat_conversations WHERE created_at > now() - interval '30 days'`); const n = sql(`SELECT count(*) FROM chat_conversations WHERE status = 'open' AND last_sender = 'visitor'`); return [s.received === +r, s.pending === +n, s.attended > 0, typeof s.first_response]; }, [true, true, true, 'number']);
  await test('S2 resumo do painel inclui Live Chat e WhatsApp', async () => { const d = (await admin.call('GET', '/dashboard?from=' + day(-30) + '&to=' + day(0))).data; return [typeof d.indicators.chat.received, typeof d.indicators.whatsapp.sent, typeof d.attention.chat_waiting]; }, ['number', 'number', 'number']);
  await test('S3 quem não tem permissão não vê os indicadores', async () => { const d = (await other.call('GET', '/dashboard?from=' + day(-30) + '&to=' + day(0))).data; return [d.indicators.chat, d.indicators.whatsapp, d.attention.chat_waiting]; }, [null, null, null]);

  /* Carga do polling: 20 visitantes em simultâneo, cada um com 10 consultas */
  const crowd = [];
  for (let i = 0; i < 20; i++) { const v = visitor(); await v.start({ email: `carga-${i}-${run}@example.com` }); crowd.push(v); }
  const serial = async fn => { const s = performance.now(); for (let i = 0; i < 30; i++) await fn(); return Math.round((performance.now() - s) / 30); };
  console.log(`INFO  custo de um pedido, um de cada vez: /health ${await serial(() => fetch(BASE + '/api/health'))} ms; consulta ${await serial(() => crowd[0].poll())} ms`);
  const times = [];
  const t0 = performance.now();
  await Promise.all(crowd.map(async v => { for (let i = 0; i < 10; i++) { const s = performance.now(); await v.poll(); times.push(performance.now() - s); } }));
  const total = performance.now() - t0;
  times.sort((x, y) => x - y);
  const pct = p => Math.round(times[Math.floor(times.length * p)]);
  console.log(`INFO  carga: ${times.length} consultas em ${Math.round(total)} ms = ${Math.round(times.length / total * 1000)} por segundo; p50 ${pct(.5)} ms, p95 ${pct(.95)} ms (servidor de desenvolvimento: 1 processo)`);
  await test('Z1 200 consultas sem erros nem mistura de conversas', async () => { const all = await Promise.all(crowd.map(v => v.poll())); return all.every(r => r.status === 200 && r.data.messages.length === 1); }, true);
} catch (e) {
  results.push(false);
  console.log('FAIL  execução interrompida: ' + e.message.split('\n')[0]);
} finally {
  for (const [k, v] of keep) if (v) sql(`UPDATE settings SET value = '${v.replace(/'/g, "''")}'::jsonb WHERE key = '${k}'`);
  sql(`DELETE FROM availability_rules WHERE item_id = '${IT}'`);
  sql(`UPDATE bookings SET status = 'cancelada' WHERE item_id = '${IT}' AND customer_name IN ('Turista Teste', 'Sem Chat')`);
  sql("UPDATE chat_agents SET status = 'offline'");
  sql('DELETE FROM rate_limits');
}
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} testes passaram`);
process.exit(failed ? 1 : 0);
