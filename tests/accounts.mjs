/**
 * MOZ CAMP ADVENTURES — tests/accounts.mjs
 * =====================================================
 * Contas de cliente (/api/account/*) e página «Clientes» do painel —
 * SÓ em base de dados de desenvolvimento.
 *   API_BASE=http://localhost:8791   PSQL="psql … -d mca" (+ PGPASSWORD)   PHP_CLI="php"   MCA_CONFIG=<config dev>
 * A conta funciona logo após o registo. As reservas ficam na conta quando
 * feitas com a sessão iniciada (nunca pelo e-mail, que não é confirmado).
 * O link de reposição não fica no registo de e-mails; os testes gravam um
 * token conhecido directamente na BD.
 * Uso: node tests/accounts.mjs
 * =====================================================
 */

import { execSync } from 'node:child_process';
import { randomUUID, randomBytes, createHash } from 'node:crypto';

const BASE = process.env.API_BASE || 'http://localhost:8791';
const ORIGIN = process.env.API_ORIGIN || BASE;
const PSQL = process.env.PSQL, PHP_CLI = process.env.PHP_CLI || 'php';
if (!PSQL) { console.error('Defina PSQL (base de desenvolvimento).'); process.exit(2); }
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
const sha = s => createHash('sha256').update(s).digest('hex');
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/** Cliente HTTP com cookies e token CSRF. prefix: '/api/account', '/api/admin' ou '/api'. */
function client(prefix) {
  const c = { jar: {}, csrf: '', raw: [] };
  c.call = async (method, path, body, opt = {}) => {
    const headers = { Origin: opt.origin === undefined ? ORIGIN : opt.origin };
    if (!headers.Origin) delete headers.Origin;
    const cookie = Object.entries(c.jar).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && c.csrf && opt.csrf !== false) headers['X-CSRF-Token'] = c.csrf;
    const r = await fetch(BASE + (opt.prefix ?? prefix) + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const sc of r.headers.getSetCookie?.() || []) { const [kv] = sc.split(';'); const i = kv.indexOf('='); c.jar[kv.slice(0, i)] = kv.slice(i + 1); c.raw.push(sc); }
    const type = r.headers.get('content-type') || '';
    const data = type.includes('json') ? await r.json() : await r.text();
    if (data && data.csrf) c.csrf = data.csrf;
    return { status: r.status, data, type };
  };
  /** Pedido de reserva no site com os cookies deste cliente (como o browser faria). */
  c.book = async (email) => (await c.call('POST', '/bookings', { idempotency_key: randomUUID(), item: 'safari-parque-maputo', lang: 'pt', date: day(15), adults: 2, children: 0, name: 'Ana Cliente', phone: '+258840000000', email }, { prefix: '/api' })).data;
  return c;
}

const run = randomUUID().slice(0, 6);
const email = `cliente-${run}@example.com`, PASS = 'segura123', PASS2 = 'nova-segura-456';
sql('TRUNCATE rate_limits');

/* ── R. Registo: a conta funciona de imediato ─────────── */
const anon = client('/api/account');
const me = client('/api/account');
const reg = { name: 'Ana Cliente', email, phone: '+258 84 000 0000', password: PASS, terms: true, marketing: true, lang: 'pt' };
await test('R1 registo → conta criada e sessão aberta de imediato', async () => { const r = await me.call('POST', '/register', reg); return [r.status, r.data.customer.name, r.data.customer.marketing, me.csrf.length, r.data.bookings.length]; }, [200, 'Ana Cliente', true, 64, 0]);
await test('R2 cookie de sessão HttpOnly + SameSite=Strict; indicador mca_in visível ao JS', () => { const s = me.raw.join('\n'); return [/mca_customer=[a-f0-9]{64}[^\n]*HttpOnly/i.test(s), /mca_customer=[^\n]*SameSite=Strict/i.test(s), /mca_in=1(?![^\n]*HttpOnly)/i.test(s)]; }, [true, true, true]);
await test('R3 /me funciona logo, sem outro passo', async () => (await me.call('GET', '/me')).data.customer.email, email);
await test('R4 o mesmo e-mail outra vez → 409 «já tem conta»', async () => { const r = await anon.call('POST', '/register', { ...reg, email: email.toUpperCase(), password: 'outra-pass-9' }); return [r.status, r.data.error, sql(`SELECT count(*) FROM customers WHERE lower(email)='${email}'`)]; }, [409, 'email_taken', '1']);
await test('R5 sem aceitar os termos → 422', async () => (await anon.call('POST', '/register', { ...reg, email: `x-${run}@example.com`, terms: false })).data.error, 'terms_required');
await test('R6 palavra-passe fraca → 422', async () => (await anon.call('POST', '/register', { ...reg, email: `y-${run}@example.com`, password: 'curta' })).data.error, 'weak_password');
await test('R7 campo-armadilha preenchido → 400', async () => (await anon.call('POST', '/register', { ...reg, email: `z-${run}@example.com`, website: 'http://spam' })).status, 400);
await test('R8 sem origem permitida → 403', async () => (await anon.call('POST', '/register', { ...reg, email: `w-${run}@example.com` }, { origin: 'https://evil.example' })).status, 403);
await test('R9 palavra-passe guardada cifrada; consentimento de promoções com data', () => sql(`SELECT password_hash LIKE '$2y$%' OR password_hash LIKE '$argon%', password_hash <> '${PASS}', marketing_opt_in, marketing_consent_at IS NOT NULL FROM customers WHERE email='${email}'`), 't|t|t|t');

