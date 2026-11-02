/**
 * MOZ CAMP ADVENTURES — vendor-icons.mjs
 * Gera assets/vendor/boxicons/boxicons.css só com os ícones Boxicons
 * realmente usados (site, painel, scripts). Fonte: scripts/vendor/boxicons.min.css
 * (Boxicons 2.1.4, MIT). Correr de novo depois de usar ícones novos:
 *   node scripts/vendor-icons.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'scripts/vendor/boxicons.min.css'), 'utf8');

/* Ícones usados: procura "bx-…", "bxs-…", "bxl-…" nas fontes */
const scan = ['scripts', 'assets/js', 'admin', 'data'];   // data/: ícones dos pacotes de férias (holiday-packages.json)
const used = new Set();
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== 'vendor') walk(p); continue; }
    if (!['.mjs', '.js', '.html', '.json'].includes(extname(e))) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(/\b(bx[sl]?-[a-z0-9-]+)/g)) used.add(m[1]);
  }
}
scan.forEach(d => walk(join(ROOT, d)));

/* Divide o CSS minificado em regras de topo (respeitando @keyframes/@media) */
const rules = [];
let depth = 0, start = 0;
for (let i = 0; i < SRC.length; i++) {
  if (SRC[i] === '{') depth++;
  else if (SRC[i] === '}') { depth--; if (depth === 0) { rules.push(SRC.slice(start, i + 1)); start = i + 1; } }
}

const out = ['/* Boxicons 2.1.4 (MIT, https://boxicons.com) — subconjunto gerado por scripts/vendor-icons.mjs */',
  "@font-face{font-family:boxicons;font-weight:400;font-style:normal;font-display:block;src:url(boxicons.woff2) format('woff2')}"];
let icons = 0;
for (const r of rules) {
  if (r.startsWith('@font-face')) continue;
  const iconRule = r.match(/^\.(bx[sl]?-[a-z0-9-]+):before\{content:/);
  if (iconRule) {
    if (used.has(iconRule[1])) { out.push(r); icons++; }
    continue;
  }
  out.push(r);                                          // regras base (.bx, tamanhos, animações)
}
writeFileSync(join(ROOT, 'assets/vendor/boxicons/boxicons.css'), out.join('\n') + '\n');
const missing = [...used].filter(c => !SRC.includes(`.${c}:before`) && !/^bx-(spin|tada|flashing|burst|fade|rotate|flip|pull|border|xs|sm|md|lg)/.test(c));
console.log(`${icons} ícones incluídos · ${(out.join('\n').length / 1024).toFixed(1)} KB` + (missing.length ? ` · sem correspondência: ${missing.join(', ')}` : ''));
