/**
 * MOZ CAMP ADVENTURES — tests/availability.mjs
 * =====================================================
 * Disponibilidade dos pacotes: regras, datas, sessões, retenção, concorrência — SÓ em desenvolvimento.
 *   API_BASE=http://localhost:8791   PHP_CLI="php -c php.ini"   MCA_CONFIG=<config dev>   PSQL="psql … -d mca"
 * Apaga no fim as regras, datas e bloqueios criados (as reservas de teste ficam, canceladas ou em datas distantes).
 * Uso: node tests/availability.mjs
 * =====================================================
 */

import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const BASE = process.env.API_BASE || 'http://localhost:8791';
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
function client() {
  const c = { cookie: '', csrf: '' };
  c.call = async (method, path, body, opt = {}) => {
    const headers = { Origin: BASE };
    if (c.cookie) headers.Cookie = c.cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && c.csrf && opt.csrf !== false) headers['X-CSRF-Token'] = c.csrf;
    const r = await fetch(BASE + '/api/admin' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get('set-cookie');
    if (set && set.startsWith('mca_admin=')) c.cookie = set.split(';')[0];
    const data = await r.json().catch(() => ({}));
    if (data && data.csrf) c.csrf = data.csrf;
    return { status: r.status, data };
  };
  return c;
}
const cliUser = (n, e, r) => execSync(`${PHP_CLI} api/bin/create-user.php "${n}" ${e} ${r}`, { encoding: 'utf8' }).match(/token=([a-f0-9]{64})/)[1];
/* Datas no fuso de referência (Africa/Maputo), mesmo que o computador esteja noutro */
const maputoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo' }).format(new Date());
const day = n => { const d = new Date(maputoToday() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = iso => new Date(iso + 'T12:00:00Z').getUTCDay();

const pub = async (item, from, to = from) => (await fetch(`${BASE}/api/availability?item=${item}&from=${from}&to=${to}`)).json();
const state = async (item, d) => (await pub(item, d)).days[d];
const book = async (item, date, adults = 1, extra = {}) => {
  const r = await fetch(BASE + '/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ idempotency_key: randomUUID(), item, lang: 'pt', date, adults, children: 0, name: 'Teste Disponibilidade', phone: '+258 84 000 0000', email: '', ...extra }) });
  return { status: r.status, data: await r.json() };
};

const IT = 'whale-watching', BOAT = 'private-boat-rental', STAY = 'manico-camp';
const items = [IT, BOAT, STAY];
const run = randomUUID().slice(0, 6), PASS = 'Disponivel-teste-2026';
const anon = client(), admin = client(), mgr = client();
const cleanup = () => {
  sql(`DELETE FROM availability_rules WHERE item_id IN ('${items.join("','")}')`);
  sql(`DELETE FROM availability_slots WHERE item_id IN ('${items.join("','")}')`);
  sql(`DELETE FROM availability_blocks WHERE reason LIKE 'Teste%'`);
  sql(`UPDATE bookings SET status = 'cancelada' WHERE customer_name = 'Teste Disponibilidade'`);
  sql(`DELETE FROM rate_limits`);
};
cleanup();

try {
  await anon.call('POST', '/setup-password', { token: cliUser('Admin Disp', `admin-av-${run}@teste.local`, 'admin'), password: PASS });
  await admin.call('POST', '/login', { email: `admin-av-${run}@teste.local`, password: PASS });
  await anon.call('POST', '/setup-password', { token: cliUser('Gerente Disp', `gerente-av-${run}@teste.local`, 'gerente'), password: PASS });
  await mgr.call('POST', '/login', { email: `gerente-av-${run}@teste.local`, password: PASS });
  const rule = (item, r) => admin.call('POST', `/availability/rules/${item}`, r);
  const dates = b => admin.call('POST', '/availability/dates', b);

  /* Acesso */
  await test('A1 painel exige sessão; visitante não altera nada', async () => [(await anon.call('GET', '/availability/calendar')).status, (await anon.call('POST', `/availability/rules/${IT}`, { capacity: 1 })).status, (await anon.call('POST', '/availability/dates', { item: IT, dates: [day(9)], action: 'block' })).status], [401, 401, 401]);
  await test('A2 escrita sem token CSRF → 403', async () => (await admin.call('POST', `/availability/rules/${IT}`, { capacity: 1 }, { csrf: false })).status, 403);
  await test('A3 gerente vê e gere a disponibilidade', async () => [(await mgr.call('GET', '/availability/calendar')).status, (await mgr.call('GET', '/availability/summary')).status], [200, 200]);
  await test('A4 pacote inexistente → 404 no painel, 422 no site', async () => [(await rule('nao-existe', { capacity: 1 })).status, (await fetch(`${BASE}/api/availability?item=nao-existe`)).status], [404, 422]);

  /* Sem regra: comportamento igual ao anterior */
  await test('D1 pacote sem regra: disponível, sem limite', async () => { const s = await state(IT, day(30)); return [s.status, s.left, s.sessions]; }, ['available', null, []]);
  await test('D2 pacote sem regra aceita reservas como antes', async () => (await book(IT, day(30), 12)).status, 201);

  /* Capacidade */
  const d1 = day(40);
  await rule(IT, { capacity: 5 });
  await test('C1 capacidade 5: 5 vagas', async () => { const s = await state(IT, d1); return [s.status, s.left]; }, ['available', 5]);
  const b1 = await book(IT, d1, 3);
  await test('C2 reserva de 3: restam 2', async () => [b1.status, (await state(IT, d1)).left], [201, 2]);
  await test('C3 repetir o mesmo pedido (idempotência) não consome vagas', async () => { const key = randomUUID(); await book(IT, d1, 1, { idempotency_key: key }); await book(IT, d1, 1, { idempotency_key: key }); const s = await state(IT, d1); return [s.left, s.status]; }, [1, 'limited']);
  await test('C4 pedir mais do que as vagas → 422 com as vagas restantes', async () => { const r = await book(IT, d1, 2); return [r.status, r.data.error, r.data.left]; }, [422, 'not_enough_places', 1]);
  await test('C5 última vaga: data esgotada', async () => { await book(IT, d1, 1); return (await state(IT, d1)).status; }, 'sold_out');
  await test('C6 data esgotada recusa a reserva', async () => { const r = await book(IT, d1, 1); return [r.status, r.data.error]; }, [422, 'sold_out']);
  await test('C7 cancelar liberta a capacidade', async () => {
    await admin.call('POST', `/bookings/${b1.data.reference}/status`, { status: 'cancelada', note: 'Teste de capacidade', notify: false });
    return (await state(IT, d1)).left;
  }, 3);
  await test('C8 alterar a capacidade da data (só naquela data)', async () => { await dates({ item: IT, dates: [d1], action: 'capacity', capacity: 8 }); return [(await state(IT, d1)).left, (await state(IT, day(41))).left]; }, [6, 5]);
  await test('C9 repor a regra da data', async () => { await dates({ item: IT, dates: [d1], action: 'reset' }); return (await state(IT, d1)).left; }, 3);

  /* Retenção de pedidos */
  const d2 = day(42);
  await rule(IT, { capacity: 2 });
  const h1 = await book(IT, d2, 2);
  await test('H1 pedido ocupa vagas e tem validade de 48 h', async () => [(await state(IT, d2)).status, sql(`SELECT round(extract(epoch FROM hold_expires_at - created_at) / 3600) FROM bookings WHERE reference = '${h1.data.reference}'`)], ['sold_out', '48']);
  await test('H2 retenção expirada liberta as vagas; o pedido continua «pedido»', async () => { sql(`UPDATE bookings SET hold_expires_at = now() - interval '1 hour' WHERE reference = '${h1.data.reference}'`); return [(await state(IT, d2)).left, sql(`SELECT status FROM bookings WHERE reference = '${h1.data.reference}'`)]; }, [2, 'pedido']);
  const h2 = await book(IT, d2, 2);
  await test('H3 confirmar pedido expirado sem vagas → 409; continua por confirmar', async () => { const r = await admin.call('POST', `/bookings/${h1.data.reference}/status`, { status: 'confirmada', notify: false }); return [r.status, r.data.error, sql(`SELECT status FROM bookings WHERE reference = '${h1.data.reference}'`)]; }, [409, 'sold_out', 'pedido']);
  await test('H4 reserva confirmada ocupa vagas sem prazo', async () => { await admin.call('POST', `/bookings/${h2.data.reference}/status`, { status: 'confirmada', notify: false }); sql(`UPDATE bookings SET hold_expires_at = now() - interval '1 hour' WHERE reference = '${h2.data.reference}'`); return (await state(IT, d2)).status; }, 'sold_out');
  await test('H5 administrador pode forçar a confirmação (fica registado)', async () => { const r = await admin.call('POST', `/bookings/${h1.data.reference}/status`, { status: 'confirmada', force: true, notify: false }); return [r.status, sql(`SELECT data->>'forced' FROM booking_events WHERE type = 'status_changed' AND booking_id = (SELECT id FROM bookings WHERE reference = '${h1.data.reference}') ORDER BY id DESC LIMIT 1`)]; }, [200, 'true']);
  await test('H6 reabrir reserva cancelada sem vagas → 409', async () => {
    await admin.call('POST', `/bookings/${h1.data.reference}/status`, { status: 'cancelada', note: 'Teste reabrir', notify: false });
    await book(IT, d2, 1).catch(() => {});
    await rule(IT, { capacity: 3 }); await book(IT, d2, 1);
    return (await admin.call('POST', `/bookings/${h1.data.reference}/status`, { status: 'pedido', notify: false })).status;
  }, 409);

  /* Bloqueios */
  const d3 = day(45);
  await rule(IT, { capacity: 10 });
  await test('B1 bloquear data: site mostra bloqueada e recusa a reserva', async () => { await dates({ item: IT, dates: [d3], action: 'block', note: 'Teste: nota interna secreta' }); const r = await book(IT, d3); return [(await state(IT, d3)).status, r.status, r.data.error]; }, ['blocked', 422, 'date_blocked']);
  await test('B2 nota interna nunca sai na API pública', async () => JSON.stringify(await pub(IT, d3)).includes('secreta'), false);
  await test('B3 reabrir a data', async () => { await dates({ item: IT, dates: [d3], action: 'reset' }); return (await state(IT, d3)).status; }, 'available');
  await test('B4 bloquear intervalo só de um pacote', async () => { await admin.call('POST', '/availability/blocks', { item: IT, from: day(46), to: day(48), reason: 'Teste barco em manutenção' }); return [(await state(IT, day(45))).status, (await state(IT, day(46))).status, (await state(IT, day(48))).status, (await state(IT, day(49))).status, (await state(BOAT, day(47))).status]; }, ['available', 'blocked', 'blocked', 'available', 'available']);
  await test('B5 bloqueio geral afecta todos os pacotes; retirá-lo reabre', async () => {
    const r = await admin.call('POST', '/availability/blocks', { from: day(50), to: day(50), reason: 'Teste férias da equipa' });
    const during = [(await state(IT, day(50))).status, (await state(BOAT, day(50))).status];
    const id = r.data.blocks.find(b => b.reason === 'Teste férias da equipa').id;
    await admin.call('POST', `/availability/blocks/${id}/remove`, {});
    return [...during, (await state(IT, day(50))).status];
  }, ['blocked', 'blocked', 'available']);
  await test('B6 bloqueio sem motivo → 422', async () => (await admin.call('POST', '/availability/blocks', { from: day(50), to: day(50), reason: '' })).data.error, 'reason_required');

  /* Dias da semana e datas específicas */
  const d4 = day(52), w = weekday(d4), other = day(53);
  await test('W1 só em dias definidos: os outros ficam fechados', async () => { await rule(IT, { mode: 'scheduled', weekdays: [w], capacity: 4 }); return [(await state(IT, d4)).status, (await state(IT, other)).status]; }, ['available', 'closed']);
  await test('W2 reserva em dia fechado → 422', async () => (await book(IT, other)).data.error, 'date_closed');
  await test('W3 abrir uma data específica fora dos dias definidos', async () => { await dates({ item: IT, dates: [other], action: 'open' }); return [(await state(IT, other)).status, (await book(IT, other)).status]; }, ['available', 201]);

  /* Sessões */
  const d5 = day(56);
  await rule(IT, { capacity: 2, sessions: ['16:00', '09:00'] });
  await test('S1 sessões por ordem, com vagas próprias', async () => (await state(IT, d5)).sessions.map(s => [s.time, s.left]), [['09:00', 2], ['16:00', 2]]);
  await test('S2 sem escolher sessão → 422; sessão inexistente → 422', async () => [(await book(IT, d5)).data.error, (await book(IT, d5, 1, { session: '12:00' })).data.error], ['session_required', 'invalid_session']);
  await test('S3 a sessão fica na reserva e esgota sozinha', async () => { const r = await book(IT, d5, 2, { session: '09:00' }); const s = await state(IT, d5); return [sql(`SELECT session FROM bookings WHERE reference = '${r.data.reference}'`), s.sessions.map(x => x.status), s.status]; }, ['09:00', ['sold_out', 'available'], 'available']);
  await test('S4 sessão esgotada recusa, a outra aceita', async () => [(await book(IT, d5, 1, { session: '09:00' })).data.error, (await book(IT, d5, 1, { session: '16:00' })).status], ['sold_out', 201]);
  await test('S5 criar sessão extra numa data', async () => { await dates({ item: IT, dates: [d5], action: 'add_session', session: '18:30' }); return (await state(IT, d5)).sessions.map(s => s.time); }, ['09:00', '16:00', '18:30']);
  await test('S6 hora inválida → 422', async () => (await rule(IT, { sessions: ['25:00'] })).data.error, 'invalid_session');

  await test('S7 reservas anteriores às sessões contam contra todas as sessões', async () => {
    const d = day(57); await rule(IT, { capacity: 2 }); await book(IT, d, 2);
    await rule(IT, { capacity: 2, sessions: ['09:00', '16:00'] });
    const s = await state(IT, d); const r = await book(IT, d, 1, { session: '09:00' });
    return [s.status, s.sessions.map(x => x.left), r.data.error];
  }, ['sold_out', [0, 0], 'sold_out']);
  await test('S8 reservas de uma sessão retirada continuam a contar', async () => {
    const d = day(58); await rule(IT, { capacity: 2, sessions: ['09:00'] }); await book(IT, d, 2, { session: '09:00' });
    await rule(IT, { capacity: 2 });
    return (await state(IT, d)).status;
  }, 'sold_out');

  /* Antecedência e fuso */
  await test('T1 «today» da API = data em Africa/Maputo', async () => (await pub(IT, day(1))).today, maputoToday());
  await rule(IT, { min_notice_hours: 72, max_advance_days: 30 });
  await test('T2 antecedência mínima e máxima fecham as datas', async () => [(await state(IT, day(1))).status, (await state(IT, day(5))).status, (await state(IT, day(29))).status, (await state(IT, day(31))).status], ['closed', 'available', 'available', 'closed']);
  await test('T3 data antes da antecedência mínima → 422', async () => (await book(IT, day(1))).data.error, 'date_closed');
  await rule(IT, { sessions: ['00:00', '23:59'] });
  await test('T4 hoje: sessão já passada fecha, sessão futura fica aberta (hora de Maputo)', async () => (await state(IT, day(0))).sessions.map(s => s.status), ['closed', new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Maputo' }).slice(0, 5) < '23:59' ? 'available' : 'closed']);
  await test('T5 ontem nunca é reservável', async () => [(await state(IT, day(-1))).status, (await book(IT, day(-1))).data.error], ['closed', 'date_out_of_range']);

  /* Concorrência */
  const d6 = day(60);
  await rule(IT, { capacity: 3 });
  await test('X1 12 reservas em simultâneo para 3 vagas: entram exactamente 3', async () => {
    const rs = await Promise.all(Array.from({ length: 12 }, () => book(IT, d6)));
    const left = (await state(IT, d6)).left;
    return [rs.filter(r => r.status === 201).length, rs.filter(r => r.status === 422).length, left, sql(`SELECT sum(people) FROM booking_slots s JOIN bookings b ON b.id = s.booking_id WHERE s.item_id = '${IT}' AND s.day = '${d6}' AND b.status = 'pedido'`)];
  }, [3, 9, 0, '3']);
  await test('X2 reservas simultâneas com 2 pessoas e 3 vagas: nunca passa da capacidade', async () => {
    const dd = day(61);
    const rs = await Promise.all(Array.from({ length: 6 }, () => book(IT, dd, 2)));
    return [rs.filter(r => r.status === 201).length, (await state(IT, dd)).left];
  }, [1, 1]);

  /* Unidades (barco) e alojamento (noites) */
  await test('U1 capacidade em unidades: cada reserva conta 1, seja qual for o grupo', async () => { await rule(BOAT, { capacity: 2, unit: 'units' }); const d = day(62); await book(BOAT, d, 5); const s1 = await pub(BOAT, d); await book(BOAT, d, 3); const r = await book(BOAT, d, 1); return [s1.unit, s1.days[d].status, r.data.error]; }, ['units', 'limited', 'sold_out']);
  const stay = (checkin, checkout, adults = 2) => book(STAY, undefined, adults, { checkin, checkout });
  await test('N1 estadia passa por todas as noites: uma bloqueada recusa', async () => { await dates({ item: STAY, dates: [day(66)], action: 'block' }); const r = await stay(day(65), day(68)); return [r.status, r.data.error, r.data.date]; }, [422, 'date_blocked', day(66)]);
  await test('N2 a noite de saída não conta', async () => { const r = await stay(day(64), day(66)); return [r.status, sql(`SELECT count(*) FROM booking_slots s JOIN bookings b ON b.id = s.booking_id WHERE b.reference = '${r.data.reference}'`)]; }, [201, '2']);
  await test('N3 capacidade por noite em estadias', async () => { await rule(STAY, { capacity: 4 }); const a = await stay(day(70), day(72), 3); const b = await stay(day(71), day(73), 2); return [a.status, b.status, b.data.error, b.data.date]; }, [201, 422, 'not_enough_places', day(71)]);

  /* Pedidos manuais do painel */
  await test('M1 pedido manual respeita o limite; com override regista e fica no histórico', async () => {
    const d = day(74); await rule(IT, { capacity: 1 }); await book(IT, d);
    const body = { item: IT, date: d, adults: 1, children: 0, name: 'Teste Disponibilidade', phone: '+258 84 000 0000', channel: 'manual' };
    const a = await admin.call('POST', '/bookings', body); const b = await admin.call('POST', '/bookings', { ...body, override_capacity: true });
    return [a.status, a.data.error, b.status, sql(`SELECT data->>'override_capacity' FROM booking_events WHERE booking_id = (SELECT id FROM bookings WHERE reference = '${b.data.reference}') AND type = 'created'`)];
  }, [422, 'sold_out', 200, 'true']);

  /* Painel: calendário, data, visão geral */
  await test('P1 calendário de um pacote: estado e reservas por data', async () => { const r = await admin.call('GET', `/availability/calendar?item=${IT}&from=${day(74)}&to=${day(74)}`); const v = r.data.days[day(74)]; return [r.data.rule.capacity, v.status, v.used >= 1]; }, [1, 'sold_out', true]);
  await test('P2 data: reservas com participantes e contactos', async () => { const r = await admin.call('GET', `/availability/day?item=${IT}&date=${day(74)}`); return [r.data.bookings.length >= 1, r.data.bookings[0].customer_name, 'holds' in r.data.bookings[0]]; }, [true, 'Teste Disponibilidade', true]);
  await test('P3 visão geral com dados reais', async () => { await rule(IT, { capacity: 2 }); await book(IT, day(3), 2); const r = (await admin.call('GET', '/availability/summary')).data; return [r.packages_active > 20, r.packages_configured >= 3, r.sold_out_dates >= 1, r.near_full.some(x => x.item === IT && x.date === day(3))]; }, [true, true, true, true]);
  await test('P4 duração da retenção configurável', async () => { const r = await admin.call('POST', '/availability/settings', { hold_hours: 24 }); const b = await book(IT, day(20)); const h = sql(`SELECT round(extract(epoch FROM hold_expires_at - created_at) / 3600) FROM bookings WHERE reference = '${b.data.reference}'`); await admin.call('POST', '/availability/settings', { hold_hours: 48 }); return [r.data.hold_hours, h]; }, [24, '24']);
  await test('P5 auditoria regista regras, datas e bloqueios', async () => { const e = (await admin.call('GET', '/audit')).data.entries.map(x => x.action); return ['availability_rule', 'availability_dates', 'availability_block', 'availability_unblock'].every(a => e.includes(a)); }, true);
} finally {
  cleanup();
}
const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} testes passaram`);
process.exit(ok === results.length ? 0 : 1);
