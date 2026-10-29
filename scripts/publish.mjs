/**
 * MOZ CAMP ADVENTURES — scripts/publish.mjs
 * =====================================================
 * Publicação a partir do painel (ou de uma tarefa agendada do Plesk):
 *   1. optimiza as fotos novas (WebP 480/960/1600 — scripts/optimize-images.mjs, incremental);
 *   2. regenera o site (scripts/build.mjs).
 * Sai com código ≠ 0 se algum passo falhar (o painel repõe então o catálogo anterior).
 * Uso: node scripts/publish.mjs        (precisa de `npm ci --omit=dev` no servidor: sharp)
 * =====================================================
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const step = (label, script) => {
  const t = Date.now();
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', script)], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  const out = ((r.stdout || '') + (r.stderr || '')).trim().split(/\r?\n/).slice(-6).join('\n');
  console.log(`[${label}] ${r.status === 0 ? 'ok' : 'FALHOU'} em ${((Date.now() - t) / 1000).toFixed(1)} s\n${out}`);
  if (r.status !== 0) process.exit(r.status || 1);
};
step('fotos', 'optimize-images.mjs');
step('site', 'build.mjs');
console.log('Publicação concluída.');
