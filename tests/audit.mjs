/**
 * MOZ CAMP ADVENTURES — tests/audit.mjs
 * =====================================================
 * Auditoria técnica do site gerado (Fase 8):
 *   1. SEO (todas as páginas): título, descrição, canonical, hreflang
 *      recíproco, um <h1>, lang, alt nas imagens, JSON-LD válido, sitemap.
 *   2. Links: todos os href/src internos apontam para ficheiros existentes.
 *   3. Acessibilidade: axe-core (WCAG 2.1 A/AA + boas práticas) no Chrome.
 *   4. Desempenho: LCP, CLS, FCP e peso em mobile com 4G lenta e CPU 4×.
 * Uso: node scripts/build.mjs && node tests/audit.mjs
 * Falha com problemas de SEO/links, violações de acessibilidade «serious»
 * ou «critical», CLS > 0,1 ou LCP > 4 s. Relatório: docs/AUDITORIA_TECNICA.json
 * =====================================================
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, extname, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://mozcampadventures.co.mz';
const PORT = 8792, CDP = 9343;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = { failures: { seo: [], links: [], a11y: [], perf: [] }, a11y: {}, perf: {} };
let failures = 0;
const fail = (area, msg) => { failures++; report.failures[area].push(msg); console.log(`FAIL  [${area}] ${msg}`); };

/* ── Páginas geradas ─────────────────────────────────── */
const SKIP = new Set(['node_modules', 'prototipo', 'docs', 'tests', '.git', 'scripts', '.claude', 'api', 'dist']);
const walk = d => readdirSync(d).flatMap(e => {
  const p = join(d, e);
  if (statSync(p).isDirectory()) return SKIP.has(e) ? [] : walk(p);
  return e.endsWith('.html') ? [p] : [];
});
const pages = walk(ROOT).map(f => ({ file: f, url: '/' + relative(ROOT, f).split('\\').join('/').replace(/index\.html$/, ''), html: readFileSync(f, 'utf8') }));
const attr = (h, re) => (h.match(re) || [])[1];

/* ── 1. SEO ──────────────────────────────────────────── */
const indexable = pages.filter(p => /<meta name="robots" content="index/.test(p.html));
const titles = new Map();
for (const p of indexable) {
  const h = p.html;
  const title = attr(h, /<title>([^<]*)<\/title>/);
  const desc = attr(h, /<meta name="description" content="([^"]*)"/);
  const canon = attr(h, /<link rel="canonical" href="([^"]*)"/);
  if (!title) fail('seo', `${p.url}: sem <title>`);
  else if (titles.has(title)) fail('seo', `${p.url}: título repetido de ${titles.get(title)}`);
  else titles.set(title, p.url);
  if (!desc || desc.length < 50 || desc.length > 200) fail('seo', `${p.url}: meta description com ${desc ? desc.length : 0} caracteres (50–200)`);
  if (!canon || !canon.startsWith(SITE + '/')) fail('seo', `${p.url}: canonical em falta ou fora de ${SITE}`);
  if ((h.match(/<h1[\s>]/g) || []).length !== 1) fail('seo', `${p.url}: ${(h.match(/<h1[\s>]/g) || []).length} elementos <h1>`);
  if (!/<html lang="(pt|en)"/.test(h)) fail('seo', `${p.url}: <html lang> em falta`);
  if (!/<meta property="og:image" content="https:\/\//.test(h)) fail('seo', `${p.url}: og:image em falta`);
  for (const img of h.match(/<img\b[^>]*>/g) || []) if (!/\balt="/.test(img)) fail('seo', `${p.url}: imagem sem alt: ${img.slice(0, 80)}`);
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch { fail('seo', `${p.url}: JSON-LD inválido`); } }
  /* hreflang recíproco: a página alternativa tem de apontar de volta */
  const alts = [...h.matchAll(/<link rel="alternate" hreflang="(pt|en)" href="([^"]*)"/g)];
  for (const [, , href] of alts) {
    const target = pages.find(q => SITE + q.url === href || SITE + q.url.replace(/index\.html$/, '') === href);
    if (!target) { fail('seo', `${p.url}: hreflang para página inexistente ${href}`); continue; }
    if (!target.html.includes(`href="${canon}"`)) fail('seo', `${p.url}: hreflang não recíproco com ${href}`);
  }
}
const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
const smUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(SITE, ''));
for (const u of smUrls) { if (!indexable.some(p => p.url === u)) fail('seo', `sitemap: ${u} não existe ou não é indexável`); }
for (const p of indexable) { if (!smUrls.includes(p.url) && p.url !== '/404.html') fail('seo', `${p.url}: indexável mas fora do sitemap`); }
console.log(`SEO: ${indexable.length} páginas indexáveis, ${smUrls.length} URLs no sitemap, ${report.failures.seo.length} problemas`);

