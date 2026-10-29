/**
 * MOZ CAMP ADVENTURES — scripts/email-images.mjs
 * =====================================================
 * Imagens para os e-mails em assets/images/_email/ (JPG/PNG: o Outlook do Windows não mostra WebP):
 *   <slug>.jpg      capa de cada experiência/alojamento, 1200×600 (mostrada a 600×300)
 *   default.jpg     capa genérica (e-mails sem experiência)
 *   logo.png        logótipo para o topo (240 px, mostrado a 96)
 *   logo-white.png  logótipo branco para o rodapé escuro
 * Incremental: só refaz o que mudou. Corre em scripts/publish.mjs.
 * Uso: node scripts/email-images.mjs
 * =====================================================
 */

import { readFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets/images/_email');
mkdirSync(OUT, { recursive: true });
const fresh = (out, src) => existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs;
let made = 0;

async function cover(src, out) {
  if (!existsSync(src) || fresh(out, src)) return;
  await sharp(src).rotate().resize(1200, 600, { fit: 'cover', position: 'attention' }).jpeg({ quality: 74, progressive: true, mozjpeg: true }).toFile(out);
  made++;
}

const items = ['tours.json', 'accommodations.json'].flatMap(f => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8')));
for (const p of items) {
  if (!p.image) continue;
  await cover(join(ROOT, p.image.replace(/^\.\.\//, '')), join(OUT, `${p.slug || p.id}.jpg`));
}
await cover(join(ROOT, 'assets/images/hero/island-hopping-maputo-bay.webp'), join(OUT, 'default.jpg'));

const logo = join(ROOT, 'assets/images/logo/logo_moz_camp_adventures.png');
if (!fresh(join(OUT, 'logo.png'), logo)) {
  await sharp(logo).resize(240).png({ palette: true, quality: 90 }).toFile(join(OUT, 'logo.png'));
  made++;
}
if (!fresh(join(OUT, 'logo-white.png'), logo)) {
  const { data, info } = await sharp(logo).resize(160).ensureAlpha().extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
  await sharp({ create: { width: info.width, height: info.height, channels: 3, background: '#ffffff' } }).joinChannel(data, { raw: { width: info.width, height: info.height, channels: 1 } }).png({ palette: true }).toFile(join(OUT, 'logo-white.png'));
  made++;
}
console.log(`${items.length} capas verificadas · ${made} imagens de e-mail geradas em assets/images/_email/`);
