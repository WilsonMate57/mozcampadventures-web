/**
 * MOZ CAMP ADVENTURES — optimize-images.mjs
 * =====================================================
 * Gera variantes WebP responsivas em assets/images/_opt/
 * (480, 960, 1600 px de largura, sem ampliar) e o manifesto
 * assets/images/_opt/manifest.json usado por build.mjs para
 * srcset + width/height. Os originais NÃO são alterados.
 *
 * Uso: node scripts/optimize-images.mjs [--force]
 * =====================================================
 */

import { readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { join, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets/images');
const OUT = join(SRC, '_opt');
const WIDTHS = [480, 960, 1600];
const SKIP = ['_opt', '_email', 'logo', 'payment-methods', 'preloader'];
const FORCE = process.argv.includes('--force');

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.includes(e.name)) out.push(...await walk(p)); }
    else if (/\.(webp|jpe?g|png)$/i.test(e.name)) out.push(p);
  }
  return out;
}

async function newer(a, b) {
  try { return (await stat(a)).mtimeMs >= (await stat(b)).mtimeMs; } catch { return false; }
}

const manifest = {};
let made = 0, bytesIn = 0, bytesOut = 0;

for (const file of await walk(SRC)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  let meta;
  try { meta = await sharp(file).metadata(); }
  catch (err) { console.warn('IGNORADA (formato inválido):', rel, '-', err.message); continue; }
  const w0 = meta.width, h0 = meta.height;
  const widths = WIDTHS.filter(w => w < w0);
  if (!widths.length || w0 <= 1600) widths.push(Math.min(w0, 1600));
  const variants = [...new Set(widths)].sort((a, b) => a - b);
  const base = relative(SRC, file).replace(/\\/g, '/').replace(extname(file), '');

  const entry = { w: w0, h: h0, v: [] };
  bytesIn += (await stat(file)).size;
  for (const w of variants) {
    const out = join(OUT, `${base}-${w}.webp`);
    await mkdir(dirname(out), { recursive: true });
    if (FORCE || !(await newer(out, file))) {
      await sharp(file).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 72, effort: 5 }).toFile(out);
      made++;
    }
    bytesOut += w === variants[variants.length - 1] ? (await stat(out)).size : 0;
    entry.v.push(w);
  }
  manifest['/' + rel] = entry;
}

await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`${Object.keys(manifest).length} imagens · ${made} variantes geradas · originais ${(bytesIn / 1048576).toFixed(1)} MB → maior variante ${(bytesOut / 1048576).toFixed(1)} MB`);
