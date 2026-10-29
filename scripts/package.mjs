/**
 * MOZ CAMP ADVENTURES — scripts/package.mjs
 * =====================================================
 * Prepara o pacote de publicação (Fase 10) em dist/httpdocs/ — só o que o
 * servidor precisa, sem ficheiros de desenvolvimento — e um manifesto
 * SHA-256 (dist/MANIFEST.sha256) para confirmar a cópia no Plesk.
 * NÃO publica nada: o envio é manual, depois de autorizado (docs/PUBLICACAO.md).
 * Uso: node scripts/build.mjs && node scripts/package.mjs
 * =====================================================
 */

import { readdirSync, statSync, readFileSync, writeFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist', 'httpdocs');

/* Pastas e ficheiros que nunca vão para o servidor */
const SKIP_DIRS = new Set(['.git', '.claude', '.vscode', 'node_modules', 'tests', 'docs', 'scripts', 'prototipo', 'dist']);
const SKIP_FILE = /(^|\/)(package(-lock)?\.json|vercel\.json|settings\.json|\.gitignore|.*\.md|.*\.zip|.*\.mjs|.*\.log|Thumbs\.db|\.DS_Store)$|^[^/]+\.pdf$/;   // PDF na raiz = documentos de trabalho (podem ter dados de clientes)
/* Configuração com segredos nunca pode estar dentro do httpdocs */
const SECRET = /(^|\/)(mca-config\.php|config\.php|\.env(\..*)?)$/;

const walk = d => readdirSync(d).flatMap(e => {
  const p = join(d, e), rel = relative(ROOT, p).split('\\').join('/');
  if (statSync(p).isDirectory()) return SKIP_DIRS.has(e) ? [] : walk(p);
  return SKIP_FILE.test(rel) ? [] : [rel];
});

/* Publicação do catálogo a partir do painel: o servidor regenera o site (Node.js + sharp, `npm ci --omit=dev`).
   Estes ficheiros ficam inacessíveis pela web (.htaccess e nginx: scripts/, *.mjs, package*.json). */
const SERVER_TOOLS = ['scripts/build.mjs', 'scripts/i18n.mjs', 'scripts/optimize-images.mjs', 'scripts/email-images.mjs', 'scripts/publish.mjs', 'package.json', 'package-lock.json'];
const files = [...walk(ROOT), ...SERVER_TOOLS];
const secrets = files.filter(f => SECRET.test(f));
if (secrets.length) {
  console.error(`Recusado: ficheiros de configuração com segredos dentro do site: ${secrets.join(', ')}\nA configuração fica fora do httpdocs (docs/DEPLOYMENT.md §3.1).`);
  process.exit(1);
}

/* Verificações mínimas antes de empacotar */
const problems = [];
const html = files.filter(f => f.endsWith('.html'));
for (const f of html) {
  const s = readFileSync(join(ROOT, f), 'utf8');
  if (/<script(?![^>]*\bsrc=)(?![^>]*type="application\/(ld\+)?json")[^>]*>/.test(s)) problems.push(`${f}: <script> inline (bloqueado pela CSP)`);
  if (/\son[a-z]+="/.test(s)) problems.push(`${f}: atributo on… (bloqueado pela CSP)`);
}
for (const req of ['index.html', '404.html', '.htaccess', 'robots.txt', 'sitemap.xml', 'api/index.php', 'api/.htaccess', 'admin/index.html', 'data/tours.json']) {
  if (!files.includes(req)) problems.push(`em falta: ${req}`);
}
if (problems.length) { console.error('Recusado:\n  ' + problems.join('\n  ')); process.exit(1); }

rmSync(join(ROOT, 'dist'), { recursive: true, force: true });
const lines = [];
let bytes = 0;
for (const f of files) {
  const dest = join(OUT, f);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(ROOT, f), dest);
  const buf = readFileSync(dest);
  bytes += buf.length;
  lines.push(`${createHash('sha256').update(buf).digest('hex')}  ${f}`);
}
writeFileSync(join(ROOT, 'dist', 'MANIFEST.sha256'), lines.join('\n') + '\n');
console.log(`${files.length} ficheiros (${(bytes / 1048576).toFixed(1)} MB) em dist/httpdocs · ${html.length} páginas HTML verificadas · manifesto em dist/MANIFEST.sha256`);
console.log('Nada foi publicado. Seguir docs/PUBLICACAO.md.');
