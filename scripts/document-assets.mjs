/**
 * MOZ CAMP ADVENTURES — scripts/document-assets.mjs
 * =====================================================
 * Gera as imagens das facturas e recibos em PDF (api/assets/doc-*.jpg).
 * O gerador de PDF (api/src/Pdf.php) só aceita JPEG, sem transparência:
 * o logótipo horizontal e os ícones do rodapé são achatados sobre o mesmo
 * cinzento do fundo da página (#f2f2f2), como no modelo de factura da empresa.
 * Uso: node scripts/document-assets.mjs   (precisa de `npm install`: sharp)
 * =====================================================
 */

import sharp from 'sharp';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'api', 'assets');
const BG = '#f2f2f2', INK = '#2c2c2a';

await sharp(join(ROOT, 'assets/images/logo/logo_moz_camp_adventures_horizontal.png'))
  .flatten({ background: BG }).jpeg({ quality: 90 }).toFile(join(OUT, 'doc-logo.jpg'));

/* Ícones simples (24×24) para a morada, e-mail, site e telefone */
const icons = {
  pin: `<path fill="${INK}" d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>`,
  mail: `<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="${INK}" stroke-width="2"/><path d="M3.5 6.5 12 13l8.5-6.5" fill="none" stroke="${INK}" stroke-width="2"/>`,
  globe: `<g fill="none" stroke="${INK}" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M4.5 7.5h15M4.5 16.5h15"/></g>`,
  phone: `<circle cx="12" cy="12" r="11" fill="${INK}"/><path fill="${BG}" transform="translate(5.2 5.2) scale(.57)" d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C9.6 21 2 13.4 2 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/>`,
};
for (const [name, body] of Object.entries(icons)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96"><rect width="24" height="24" fill="${BG}"/>${body}</svg>`;
  await sharp(Buffer.from(svg)).flatten({ background: BG }).jpeg({ quality: 92 }).toFile(join(OUT, `doc-icon-${name}.jpg`));
}
console.log('api/assets: doc-logo.jpg + 4 ícones');
