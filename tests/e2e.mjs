/**
 * MOZ CAMP ADVENTURES — tests/e2e.mjs
 * =====================================================
 * Testes ponta-a-ponta do site gerado (Chrome headless via CDP).
 * Sem dependências: inclui um servidor estático e usa o Chrome
 * instalado (CHROME=<caminho> para outro executável).
 *
 * Uso: node scripts/build.mjs && node tests/e2e.mjs
 * =====================================================
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8790, CDP = 9340;
const WITH_API = !!process.env.E2E_BASE;                 // E2E_BASE=http://localhost:8791 → servidor PHP com API
const BASE = process.env.E2E_BASE || `http://localhost:${PORT}`;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = WITH_API ? null : createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try { const d = await readFile(f); res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(d); }
  catch { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end(await readFile(join(ROOT, '404.html')).catch(() => '404')); }
});
server?.listen(PORT);

const ud = await mkdtemp(join(tmpdir(), 'mca-e2e-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${ud}`, '--no-first-run', 'about:blank']);
let targets;
for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json(); } catch { await sleep(250); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pend = {}; const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
  if (m.method === 'Log.entryAdded' && /Content Security Policy/i.test(m.params.entry.text)) errors.push('CSP: ' + m.params.entry.text.slice(0, 160));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.args.some(x => /Content Security Policy/i.test(x.value || ''))) errors.push('CSP (consola)');
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
  return r.result.result.value;
};
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
/* Bloqueia rede externa (GTM/Firebase/CDN) para testes determinísticos */
await send('Network.enable');
await send('Network.setBlockedURLs', { urls: ['*googletagmanager*', '*gstatic.com*', '*firebase*', '*google.com/maps*'] });

const go = async (path, wait = 300) => {
  await send('Page.navigate', { url: `${BASE}${path}` });
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    try { if (await ev(`document.readyState === 'complete' && location.href !== 'about:blank'`)) break; } catch { /* a navegar */ }
  }
  await sleep(wait);
};
const results = [];
async function test(name, fn, expected) {
  try {
    const got = await fn();
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    results.push([ok, name, got, expected]);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(expected)}`}`);
  } catch (err) { results.push([false, name, err.message, expected]); console.log(`FAIL  ${name}  → erro: ${err.message.split('\n')[0]}`); }
}

const TOTAL = `document.querySelector('.summary__total span:last-child').textContent`;
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
const check = sel => ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)});r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}))})()`);
const setVal = (sel, v) => ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)});r.value=${JSON.stringify(v)};r.dispatchEvent(new Event('change',{bubbles:true}))})()`);
const iso = d => { const x = new Date(); x.setDate(x.getDate() + d); return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const submit = () => ev(`(()=>{const f=document.querySelector('[data-booking]');window.__opened=null;window.open=(u)=>{window.__opened=u};f.requestSubmit()})()`);
const resultShown = () => ev(`!document.querySelector('[data-booking-result]').hidden`);
const fillContact = () => ev(`(()=>{document.querySelector('#bk-name').value='Teste';document.querySelector('#bk-phone').value='+258 84 000 0000'})()`);

/* ── Tours: cálculo ───────────────────────────────────────── */
await go('/tours/island-hopping-experience/');
await test('A  Island Hopping, 1 adulto = 6.000', () => ev(TOTAL), '6.000 MZN');
await click('[data-step="adults:1"]'); await click('[data-step="children:1"]');
await test('B  2 adultos + 1 criança = 17.000', () => ev(TOTAL), '17.000 MZN');
await check('input[name=boat][value="boat-5pax"]');
await test('C  barco 5 pax substitui o preço por pessoa = 30.000', () => ev(TOTAL), '30.000 MZN');
await check('input[name=extra][value="beach-massage"]');
await test('D  + massagem 2.500 × 2 adultos = 35.000', () => ev(TOTAL), '35.000 MZN');
for (let i = 0; i < 6; i++) await click('[data-step="adults:1"]');
await test('E  capacidade do barco (5) limita participantes', () => ev(`+document.querySelector('[data-out=adults]').textContent + +document.querySelector('[data-out=children]').textContent`), 5);
await test('F  botão + desactivado na capacidade', () => ev(`document.querySelector('[data-step="adults:1"]').disabled`), true);
await submit();
await test('G  validação: data, nome e telefone em erro', () => ev(`document.querySelectorAll('[data-booking] .field.has-error').length`), 3);
await test('G2 nada é enviado com campos em falta', resultShown, false);

await go('/tours/ponta-douro-day-trip/');
await test('H  Ponta D\'Ouro começa no mínimo (3) = 24.000', () => ev(TOTAL), '24.000 MZN');
await click('[data-step="adults:-1"]');
await setVal('#bk-date', iso(10)); await fillContact(); await submit();
await test('H2 abaixo do mínimo: pedido BLOQUEADO', () => ev(`[!document.querySelector('[data-booking-error]').hidden, !document.querySelector('[data-booking-result]').hidden]`), [true, false]);
await click('[data-step="adults:1"]');
await check('input[name=transfer][value="day-trip-transfer"]');
await test('I  transfer próprio do JSON: 3 × 8.000 + 14.000 = 38.000', () => ev(TOTAL), '38.000 MZN');
await submit('');
await sleep(1200);
if (WITH_API) {
  await test('I2 [API] no mínimo: pedido registado com referência e total do servidor', () => ev(`[/^MCA-\\d{4}-\\d{5}$/.test(document.querySelector('[data-reference]')?.textContent||''), document.querySelector('[data-booking-result] .summary__total span:last-child').textContent, document.querySelector('[data-booking]').hidden]`), [true, '38.000 MZN', true]);
  await test('I3 [API] botão WhatsApp leva a referência', () => ev(`decodeURIComponent(document.querySelector('[data-booking-result] a[href*="wa.me"]').href).includes(document.querySelector('[data-reference]').textContent)`), true);
  if (process.env.E2E_SHOT) {   // captura do painel de confirmação para revisão visual
    const box = await ev(`(()=>{const r=document.querySelector('#reservar').getBoundingClientRect();return {x:r.left,y:r.top+scrollY,width:r.width,height:r.height}})()`);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...box, scale: 1 } });
    (await import('node:fs')).writeFileSync(process.env.E2E_SHOT, Buffer.from(shot.result.data, 'base64'));
  }
} else {
  await test('I2 [sem API] cai no envio directo: WhatsApp pré-preenchido com o total', () => ev(`decodeURIComponent(document.querySelector('[data-fallback-wa]')?.href||'').includes('38.000 MZN')`), true);
}