/* ── L. Entrar ────────────────────────────────────────── */
const second = client('/api/account');
await test('L1 entrar com e-mail e palavra-passe', async () => { const r = await second.call('POST', '/login', { email, password: PASS }); return [r.status, r.data.customer.email]; }, [200, email]);
await test('L2 palavra-passe errada e e-mail inexistente → mesma resposta', async () => [(await anon.call('POST', '/login', { email, password: 'errada123' })).data.error, (await anon.call('POST', '/login', { email: `nao-existe-${run}@example.com`, password: 'errada123' })).data.error], ['invalid_credentials', 'invalid_credentials']);
await test('L3 força bruta: 6.ª tentativa falhada → 429', async () => { const e = `bruta-${run}@example.com`; let s = 0; for (let i = 0; i < 6; i++) s = (await anon.call('POST', '/login', { email: e, password: 'errada123' })).status; return s; }, 429);

/* ── B. Reservas da conta ─────────────────────────────── */
const b1 = await me.book(email);
const b2 = await me.book(`outro-mail-${run}@example.com`);       // com sessão, mesmo com outro e-mail no formulário
const loose = await anon.book(email);                           // sem sessão, com o e-mail da conta
await test('B1 reservas feitas com a sessão iniciada aparecem na conta', async () => { const refs = (await me.call('GET', '/me')).data.bookings.map(b => b.reference); return [refs.includes(b1.reference), refs.includes(b2.reference)]; }, [true, true]);
await test('B2 reserva feita SEM sessão não entra na conta, mesmo com o mesmo e-mail', async () => (await me.call('GET', '/me')).data.bookings.some(b => b.reference === loose.reference), false);
await test('B3 cada reserva traz o link da área do cliente (ticket, facturas)', async () => (await me.call('GET', '/me')).data.bookings.every(b => /\/reserva\/#r=MCA-\d{4}-\d{5}&t=[a-f0-9]{48}$/.test(b.url)), true);
await test('B4 sem sessão → 401', async () => (await anon.call('GET', '/me')).status, 401);
const victim = `vitima-${run}@example.com`;
const vb = await anon.book(victim);
const intruder = client('/api/account');
await test('B5 privacidade: quem regista o e-mail de outra pessoa NÃO vê as reservas dela', async () => { const r = await intruder.call('POST', '/register', { ...reg, email: victim }); return [r.status, r.data.bookings.length, r.data.bookings.some(b => b.reference === vb.reference)]; }, [200, 0, false]);

/* ── P. Perfil, promoções e palavra-passe ─────────────── */
await test('P1 escrita sem token CSRF → 403', async () => (await me.call('POST', '/profile', { marketing: false }, { csrf: false })).data.error, 'csrf_invalid');
await test('P2 escrita de outra origem → 403', async () => (await me.call('POST', '/profile', { marketing: false }, { origin: 'https://evil.example' })).status, 403);
await test('P3 desligar promoções regista a data', async () => { const r = await me.call('POST', '/profile', { marketing: false }); return [r.status, r.data.customer.marketing, sql(`SELECT marketing_withdrawn_at IS NOT NULL FROM customers WHERE email='${email}'`)]; }, [200, false, 't']);
await test('P4 voltar a aceitar regista nova data; perfil actualizado', async () => { const before = sql(`SELECT marketing_consent_at FROM customers WHERE email='${email}'`); await new Promise(r => setTimeout(r, 1100)); const r = await me.call('POST', '/profile', { marketing: true, name: 'Ana C. Cliente', phone: '+258 84 111 2222', lang: 'en' }); return [r.data.customer.marketing, r.data.customer.name, r.data.customer.lang, sql(`SELECT marketing_consent_at > '${before}' AND marketing_withdrawn_at IS NULL FROM customers WHERE email='${email}'`)]; }, [true, 'Ana C. Cliente', 'en', 't']);
await test('P5 alterar palavra-passe exige a actual', async () => (await me.call('POST', '/password', { current: 'errada123', password: PASS2 })).status, 401);
await test('P6 alterar palavra-passe termina as outras sessões', async () => { const r = await me.call('POST', '/password', { current: PASS, password: PASS2 }); return [r.status, (await second.call('GET', '/me')).status, (await me.call('GET', '/me')).status]; }, [200, 401, 200]);

/* ── F. Palavra-passe esquecida ───────────────────────── */
await test('F1 pedido de reposição: mesma resposta para e-mail com e sem conta', async () => [(await anon.call('POST', '/forgot', { email })).data.ok, (await anon.call('POST', '/forgot', { email: `nao-existe-${run}@example.com` })).data.ok, sql(`SELECT count(*) FROM email_log WHERE to_addr='nao-existe-${run}@example.com'`)], [true, true, '0']);
await test('F2 o link de reposição NÃO fica no registo de e-mails', () => sql(`SELECT body LIKE '%reset=[link secreto%' AND body !~ 'reset=[a-f0-9]{64}' FROM email_log WHERE to_addr='${email}' AND kind='account_reset' ORDER BY id DESC LIMIT 1`), 't');
const rt = randomBytes(32).toString('hex');
sql(`UPDATE customers SET reset_token_hash='${sha(rt)}', reset_expires_at=now()+interval '1 hour' WHERE email='${email}'`);
const fresh = client('/api/account');
await test('F3 nova palavra-passe com o link → entra e termina sessões antigas', async () => { const r = await fresh.call('POST', '/reset', { token: rt, password: 'reposta-789' }); return [r.status, r.data.customer.email, (await me.call('GET', '/me')).status]; }, [200, email, 401]);
await test('F4 o link de reposição não serve duas vezes', async () => (await anon.call('POST', '/reset', { token: rt, password: 'outra-999x' })).data.error, 'invalid_link');
await test('F5 entrar com a palavra-passe nova', async () => (await anon.call('POST', '/login', { email, password: 'reposta-789' })).status, 200);

/* ── A. Painel: lista de clientes ─────────────────────── */
const cli = (name, mail, role) => execSync(`${PHP_CLI} api/bin/create-user.php "${name}" ${mail} ${role}`, { encoding: 'utf8' }).match(/token=([a-f0-9]{64})/)[1];
const adm = client('/api/admin'), mgr = client('/api/admin');
const aMail = `acc-admin-${run}@teste.local`, gMail = `acc-gerente-${run}@teste.local`;
await adm.call('POST', '/setup-password', { token: cli('Admin Contas', aMail, 'admin'), password: 'Teste-segura-123' });
await adm.call('POST', '/login', { email: aMail, password: 'Teste-segura-123' });
await mgr.call('POST', '/setup-password', { token: cli('Gerente Contas', gMail, 'gerente'), password: 'Teste-segura-123' });
await mgr.call('POST', '/login', { email: gMail, password: 'Teste-segura-123' });
await test('A1 Gerente vê a lista de clientes, com as reservas da conta e as promoções', async () => { const r = await mgr.call('GET', '/customers?q=' + encodeURIComponent(email)); const c = r.data.customers[0]; return [r.status, c.email, c.marketing, c.bookings]; }, [200, email, true, 2]);
await test('A2 filtro «aceitam promoções»', async () => (await mgr.call('GET', '/customers?marketing=1')).data.customers.every(c => c.marketing), true);
await test('A3 já não existe exportação de lista (404)', async () => (await adm.call('GET', '/customers/export')).status, 404);
await test('A4 e-mail de reposição (link secreto) não pode ser reenviado pelo painel', async () => { const id = sql(`SELECT id FROM email_log WHERE to_addr='${email}' AND kind='account_reset' ORDER BY id DESC LIMIT 1`); const r = await adm.call('POST', `/emails/${id}/resend`); return [r.status, r.data.error]; }, [422, 'not_resendable']);

/* ── D. Apagar conta ──────────────────────────────────── */
const del = client('/api/account');
await del.call('POST', '/login', { email, password: 'reposta-789' });
await test('D1 apagar exige a palavra-passe', async () => (await del.call('POST', '/delete', { password: 'errada123' })).status, 401);
await test('D2 apagar conta: conta e sessões saem; as reservas ficam (sem ligação à conta)', async () => { const r = await del.call('POST', '/delete', { password: 'reposta-789' }); return [r.status, sql(`SELECT count(*) FROM customers WHERE lower(email)='${email}'`), sql(`SELECT count(*) FROM bookings WHERE reference IN ('${b1.reference}','${b2.reference}') AND customer_id IS NULL`), (await del.call('GET', '/me')).status]; }, [200, '0', '2', 401]);

sql('TRUNCATE rate_limits');
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} testes passaram`);
process.exit(passed === results.length ? 0 : 1);
