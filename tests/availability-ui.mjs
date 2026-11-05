/**
 * MOZ CAMP ADVENTURES — tests/availability-ui.mjs
 * Disponibilidade no browser (Chrome CDP): calendário público e página do painel, com cliques reais.
 *   API_BASE, PHP_CLI, MCA_CONFIG, PSQL (ver tests/availability.mjs); SHOTS=<pasta> para capturas.
 */

import { spawn, execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.API_BASE || 'http://localhost:8791';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { PHP_CLI, PSQL, SHOTS } = process.env;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sql = q => execSync(`${PSQL} -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const maputoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo' }).format(new Date());
const day = n => { const d = new Date(maputoToday() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/* Primeiro dia do mês seguinte e dias seguintes: ficam todos no mesmo mês do calendário */
const base = (() => { const d = new Date(maputoToday() + 'T12:00:00Z'); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12)); })();
const nm = n => new Date(base.getTime() + (n - 1) * 864e5).toISOString().slice(0, 10);

const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9352', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'mca-av-'))}`, 'about:blank']);
let targets;
for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch('http://127.0.0.1:9352/json/list')).json(); } catch { await sleep(250); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pend = {}, errors = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]);
  if (m.method === 'Log.entryAdded' && /Content Security Policy/i.test(m.params.entry.text)) errors.push(m.params.entry.text.slice(0, 160)); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
const size = (w, h, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
await size(1366, 900);
const go = async url => { await send('Page.navigate', { url: BASE + url }); await sleep(1300); };
const waitFor = async (cond, ms = 7000) => { for (let t = 0; t < ms; t += 120) { if (await ev(cond)) return true; await sleep(120); } return false; };
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
const type = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
const shot = async name => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, name + '.png'), Buffer.from(s.result.data, 'base64'));
};
const results = [];
async function test(name, fn, expected) {
  try { const got = await fn(); const ok = JSON.stringify(got) === JSON.stringify(expected); results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(expected)}`}`); }
  catch (e) { results.push(false); console.log(`FAIL  ${name}  → erro: ${e.message.split('\n')[0]}`); }
}
const axe = async () => { await ev(readFileSync('node_modules/axe-core/axe.min.js', 'utf8')); return ev(`axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'], rules: { 'color-contrast': { enabled: false } } }).then(r => r.violations.map(v => v.id + ':' + v.nodes[0].target))`); };

const IT = 'whale-watching', STAY = 'manico-camp', PAGE = `/tours/${IT}/`;
const cleanup = () => {
  sql(`DELETE FROM availability_rules WHERE item_id IN ('${IT}', '${STAY}')`);
  sql(`DELETE FROM availability_slots WHERE item_id IN ('${IT}', '${STAY}')`);
  sql(`DELETE FROM availability_blocks WHERE reason LIKE 'Teste%'`);
  sql(`UPDATE bookings SET status = 'cancelada' WHERE customer_name = 'Teste Calendario'`);
  sql(`DELETE FROM rate_limits`);
};
cleanup();
const apiBook = (date, adults, extra = {}) => fetch(BASE + '/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE },
  body: JSON.stringify({ idempotency_key: randomUUID(), item: IT, lang: 'pt', date, adults, children: 0, name: 'Teste Calendario', phone: '+258 84 000 0000', ...extra }) });
const openMonth = async () => { await go(PAGE); await waitFor(`!!document.querySelector('[data-avail]')`); await click('[data-av-go="1"]'); await waitFor(`!!document.querySelector('[data-av-day="${nm(1)}"]')`); };