await go('/tours/macaneta-day-trip/');
await check('input[name=transfer][value="day-trip-transfer"]');
await test('J  transfer por omissão: 3 × 8.700 + 25.000 = 51.100', () => ev(TOTAL), '51.100 MZN');

await go('/tours/private-boat-rental/');
await click('[data-step="adults:1"]'); await click('[data-step="adults:1"]');
await test('K  aluguer de barco é preço por barco (não × pessoas) = 8.000', () => ev(TOTAL), '8.000 MZN');

await go('/tours/tofo-beach-trip/');
await test('L  pacote desactivado: sem formulário + noindex', () => ev(`!document.querySelector('[data-booking]') && document.querySelector('meta[name=robots]').content.startsWith('noindex')`), true);

/* ── Alojamentos ─────────────────────────────────────────── */
await go('/alojamentos/mamas-lodge/');
await setVal('#bk-in', iso(7)); await setVal('#bk-out', iso(8));
await test('M  Mama\'s Lodge 1 noite, 1 adulto = 14.900', () => ev(TOTAL), '14.900 MZN');
await setVal('#bk-out', iso(9));
await test('M2 2 noites usa a tarifa publicada (24.400, não 29.800)', () => ev(TOTAL), '24.400 MZN');
await click('[data-step="children:1"]');
await test('M3 + 1 criança 2 noites (14.900) = 39.300', () => ev(TOTAL), '39.300 MZN');
await setVal('#bk-out', iso(10));
await test('M4 3 noites = 2 noites + 1 noite adicional: (24.400 + 14.900) + criança (14.900 + 9.500) = 63.700', () => ev(TOTAL), '63.700 MZN');
await setVal('#bk-out', iso(12));
await test('M5 5 noites: adulto 24.400 + 3 × 14.900 = 69.100; criança 14.900 + 3 × 9.500 = 43.400 → 112.500', () => ev(TOTAL), '112.500 MZN');

await go('/alojamentos/villa-martins/');
await setVal('#bk-in', iso(7));
await test('N  Villa Martins: saída automática = entrada + 2 noites', () => ev(`document.querySelector('#bk-out').value`), iso(9));
await test('N2 2 noites, 1 adulto = 16.400', () => ev(TOTAL), '16.400 MZN');
await setVal('#bk-out', iso(8)); await fillContact(); await submit();
await test('N3 1 noite abaixo do mínimo: BLOQUEADO', () => ev(`[!document.querySelector('[data-booking-error]').hidden, !document.querySelector('[data-booking-result]').hidden]`), [true, false]);

await go('/alojamentos/cabo-beach-villas/');
await setVal('#bk-in', iso(7)); await setVal('#bk-out', iso(9));
await test('O  Cabo Beach Villas: por villa por noite, 2 noites = 45.398', () => ev(TOTAL), '45.398 MZN');

/* ── Catálogo ────────────────────────────────────────────── */
await go('/pages/tours.html?cat=safaris');
await test('P  ?cat=safaris mostra 3 experiências', () => ev(`[document.querySelectorAll('[data-grid] [data-card]:not([hidden])').length, document.querySelector('[data-count]').textContent]`), [3, '3 experiências']);
await click('[data-filter=""]');
await ev(`(()=>{const s=document.querySelector('[data-search]');s.value='baleias';s.dispatchEvent(new Event('input'))})()`); await sleep(300);
await test('Q  pesquisa sem acentos/maiúsculas ("baleias") encontra 1', () => ev(`document.querySelectorAll('[data-grid] [data-card]:not([hidden])').length`), 1);
await ev(`(()=>{const s=document.querySelector('[data-search]');s.value='';s.dispatchEvent(new Event('input'))})()`); await sleep(300);
await setVal('[data-sort]', 'asc');
await test('R  ordenar por preço: primeiro é o mais barato (1.000)', () => ev(`document.querySelector('[data-grid] [data-card]').dataset.price`), '1000');
await test('R2 pacotes desactivados não aparecem no catálogo', () => ev(`!document.querySelector('[href="/tours/tofo-beach-trip/"]')`), true);
await go('/pages/accommodations.html?loc=machangulo');
await test('S  alojamentos ?loc=machangulo mostra 3', () => ev(`document.querySelectorAll('[data-grid] [data-card]:not([hidden])').length`), 3);