/* ── 2. Links internos ───────────────────────────────── */
let checked = 0;
for (const p of pages) {
  for (const m of p.html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    let u = m[1];
    if (/^(https?:|mailto:|tel:|#|data:|javascript:)/.test(u)) continue;
    u = u.split('#')[0].split('?')[0];
    if (!u) continue;
    const abs = u.startsWith('/') ? join(ROOT, u) : join(dirname(p.file), u);
    const file = u.endsWith('/') ? join(abs, 'index.html') : abs;
    checked++;
    if (!existsSync(file)) fail('links', `${p.url}: ligação partida → ${m[1]}`);
  }
}
console.log(`Links: ${checked} ligações internas verificadas, ${report.failures.links.length} partidas`);

/* ── Servidor estático + Chrome ──────────────────────── */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try { const d = await readFile(join(ROOT, p)); res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(d); }
  catch { res.writeHead(404); res.end(''); }
}).listen(PORT);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${await mkdtemp(join(tmpdir(), 'mca-audit-'))}`, 'about:blank']);
let targets;
for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json(); } catch { await sleep(250); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pend = {};
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable'); await send('Network.enable');
await send('Network.setBlockedURLs', { urls: ['*googletagmanager*', '*google.com/maps*'] });
const go = async (url, wait = 800) => {
  await send('Page.navigate', { url: `http://localhost:${PORT}${url}` });
  for (let i = 0; i < 150; i++) { await sleep(100); if (await ev(`document.readyState === 'complete'`)) break; }
  await sleep(wait);
};

/* ── 3. Acessibilidade (axe-core) ────────────────────── */
const AXE = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const A11Y_PAGES = ['/', '/pages/tours.html', '/tours/island-hopping-experience/', '/alojamentos/mamas-lodge/', '/pages/accommodations.html', '/pages/contact.html', '/pages/privacidade.html', '/en/', '/en/tours/ponta-douro-day-trip/', '/404.html', '/pagamento/', '/reserva/', '/conta/', '/en/account/', '/holiday-packages/', '/admin/'];
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
for (const url of A11Y_PAGES) {
  await go(url, 1200);
  await ev(AXE);
  const r = await ev(`axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, target: v.nodes.slice(0, 3).map(n => n.target.join(' ')), detail: v.nodes.map(n => n.target.join(' ') + ' → ' + (n.any[0] || n.all[0] || {}).message) })))`);
  report.a11y[url] = r;
  const bad = r.filter(v => v.impact === 'serious' || v.impact === 'critical');
  for (const v of bad) fail('a11y', `${url}: [${v.impact}] ${v.id} — ${v.help} (${v.n}×: ${v.target.join(' | ')})`);
  console.log(`A11y ${url}: ${r.length ? r.map(v => `${v.id}(${v.impact},${v.n})`).join(', ') : 'sem violações'}`);
}

/* ── 4. Desempenho (mobile, 4G lenta, CPU 4×, sem cache) ─ */
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__lcp=0;window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:'layout-shift',buffered:true});` });
for (const url of ['/', '/tours/island-hopping-experience/', '/pages/tours.html', '/pages/contact.html']) {
  await go(url, 2500);
  await ev(`window.scrollTo(0, 400)`); await sleep(400); await ev(`window.scrollTo(0, 0)`); await sleep(300);
  const m = await ev(`({ lcp: Math.round(window.__lcp), cls: +window.__cls.toFixed(3), fcp: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0), kb: Math.round(performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), 0) / 1024 + (performance.getEntriesByType('navigation')[0].transferSize || 0) / 1024), requests: performance.getEntriesByType('resource').length + 1 })`);
  report.perf[url] = m;
  console.log(`Perf ${url}: LCP ${m.lcp} ms · FCP ${m.fcp} ms · CLS ${m.cls} · ${m.kb} KB em ${m.requests} pedidos`);
  if (m.cls > 0.1) fail('perf', `${url}: CLS ${m.cls} > 0,1`);
  if (m.lcp > 4000) fail('perf', `${url}: LCP ${m.lcp} ms > 4 s`);
}

writeFileSync(join(ROOT, 'docs/AUDITORIA_TECNICA.json'), JSON.stringify(report, null, 1));
console.log(`\n${failures === 0 ? 'Auditoria sem falhas' : failures + ' falhas'} — relatório em docs/AUDITORIA_TECNICA.json`);
ws.close(); chrome.kill(); server.close();
process.exit(failures ? 1 : 0);