try {
  /* Regra: capacidade 4, dia 2 bloqueado, dia 3 esgotado, dia 4 com 1 vaga */
  sql(`INSERT INTO availability_rules (item_id, capacity) VALUES ('${IT}', 4)`);
  sql(`INSERT INTO availability_slots (item_id, day, status, note) VALUES ('${IT}', '${nm(2)}', 'blocked', 'nota interna')`);
  await apiBook(nm(3), 4); await apiBook(nm(4), 3);

  await openMonth();
  await test('F1 calendário substitui o campo de data; só datas reserváveis activas', () => ev(`[!!document.querySelector('#bk-date').hidden, document.querySelector('[data-av-day="${nm(1)}"]').disabled, document.querySelector('[data-av-day="${nm(2)}"]').disabled, document.querySelector('[data-av-day="${nm(3)}"]').disabled, document.querySelector('[data-av-day="${nm(4)}"]').disabled]`), [true, false, true, true, false]);
  await test('F2 datas com estados visíveis e descritos para leitores de ecrã', () => ev(`[document.querySelector('[data-av-day="${nm(3)}"]').className.includes('is-sold_out'), document.querySelector('[data-av-day="${nm(3)}"]').getAttribute('aria-label').includes('Esgotado'), document.querySelector('[data-av-day="${nm(4)}"]').className.includes('is-limited')]`), [true, true, true]);
  await click(`[data-av-day="${nm(4)}"]`); await sleep(150);
  await test('F3 ao escolher a data mostra as vagas e guarda o valor', () => ev(`[document.querySelector('#bk-date').value, document.querySelector('[data-av-note]').textContent, document.querySelector('[data-av-day="${nm(4)}"]').getAttribute('aria-pressed')]`), [nm(4), 'Resta 1 vaga.', 'true']);
  await ev(`document.querySelector('[data-step="adults:1"]').click()`); await sleep(120);
  await test('F4 participantes acima das vagas: aviso no resumo', () => ev(`document.querySelector('[data-summary]').textContent.includes('Só restam 1 vagas')`), true);
  await ev(`(document.querySelector('#cookie-banner button') || {}).click?.(); document.querySelector('[data-avail]').scrollIntoView({ block: 'center', behavior: 'instant' })`); await sleep(500); await shot('20-calendario-site');

  /* Dados antigos: outra pessoa esgota a data com a página aberta */
  await openMonth();
  await click(`[data-av-day="${nm(4)}"]`); await sleep(100);
  await apiBook(nm(4), 1);
  await ev(`window.dispatchEvent(new Event('focus'))`);
  await waitFor(`document.querySelector('#bk-date').value === ''`);
  await test('F5 data esgotada entretanto: ao voltar à página sai da selecção, com aviso', () => ev(`[document.querySelector('#bk-date').value, document.querySelector('[data-av-note]').textContent, document.querySelector('[data-av-day="${nm(4)}"]').disabled]`), ['', 'Essa data deixou de estar disponível. Escolha outra.', true]);

  /* Reserva completa + disputa no último instante */
  await openMonth();
  await click(`[data-av-day="${nm(1)}"]`); await sleep(100);
  await type('#bk-name', 'Teste Calendario'); await type('#bk-phone', '+258 84 000 0000');
  await ev(`document.querySelector('[data-booking] [type=submit]').click()`);
  await waitFor(`!!document.querySelector('[data-reference]')`, 9000);
  await test('F6 reserva pelo calendário: referência e vagas actualizadas', async () => { const ref = await ev(`document.querySelector('[data-reference]').textContent`); return [/^MCA-/.test(ref), sql(`SELECT sum(people) FROM booking_slots WHERE booking_id = (SELECT id FROM bookings WHERE reference = '${ref}')`)]; }, [true, '1']);
  await openMonth();
  await click(`[data-av-day="${nm(5)}"]`); await sleep(100);
  await type('#bk-name', 'Teste Calendario'); await type('#bk-phone', '+258 84 000 0000');
  await apiBook(nm(5), 4);
  await ev(`document.querySelector('[data-booking] [type=submit]').click()`);
  await waitFor(`!document.querySelector('[data-booking-error]').hidden`);
  await test('F7 última vaga ganha por outra pessoa: mensagem clara, sem reserva, sem WhatsApp de recurso', () => ev(`[document.querySelector('[data-booking-error]').textContent, !!document.querySelector('[data-reference]'), !!document.querySelector('[data-fallback-wa]')]`), ['Essa data esgotou. Escolha outra data.', false, false]);

  /* Sessões */
  sql(`UPDATE availability_rules SET sessions = '{09:00,16:30}' WHERE item_id = '${IT}'`);
  await openMonth();
  await click(`[data-av-day="${nm(6)}"]`); await sleep(120);
  await type('#bk-name', 'Teste Calendario'); await type('#bk-phone', '+258 84 000 0000');
  await ev(`document.querySelector('[data-booking] [type=submit]').click()`); await sleep(500);
  await test('F8 pacote com sessões: mostra horários e exige a escolha', () => ev(`[[...document.querySelectorAll('[name=bk-session]')].map(i => i.value), document.querySelector('#bk-date').closest('.field').classList.contains('has-error'), !!document.querySelector('[data-reference]')]`), [['09:00', '16:30'], true, false]);
  await ev(`document.querySelector('[name=bk-session][value="16:30"]').click()`); await sleep(120);
  await ev(`document.querySelector('[data-booking] [type=submit]').click()`);
  await waitFor(`!!document.querySelector('[data-reference]')`, 9000);
  await test('F9 a sessão escolhida fica na reserva', async () => sql(`SELECT session FROM bookings WHERE reference = '${await ev(`document.querySelector('[data-reference]').textContent`)}'`), '16:30');

  /* Alojamento */
  sql(`INSERT INTO availability_slots (item_id, day, status) VALUES ('${STAY}', '${nm(9)}', 'blocked')`);
  await go(`/alojamentos/${STAY}/`); await sleep(300);
  await type('#bk-in', nm(8)); await type('#bk-out', nm(11));
  await waitFor(`document.querySelector('[data-summary]').textContent.includes('noites indisponíveis')`);
  await test('F10 alojamento: noite bloqueada no período é assinalada', () => ev(`document.querySelector('[data-summary]').textContent.includes('Há noites indisponíveis')`), true);

  /* Inglês, telemóvel, acessibilidade */
  await go(`/en/tours/${IT}/`); await waitFor(`!!document.querySelector('[data-avail]')`);
  await test('F11 calendário em inglês', () => ev(`document.querySelector('.avail__legend').textContent.includes('Sold out')`), true);
  await size(390, 844, true); await openMonth();
  await test('F12 telemóvel: sem scroll horizontal, dias com área de toque de pelo menos 36 px', () => ev(`[document.documentElement.scrollWidth <= innerWidth, document.querySelector('[data-av-day="${nm(1)}"]').getBoundingClientRect().height >= 36]`), [true, true]);
  await ev(`document.querySelector('[data-avail]').scrollIntoView({ block: 'center', behavior: 'instant' })`); await sleep(500); await shot('21-calendario-site-mobile');
  await size(1366, 900);
  await openMonth();
  await test('F13 calendário sem violações de acessibilidade (axe)', async () => { const v = await axe(); return v.filter(x => /avail|av-/.test(x)); }, []);

  /* Painel */
  const run = randomUUID().slice(0, 6), PASS = 'Calendario-teste-2026', email = `av-ui-${run}@teste.local`;
  const token = execSync(`${PHP_CLI} api/bin/create-user.php "Admin Calendario" ${email} admin`, { encoding: 'utf8' }).match(/token=([a-f0-9]{64})/)[1];
  await fetch(BASE + '/api/admin/setup-password', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ token, password: PASS }) });
  await go('/admin/'); await waitFor(`!!document.querySelector('#a-email')`);
  await type('#a-email', email); await type('#a-pass', PASS);
  await click('[data-auth] button[type=submit]');
  await waitFor(`!document.querySelector('[data-app]').hidden`);
  await test('P1 «Disponibilidade» no menu', () => ev(`!!document.querySelector('[data-nav] a[href="#/disponibilidade"]')`), true);
  await ev(`location.hash = '#/disponibilidade?item=${IT}'`);
  await waitFor(`!!document.querySelector('.av-cell') && !!document.querySelector('[data-av-kpis] .kpi')`);
  await click('[data-av-go="1"]'); await waitFor(`!!document.querySelector('[data-av-date="${nm(1)}"]')`);
  await test('P2 calendário do pacote com estados reais', () => ev(`[document.querySelector('[data-av-date="${nm(2)}"]').className.includes('is-blocked'), document.querySelector('[data-av-date="${nm(3)}"]').className.includes('is-sold_out')]`), [true, true]);
  await click(`[data-av-date="${nm(3)}"]`);
  await waitFor(`!!document.querySelector('.av-bookings li a[href^="#/reservas/"]')`);
  await test('P3 data: reservas, participantes e vagas', () => ev(`[document.querySelector('[data-av-day]').textContent.includes('Teste Calendario'), document.querySelector('[data-av-day]').textContent.includes('4 pessoas')]`), [true, true]);
  await shot('22-disponibilidade-painel');
  await click(`[data-av-date="${nm(7)}"]`); await waitFor(`document.querySelector('[data-av-day] h2').textContent === new Date('${nm(7)}T00:00:00').toLocaleDateString('pt-PT')`);
  await click('[data-av-day] [data-av-act="block"]:not([data-av-s])');
  await waitFor(`document.querySelector('[data-av-date="${nm(7)}"]').className.includes('is-blocked')`);
  await test('P4 bloquear data no painel chega ao site', async () => (await (await fetch(`${BASE}/api/availability?item=${IT}&from=${nm(7)}&to=${nm(7)}`)).json()).days[nm(7)].status, 'blocked');
  await ev(`document.querySelector('[data-av-cap] [name=cap]').value = '9'; document.querySelector('[data-av-cap]').requestSubmit()`);
  await waitFor(`document.querySelector('[data-toast]').textContent.includes('actualizada')`);
  await test('P5 alterar capacidade da data grava na base', () => sql(`SELECT capacity FROM availability_slots WHERE item_id = '${IT}' AND day = '${nm(7)}' AND session = ''`), '9');
  await click('[data-av-rule]'); await waitFor(`document.querySelector('[data-dialog]').open`);
  await test('P6 regras do pacote abrem com os valores gravados', () => ev(`[document.querySelector('[data-dialog] [name=capacity]').value, document.querySelector('[data-dialog] [name=sessions]').value]`), ['4', '09:00, 16:30']);
  await type('[data-dialog] [name=capacity]', '6');
  await ev(`document.querySelector('[data-dialog] button[value=ok]').click()`);
  await waitFor(`sessionStorage.x || document.querySelector('[data-toast]').textContent.includes('Regras')`);
  await test('P7 guardar regras', () => sql(`SELECT capacity FROM availability_rules WHERE item_id = '${IT}'`), '6');
  await click('[data-av-block]'); await waitFor(`document.querySelector('[data-dialog]').open && !!document.querySelector('[data-dialog] [name=reason]')`);
  await type('[data-dialog] [name=from]', nm(12)); await type('[data-dialog] [name=to]', nm(14)); await type('[data-dialog] [name=reason]', 'Teste manutenção');
  await ev(`document.querySelector('[data-dialog] button[value=ok]').click()`);
  await waitFor(`document.querySelector('[data-av-blocks]').textContent.includes('Teste manutenção')`);
  await test('P8 bloquear intervalo aparece nos bloqueios activos e no calendário', () => ev(`[document.querySelector('[data-av-blocks]').textContent.includes('Teste manutenção'), document.querySelector('[data-av-date="${nm(13)}"]').className.includes('is-blocked')]`), [true, true]);
  await ev(`document.querySelector('[data-av-view="week"]').click()`); await waitFor(`document.querySelectorAll('.av-cell').length === 7`);
  await test('P9 vista semanal', () => ev(`document.querySelectorAll('.av-cell').length`), 7);
  await ev(`document.querySelector('[data-av-view="month"]').click()`); await waitFor(`document.querySelectorAll('.av-cell').length > 20`);
  await test('P10 painel sem violações de acessibilidade (axe)', async () => axe(), []);
  await size(390, 844, true); await sleep(300);
  await test('P11 painel no telemóvel sem scroll horizontal', () => ev(`document.documentElement.scrollWidth <= innerWidth`), true);
  await size(1366, 900);
  await test('Z sem erros de JavaScript nem de CSP', () => errors, []);
} finally {
  cleanup();
  ws.close(); chrome.kill();
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} testes passaram`);
process.exit(pass === results.length ? 0 : 1);