/* ── Home, idiomas, redirecções ─────────────────────────── */
await go('/');
const approved = WITH_API ? (await (await fetch(BASE + '/api/reviews?item=home')).json()).count : 0;
await test('T  home: um só <h1>, 6 destaques; avaliações só se houver aprovadas (' + approved + ')', () => ev(`[document.querySelectorAll('h1').length, document.querySelectorAll('.scroller .xcard').length, document.querySelector('[data-reviews-section]').hidden]`), [1, 6, approved === 0]);
await test('T2 home: canonical e hreflang no domínio .co.mz', () => ev(`[document.querySelector('link[rel=canonical]').href, document.querySelector('link[hreflang=en]').href]`), ['https://mozcampadventures.co.mz/', 'https://mozcampadventures.co.mz/en/']);
await test('T3 home: JSON-LD TravelAgency válido', () => ev(`JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@type']`), 'TravelAgency');
await go('/en/tours/ponta-douro-day-trip/');
await test('U  EN: lang=en, textos do formulário em inglês', () => ev(`[document.documentElement.lang, document.querySelector('.summary__total span').textContent]`), ['en', 'Estimated total']);
await go('/pages/package.html?id=mamas-lodge', 1200);
await test('V  URL antigo package.html?id= redirecciona', () => ev('location.pathname'), '/alojamentos/mamas-lodge/');
await go('/en/pages/package.html?id=whale-watching', 1200);
await test('V2 URL antigo EN redirecciona', () => ev('location.pathname'), '/en/tours/whale-watching/');
await go('/pages/tours.html?cat=safaris');
await click('[data-lang-link]'); await sleep(1500);
await test('W  mudar idioma mantém o filtro (?cat=) e aplica-o', () => ev(`[location.pathname + location.search, document.querySelectorAll('[data-grid] [data-card]:not([hidden])').length]`), ['/en/pages/tours.html?cat=safaris', 3]);

/* ── Contacto, cookies, SEO ─────────────────────────────── */
await go('/pages/contact.html');
await ev(`(()=>{window.open=u=>{window.__opened=u};const f=document.querySelector('[data-contact]');f.requestSubmit(f.querySelector('button[value=wa]'))})()`);
await test('X  contacto vazio: 4 campos em erro', () => ev(`document.querySelectorAll('[data-contact] .field.has-error').length`), 4);
await ev(`(()=>{const f=document.querySelector('[data-contact]');f.name.value='Ana';f.email.value='ana@example.com';f.subject.value='info';f.message.value='Olá';f.requestSubmit(f.querySelector('button[value=wa]'))})()`);
await test('X2 contacto válido: botão WhatsApp abre WhatsApp', () => ev(`(window.__opened||'').startsWith('https://wa.me/258844406543')`), true);
await ev(`(()=>{const f=document.querySelector('[data-contact]');f.name.value='Ana';f.email.value='ana@example.com';f.subject.value='info';f.message.value='Olá, teste';f.requestSubmit(f.querySelector('button[value=api]'))})()`); await sleep(1200);
await test(WITH_API ? 'X3 [API] contacto enviado pelo site' : 'X3 [sem API] contacto mostra alternativas WhatsApp/e-mail', () => ev(`document.querySelector('[data-contact-msg]').className`), WITH_API ? 'form-msg is-ok' : 'form-msg is-err');
await ev(`localStorage.clear()`); await go('/pages/contact.html');
await test('Y  banner de cookies visível na 1.ª visita', () => ev(`getComputedStyle(document.getElementById('cookie-banner')).display !== 'none'`), true);
await click('#cb-accept-all');
await test('Y2 aceitar: banner escondido e escolha guardada', () => ev(`[document.getElementById('cookie-banner').style.display, JSON.parse(localStorage.getItem('mca_cookie_consent')).analytics]`), ['none', true]);

const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
await test('Z  sitemap: 64 URLs, sem pacotes desactivados nem .com', () => [(sitemap.match(/<loc>/g) || []).length, /tofo|vilanculos|mozcampadventures\.com/.test(sitemap)], [64, false]);
await test('Z2 sem erros de JavaScript nas páginas testadas', () => errors, []);

const pass = results.filter(r => r[0]).length;
console.log(`\n${pass}/${results.length} testes passaram`);
ws.close(); chrome.kill(); server?.close();
process.exit(pass === results.length ? 0 : 1);
