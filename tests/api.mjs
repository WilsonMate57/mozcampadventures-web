/**
 * MOZ CAMP ADVENTURES — tests/api.mjs
 * =====================================================
 * Testes da API (PHP + PostgreSQL) — SÓ em base de dados de desenvolvimento.
 *   API_BASE=http://localhost:8791        servidor (php -S … tests/dev-router.php)
 *   PSQL="psql -h localhost -p 55432 -U mca -d mca"  (+ PGPASSWORD) para verificações directas na BD
 * Uso: node tests/api.mjs
 * =====================================================
 */

import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const BASE = process.env.API_BASE || 'http://localhost:8791';
const ORIGIN = process.env.API_ORIGIN || BASE;
const PSQL = process.env.PSQL;
const results = [];

async function call(method, path, body, { origin = ORIGIN, type = 'application/json' } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = type;
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  let data = {};
  try { data = await r.json(); } catch { /* sem corpo */ }
  return { status: r.status, data };
}
function sql(q) {
  if (!PSQL) return null;
  return execSync(`${PSQL} -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}
async function test(name, fn, expected) {
  try {
    const got = await fn();
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(expected)}`}`);
  } catch (e) { results.push(false); console.log(`FAIL  ${name}  → erro: ${e.message.split('\n')[0]}`); }
}
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const booking = (extra = {}) => ({ idempotency_key: randomUUID(), item: 'ponta-douro-day-trip', lang: 'pt', date: day(10), adults: 3, children: 0, name: 'Cliente Teste', phone: '+258 84 000 0000', email: 'cliente@example.com', ...extra });

/* ── Saúde ─────────────────────────────────────────────── */
await test('A1 /api/health responde e liga à BD', async () => (await call('GET', '/api/health')).data.db, true);

/* ── Reservas: preço do servidor, referência, idempotência ── */
const key = randomUUID();
const b1 = await call('POST', '/api/bookings', booking({ idempotency_key: key, transfer: 'day-trip-transfer', total: 1, price_from: 1 }));
await test('B1 pedido válido → 201 + referência MCA-AAAA-NNNNN', () => [b1.status, /^MCA-\d{4}-\d{5}$/.test(b1.data.reference)], [201, true]);
await test('B2 preço recalculado no servidor (cliente enviou total=1): 3 × 8.000 + 14.000', () => b1.data.total, 38000);
await test('B3 estado inicial é «pedido» (não confirmado)', () => b1.data.status, 'pedido');
const b1r = await call('POST', '/api/bookings', booking({ idempotency_key: key, transfer: 'day-trip-transfer' }));
await test('B4 repetir com a mesma chave devolve a mesma referência (sem duplicado)', () => [b1r.data.reference === b1.data.reference, b1r.data.replayed], [true, true]);
if (PSQL) await test('B5 só existe 1 registo para essa chave', () => sql(`SELECT count(*) FROM bookings WHERE idempotency_key='${key}'`), '1');

/* ── Ticket do pedido: o QR code leva ao link pessoal da área do cliente ── */
const linkRe = new RegExp(`/reserva/#r=${b1.data.reference}&t=[a-f0-9]{48}$`);
await test('T1 resposta traz o link da área do cliente (para o QR do ticket)', () => linkRe.test(b1.data.client_url || ''), true);
await test('T2 repetir o pedido devolve o mesmo link e as linhas de preço', () => [b1r.data.client_url === b1.data.client_url, (b1r.data.lines || []).length === b1.data.lines.length], [true, true]);
const enB = await call('POST', '/api/bookings', booking({ lang: 'en' }));
await test('T3 pedido em inglês → link /en/booking/', () => /\/en\/booking\/#r=MCA-\d{4}-\d{5}&t=[a-f0-9]{48}$/.test(enB.data.client_url || ''), true);
const qrHash = new URLSearchParams((b1.data.client_url || '#').split('#')[1]);
const area = await call('POST', '/api/client/booking', { ref: qrHash.get('r'), token: qrHash.get('t') });
await test('T4 o link do QR abre a reserva na área do cliente, com total e linhas', () => [area.status, area.data.booking?.reference, area.data.booking?.total, area.data.booking?.lines?.length > 0], [200, b1.data.reference, 38000, true]);

const many = await Promise.all(Array.from({ length: 20 }, () => call('POST', '/api/bookings', booking())));
const refs = many.map(r => r.data.reference);
const nums = refs.map(r => +r.split('-')[2]).sort((a, b) => a - b);
await test('B6 20 pedidos em simultâneo → 20 referências únicas e consecutivas', () => [many.every(r => r.status === 201), new Set(refs).size, nums[19] - nums[0]], [true, 20, 19]);

await test('B7 abaixo do mínimo (2 < 3) → 422 min_people', async () => { const r = await call('POST', '/api/bookings', booking({ adults: 2 })); return [r.status, r.data.error, r.data.min]; }, [422, 'min_people', 3]);
await test('B8 pacote desactivado → 422 item_unavailable', async () => { const r = await call('POST', '/api/bookings', booking({ item: 'tofo-beach-trip', adults: 4 })); return [r.status, r.data.error]; }, [422, 'item_unavailable']);
await test('B9 item inexistente → 422 invalid_item', async () => (await call('POST', '/api/bookings', booking({ item: 'nao-existe' }))).data.error, 'invalid_item');
await test('B10 data no passado → 422', async () => (await call('POST', '/api/bookings', booking({ date: day(-1) }))).data.error, 'date_out_of_range');
await test('B11 data inválida → 422', async () => (await call('POST', '/api/bookings', booking({ date: '2026-02-30' }))).data.error, 'invalid_date');
await test('B12 opção inexistente (barco num tour sem barcos) → 422', async () => (await call('POST', '/api/bookings', booking({ boat: 'boat-5pax' }))).data.error, 'invalid_option');
await test('B13 barco de 5 com 6 pessoas → 422 capacity', async () => { const r = await call('POST', '/api/bookings', booking({ item: 'island-hopping-experience', boat: 'boat-5pax', adults: 6 })); return [r.data.error, r.data.max]; }, ['capacity', 5]);
await test('B14 barco privado substitui preço por pessoa = 30.000', async () => (await call('POST', '/api/bookings', booking({ item: 'island-hopping-experience', boat: 'boat-5pax', adults: 2, children: 1 }))).data.total, 30000);
await test('B15 aluguer de barco: preço por barco (3 pessoas) = 8.000', async () => (await call('POST', '/api/bookings', booking({ item: 'private-boat-rental', adults: 3 }))).data.total, 8000);
await test('B16 Mama\'s Lodge 3 noites, 1 adulto = 24.400 + 14.900 = 39.300', async () => (await call('POST', '/api/bookings', booking({ item: 'mamas-lodge', date: undefined, checkin: day(7), checkout: day(10), adults: 1 }))).data.total, 39300);
await test('B17 Villa Martins 1 noite → 422 min_nights (2)', async () => { const r = await call('POST', '/api/bookings', booking({ item: 'villa-martins', checkin: day(7), checkout: day(8), adults: 1 })); return [r.data.error, r.data.min]; }, ['min_nights', 2]);
await test('B18 Cabo Beach Villas por villa/noite, 2 noites = 45.398', async () => (await call('POST', '/api/bookings', booking({ item: 'cabo-beach-villas', checkin: day(7), checkout: day(9), adults: 2 }))).data.total, 45398);
await test('B19 extras por pessoa: Island Hopping 2 adultos + massagem = 12.000 + 5.000', async () => (await call('POST', '/api/bookings', booking({ item: 'island-hopping-experience', adults: 2, extras: ['beach-massage'] }))).data.total, 17000);
await test('B20 telefone inválido → 422 invalid_phone', async () => (await call('POST', '/api/bookings', booking({ phone: '123' }))).data.error, 'invalid_phone');
await test('B21 sem chave de idempotência → 422', async () => (await call('POST', '/api/bookings', booking({ idempotency_key: 'x' }))).data.error, 'invalid_idempotency_key');
await test('B22 versão EN: linhas em inglês', async () => (await call('POST', '/api/bookings', booking({ lang: 'en' }))).data.lines[0].label, 'Adults 3 × 8.000 MZN');

/* ── Segurança ─────────────────────────────────────────── */
await test('S1 sem cabeçalho Origin → 403', async () => (await call('POST', '/api/bookings', booking(), { origin: null })).status, 403);
await test('S2 Origin de outro site → 403', async () => (await call('POST', '/api/bookings', booking(), { origin: 'https://evil.example' })).status, 403);
await test('S3 Content-Type de formulário (CSRF clássico) → 415', async () => (await call('POST', '/api/bookings', 'a=1', { type: 'application/x-www-form-urlencoded' })).status, 415);
await test('S4 campo-armadilha preenchido (bot) → 400', async () => (await call('POST', '/api/bookings', booking({ website: 'http://spam' }))).status, 400);
await test('S5 JSON inválido → 400', async () => (await call('POST', '/api/bookings', '{nope')).status, 400);
await test('S6 rota inexistente → 404 JSON', async () => { const r = await call('GET', '/api/admin'); return [r.status, r.data.error]; }, [404, 'not_found']);
await test('S7 injecção SQL no nome é guardada como texto', async () => { const r = await call('POST', '/api/bookings', booking({ name: "Robert'); DROP TABLE bookings;--" })); return r.status; }, 201);
if (PSQL) await test('S8 tabela bookings intacta depois da tentativa', () => sql("SELECT to_regclass('bookings') IS NOT NULL"), 't');

/* ── Contacto ─────────────────────────────────────────── */
await test('C1 mensagem válida → 201', async () => (await call('POST', '/api/contact', { name: 'Ana', email: 'ana@example.com', subject: 'Informações gerais', message: 'Olá!', lang: 'pt' })).status, 201);
await test('C2 e-mail inválido → 422', async () => (await call('POST', '/api/contact', { name: 'Ana', email: 'x', subject: 's', message: 'm' })).data.error, 'invalid_email');

/* ── Avaliações (geridas no site) ─────────────────────── */
const text = 'Passeio excelente, equipa muito atenciosa. ' + randomUUID().slice(0, 8);
await test('R1 nova avaliação → 201, fica pendente', async () => (await call('POST', '/api/reviews', { name: 'Maria', origin: 'Maputo', rating: 5, text, item: 'whale-watching' })).data.status, 'pendente');
await test('R2 pendente não aparece publicamente', async () => (await call('GET', '/api/reviews?item=whale-watching')).data.reviews.some(r => r.text === text), false);
await test('R3 classificação fora de 1–5 → 422', async () => (await call('POST', '/api/reviews', { name: 'Xavier', rating: 9, text: 'texto válido' })).data.error, 'invalid_rating');
if (PSQL) {
  sql(`UPDATE reviews SET status='aprovada', moderated_at=now(), moderated_by='teste' WHERE body='${text}'`);
  await test('R4 depois de aprovada aparece, com média', async () => { const r = (await call('GET', '/api/reviews?item=whale-watching')).data; return [r.reviews.some(x => x.text === text), r.average !== null]; }, [true, true]);
}

/* ── Integridade (BD) ─────────────────────────────────── */
if (PSQL) {
  await test('D1 cada reserva tem evento «created» no histórico', () => sql("SELECT count(*) FROM bookings b WHERE NOT EXISTS (SELECT 1 FROM booking_events e WHERE e.booking_id=b.id AND e.type='created')"), '0');
  await test('D2 histórico é só de acréscimo (UPDATE recusado)', () => { try { sql('UPDATE booking_events SET actor=\'x\' WHERE id=(SELECT min(id) FROM booking_events)'); return 'permitido'; } catch { return 'recusado'; } }, 'recusado');
  await test('D3 registo de e-mails é só de acréscimo (DELETE recusado)', () => { try { sql('DELETE FROM email_log WHERE id=(SELECT min(id) FROM email_log)'); return 'permitido'; } catch { return 'recusado'; } }, 'recusado');
  await test('D4 e-mails do pedido B1 registados (equipa + cliente)', () => sql(`SELECT count(*) FROM email_log WHERE related_type='booking' AND related_id=(SELECT id FROM bookings WHERE reference='${b1.data.reference}')`), '2');
  await test('D5 IP nunca guardado em claro', () => sql("SELECT count(*) FROM bookings WHERE ip_hash LIKE '%.%' OR ip_hash LIKE '%:%'"), '0');
}

/* ── Limite de pedidos (último: consome a quota) ─────── */
let last;
for (let i = 0; i < 6; i++) last = await call('POST', '/api/contact', { name: 'Spam', email: 'spam@example.com', subject: 's', message: 'm' });
await test('L1 excesso de mensagens do mesmo IP → 429', () => last.status, 429);

const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} testes passaram${PSQL ? '' : ' (sem PSQL: verificações directas na BD omitidas)'}`);
process.exit(pass === results.length ? 0 : 1);
