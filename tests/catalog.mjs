/**
 * MOZ CAMP ADVENTURES — tests/catalog.mjs
 * =====================================================
 * Editor do catálogo no painel (rascunho, fotos, publicação, versões) — SÓ em desenvolvimento.
 *   API_BASE=http://localhost:8791   PHP_CLI="php"   MCA_CONFIG=<config dev com storage_dir e node_bin>
 * Guarda data/*.json antes de começar e repõe tudo no fim (dados, fotos de teste, páginas geradas, rascunho),
 * mesmo que um teste falhe; depois regenera o site.
 * Uso: node tests/catalog.mjs
 * =====================================================
 */

import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const BASE = process.env.API_BASE || 'http://localhost:8791';
const ORIGIN = process.env.API_ORIGIN || BASE;
const { PHP_CLI, MCA_CONFIG } = process.env;
if (!PHP_CLI || !MCA_CONFIG) { console.error('Defina PHP_CLI e MCA_CONFIG (ver cabeçalho).'); process.exit(2); }

const results = [];
async function test(name, fn, expected) {
  try {
    const got = await fn();
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(expected)}`}`);
  } catch (e) { results.push(false); console.log(`FAIL  ${name}  → erro: ${e.message.split('\n')[0]}`); }
}

function client() {
  const c = { cookie: '', csrf: '' };
  c.call = async (method, path, body, opt = {}) => {
    const headers = { Origin: ORIGIN };
    if (c.cookie) headers.Cookie = c.cookie;
    if (method !== 'GET' && c.csrf && opt.csrf !== false) headers['X-CSRF-Token'] = c.csrf;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(BASE + '/api/admin' + path, { method, headers, body: payload });
    const set = r.headers.get('set-cookie');
    if (set && set.startsWith('mca_admin=')) c.cookie = set.split(';')[0];
    const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.text();
    if (data && data.csrf) c.csrf = data.csrf;
    return { status: r.status, data };
  };
  return c;
}
const cliUser = (name, email, role) => execSync(`${PHP_CLI} api/bin/create-user.php "${name}" ${email} ${role}`, { encoding: 'utf8' }).match(/token=([a-f0-9]{64})/)[1];
const phpConfig = key => execSync(`${PHP_CLI} -r "echo (require getenv('MCA_CONFIG'))['app']['${key}'] ?? '';"`, { encoding: 'utf8' }).trim();

/* ── Estado a repor no fim ─────────────────────────────── */
const FILES = ['tours.json', 'accommodations.json', 'en.json', 'booking-rules.json', 'categories.json'];
const snapshot = Object.fromEntries(FILES.map(f => [f, readFileSync(join('data', f))]));
const STORAGE = phpConfig('storage_dir');
const DRAFT = join(STORAGE, 'catalog-draft'), HISTORY = join(STORAGE, 'catalog-history');
const draftBackup = existsSync(join(DRAFT, 'tours.json')) ? join(STORAGE, `catalog-draft.bak-${Date.now()}`) : null;
if (draftBackup) cpSync(DRAFT, draftBackup, { recursive: true });
rmSync(DRAFT, { recursive: true, force: true });
const historyBefore = new Set(existsSync(HISTORY) ? readdirSync(HISTORY) : []);

const run = randomUUID().slice(0, 6);
const SLUG = `teste-pacote-${run}`;
const PASS = 'Catalogo-teste-2026';
const anon = client(), admin = client(), mgr = client();
const photoDir = join('assets/images/packages', SLUG);

try {
  const at = cliUser('Admin Catálogo', `admin-cat-${run}@teste.local`, 'admin');
  await anon.call('POST', '/setup-password', { token: at, password: PASS });
  await admin.call('POST', '/login', { email: `admin-cat-${run}@teste.local`, password: PASS });
  const mt = cliUser('Gerente Catálogo', `gerente-cat-${run}@teste.local`, 'gerente');
  await anon.call('POST', '/setup-password', { token: mt, password: PASS });
  await mgr.call('POST', '/login', { email: `gerente-cat-${run}@teste.local`, password: PASS });

  /* Acesso */
  await test('K1 sem sessão → 401', async () => (await anon.call('GET', '/catalog/items')).status, 401);
  await test('K2 gerente edita (catalog.edit) mas não publica', async () => { const r = await mgr.call('GET', '/catalog/items'); return [r.status, r.data.can_publish, r.data.draft.changes, r.data.items.length]; }, [200, false, 0, 30]);
  await test('K3 gerente a publicar → 403', async () => (await mgr.call('POST', '/catalog/publish', {})).status, 403);
  await test('K4 gerente sem acesso às versões anteriores → 403', async () => (await mgr.call('GET', '/catalog/history')).status, 403);
  await test('K5 lista inclui as 8 categorias e os 2 desactivados', async () => { const r = await admin.call('GET', '/catalog/items'); return [r.data.categories.length, r.data.items.filter(i => !i.active).map(i => i.id).sort()]; }, [8, ['tofo-beach-trip', 'vilanculos-trip']]);

  /* Editar um pacote existente */
  const ih = (await admin.call('GET', '/catalog/items/island-hopping-experience')).data;
  await test('E1 abrir pacote: PT, EN e regras', () => [ih.item.price_from, ih.en.subtitle, ih.kind, ih.published, ih.change], [6000, 'Inhaca · Portuguese Island · Santa Maria Beach', 'tour', true, null]);
  const form = (over = {}) => ({ item: { ...ih.item, price_old: 6500, ...over }, en: ih.en, rules: ih.rules });
  await test('E2 gravar sem token CSRF → 403', async () => (await admin.call('POST', '/catalog/items/island-hopping-experience', form(), { csrf: false })).status, 403);
  await test('E3 preço antigo ≤ preço → 422 no campo', async () => { const r = await admin.call('POST', '/catalog/items/island-hopping-experience', form({ price_from: 7000 })); return [r.status, r.data.fields]; }, [422, { price_old: 'invalid' }]);
  await test('E4 preço vazio → 422', async () => (await admin.call('POST', '/catalog/items/island-hopping-experience', form({ price_from: '' }))).data.fields.price_from, 'required');
  await test('E5 foto fora de assets/images → 422', async () => (await admin.call('POST', '/catalog/items/island-hopping-experience', form({ gallery: ['../assets/images/../../api/config.example.php'] }))).data.fields.gallery, 'invalid_photo');
  await test('E6 gravar preço 6.200 + info importante → rascunho «alterado»', async () => {
    const r = await admin.call('POST', '/catalog/items/island-hopping-experience', form({ price_from: 6200, importantInfo: [...ih.item.importantInfo, `Nota de teste ${run}`] }));
    return [r.status, r.data.item.price_from, r.data.item.price, r.data.item.priceOld, r.data.change, r.data.item.importantInfo.at(-1)];
  }, [200, 6200, '6.200 MZN', '6.500 MZN', 'alterado', `Nota de teste ${run}`]);
  await test('E7 antes de publicar: site e preço da reserva inalterados', async () => {
    const live = JSON.parse(readFileSync('data/tours.json', 'utf8')).find(p => p.id === 'island-hopping-experience').price_from;
    const exp = (await admin.call('GET', '/experiences')).data.items.find(i => i.id === 'island-hopping-experience').price_from;
    return [live, exp, readFileSync('tours/island-hopping-experience/index.html', 'utf8').includes(`Nota de teste ${run}`)];
  }, [6000, 6000, false]);
  await test('E8 campos desconhecidos e ordem do JSON preservados', async () => Object.keys((await admin.call('GET', '/catalog/items/island-hopping-experience')).data.item).slice(0, 5), ['id', 'slug', 'category', 'name', 'subtitle']);

  /* Criar pacote */
  await test('N1 categoria inválida → 422', async () => (await admin.call('POST', '/catalog/items', { kind: 'tour', name: 'X Teste', category: 'nao-existe' })).data.error, 'invalid_category');
  await test('N2 criar «Teste Pacote» → slug, desactivado até completar', async () => {
    const r = await admin.call('POST', '/catalog/items', { kind: 'tour', name: `Teste Pacote ${run}`, category: 'sunset-cruise' });
    const g = (await admin.call('GET', `/catalog/items/${SLUG}`)).data;
    return [r.data.id, g.item.disabled, g.published, g.change];
  }, [SLUG, true, false, 'novo']);
  await test('N3 slug repetido → 409', async () => (await admin.call('POST', '/catalog/items', { kind: 'tour', name: `Teste Pacote ${run}`, category: 'sunset-cruise' })).status, 409);
  await test('N4 slug de pacote existente → 409', async () => (await admin.call('POST', '/catalog/items', { kind: 'tour', name: 'Outro', slug: 'whale-watching', category: 'sunset-cruise' })).status, 409);

  /* Fotos */
  const jpg = await sharp({ create: { width: 1400, height: 900, channels: 3, background: { r: 0, g: 160, b: 170 } } }).jpeg().toBuffer();
  const tiny = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#ff9a08' } }).png().toBuffer();
  const up = (buf, name, type) => { const fd = new FormData(); fd.append('photo', new Blob([buf], { type }), name); return admin.call('POST', `/catalog/items/${SLUG}/photos`, fd); };
  await test('F1 ficheiro que não é imagem (extensão .jpg) → 415', async () => (await up(Buffer.from('<?php echo 1;'), 'x.jpg', 'image/jpeg')).status, 415);
  await test('F2 foto pequena demais → 422', async () => (await up(tiny, 'p.png', 'image/png')).data.error, 'photo_too_small');
  await test('F3 sem token CSRF → 403', async () => { const fd = new FormData(); fd.append('photo', new Blob([jpg], { type: 'image/jpeg' }), 'a.jpg'); return (await admin.call('POST', `/catalog/items/${SLUG}/photos`, fd, { csrf: false })).status; }, 403);
  const p1 = (await up(jpg, 'capa.jpg', 'image/jpeg')).data;
  const p2 = (await up(jpg, 'segunda.jpg', 'image/jpeg')).data;
  await test('F4 foto carregada: nome aleatório na pasta do pacote; 1.ª vira capa', async () => {
    const g = (await admin.call('GET', `/catalog/items/${SLUG}`)).data.item;
    return [new RegExp(`^\\.\\./assets/images/packages/${SLUG}/${SLUG}-[a-f0-9]{10}\\.jpg$`).test(p1.path), existsSync(p1.url.slice(1)), g.gallery.length, g.image === p1.path];
  }, [true, true, 2, true]);

  /* Completar e activar */
  const draft = (await admin.call('GET', `/catalog/items/${SLUG}`)).data;
  await test('N5 rascunho desactivado grava-se incompleto; activar exige preço e descrição', async () => [(await admin.call('POST', `/catalog/items/${SLUG}`, { item: { ...draft.item, subtitle: 'Rascunho' }, en: {}, rules: {} })).status, (await admin.call('POST', `/catalog/items/${SLUG}`, { item: { ...draft.item, disabled: false }, en: {}, rules: {} })).data.fields], [200, { price_from: 'required', description: 'required_to_activate' }]);
  const full = {
    item: { ...draft.item, disabled: false, subtitle: 'Baía de Maputo', location: 'Marina de Maputo', duration: '3 horas', price_from: 4500, priceLabel: 'por pessoa', price_child: 2500, priceChildLabel: 'Crianças (4–12)',
      description: `Pacote de teste ${run} criado no painel.`, detailText: ['Primeiro parágrafo.', 'Segundo parágrafo.'], includes: ['Bebidas'], excludes: ['Gorjetas'], highlights: ['Pôr do sol'],
      importantInfo: ['Chegar 15 minutos antes.'], itinerary: [{ time: '16h00', title: 'Partida', body: 'Saída da marina.', checklist: ['Casaco'] }],
      extras: [{ title: 'Fotógrafo', desc: '1 hora', price: 3000, perPerson: false }], gallery: [p2.path, p1.path], image: p2.path, heroImage: p1.path },
    en: { name: `Test Package ${run}`, description: `Test package ${run} created in the panel.`, extras: [{ id: 'fotografo', title: 'Photographer' }] },
    rules: { minPeople: 2, maxPeople: 12 },
  };
  await test('N6 regras: mínimo acima do máximo → 422', async () => (await admin.call('POST', `/catalog/items/${SLUG}`, { ...full, rules: { minPeople: 20, maxPeople: 12 } })).data.fields, { 'rules.maxPeople': 'below_min' });
  await test('N7 gravar pacote completo (galeria reordenada, capa = 2.ª foto)', async () => {
    const r = (await admin.call('POST', `/catalog/items/${SLUG}`, full)).data;
    return [r.ok, r.item.gallery[0] === p2.path, r.item.image === p2.path, r.item.heroImage === p1.path, r.item.extras[0].id, r.en.extras[0].title, r.rules.minPeople, 'disabled' in r.item];
  }, [true, true, true, true, 'fotografo', 'Photographer', 2, false]);

  /* Publicar */
  const before = (await admin.call('GET', '/catalog/items')).data.draft;
  await test('P1 rascunho com 2 alterações', () => [before.changes, before.items.sort()], [2, ['island-hopping-experience', SLUG].sort()]);
  const pub = await admin.call('POST', '/catalog/publish', {});
  await test('P2 publicar → ok, cópia de segurança criada', () => [pub.status, pub.data.ok, pub.data.items.sort(), /^\d{8}-\d{6}-[a-f0-9]{4}$/.test(pub.data.backup)], [200, true, ['island-hopping-experience', SLUG].sort(), true]);
  await test('P3 site regenerado: página PT e EN do novo pacote, preço actualizado', async () => {
    const pt = readFileSync(`tours/${SLUG}/index.html`, 'utf8'), en = readFileSync(`en/tours/${SLUG}/index.html`, 'utf8');
    const ih2 = readFileSync('tours/island-hopping-experience/index.html', 'utf8');
    return [pt.includes(`Teste Pacote ${run}`), en.includes(`Test Package ${run}`), pt.includes('4.500 MZN'), ih2.includes('6.200 MZN'), ih2.includes(`Nota de teste ${run}`)];
  }, [true, true, true, true, true]);
  await test('P4 fotos novas optimizadas (WebP no manifesto) e usadas na página', async () => {
    const m = JSON.parse(readFileSync('assets/images/_opt/manifest.json', 'utf8'));
    const key = p2.url;
    return [!!m[key], readFileSync(`tours/${SLUG}/index.html`, 'utf8').includes(`/assets/images/_opt/packages/${SLUG}/`)];
  }, [true, true]);
  await test('P5 reservas usam o preço publicado (servidor)', async () => {
    const r = await fetch(BASE + '/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ item: SLUG, lang: 'pt', name: 'Teste Catálogo', email: `cat-${run}@example.com`, phone: '+258 84 000 0000', date: new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10), adults: 2, children: 1, consent: true, idempotency_key: randomUUID() }) });
    const d = await r.json();
    return [r.status, d.total ?? d.estimate?.total ?? d.price?.total];
  }, [201, 11500]);
  await test('P6 mínimo de participantes aplicado no servidor', async () => {
    const r = await fetch(BASE + '/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ item: SLUG, lang: 'pt', name: 'Teste Catálogo', email: `cat-${run}@example.com`, phone: '+258 84 000 0000', date: new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10), adults: 1, consent: true, idempotency_key: randomUUID() }) });
    return r.status;
  }, 422);
  await test('P7 depois de publicar: rascunho limpo; publicar de novo → 409', async () => [(await admin.call('GET', '/catalog/items')).data.draft.changes, (await admin.call('POST', '/catalog/publish', {})).data.error], [0, 'no_changes']);

  /* Falha na geração → catálogo anterior reposto */
  await admin.call('POST', `/catalog/items/${SLUG}`, { ...full, item: { ...full.item, price_from: 4800 } });
  const broken = JSON.parse(readFileSync(join(DRAFT, 'categories.json'), 'utf8'));
  delete broken['sunset-cruise'];            // a geração falha: pacotes sem categoria
  writeFileSync(join(DRAFT, 'categories.json'), JSON.stringify(broken));
  const toursBefore = readFileSync('data/tours.json', 'utf8');
  await test('R1 geração falha → 500, catálogo e site anteriores repostos, rascunho mantido', async () => {
    const r = await admin.call('POST', '/catalog/publish', {});
    return [r.status, r.data.error, r.data.restored, readFileSync('data/tours.json', 'utf8') === toursBefore, readFileSync(`tours/${SLUG}/index.html`, 'utf8').includes('4.500 MZN'), (await admin.call('GET', '/catalog/items')).data.draft.changes > 0];
  }, [500, 'publish_failed', true, true, true, true]);
  await test('R2 descartar rascunho', async () => [(await admin.call('POST', '/catalog/discard', {})).data.ok, (await admin.call('GET', '/catalog/items')).data.draft.changes], [true, 0]);

  /* Versões anteriores */
  await test('H1 histórico lista a versão substituída', async () => (await admin.call('GET', '/catalog/history')).data.versions.some(v => v.id === pub.data.backup && v.replaced_by.includes(SLUG)), true);
  await test('H2 repor versão anterior → rascunho; pacote novo fica desactivado (URL mantido)', async () => {
    const r = await admin.call('POST', `/catalog/history/${pub.data.backup}/restore`, {});
    const g = (await admin.call('GET', `/catalog/items/${SLUG}`)).data;
    const ih3 = (await admin.call('GET', '/catalog/items/island-hopping-experience')).data.item.price_from;
    return [r.data.ok, g.item.disabled, ih3, readFileSync('data/tours.json', 'utf8') === toursBefore];
  }, [true, true, 6000, true]);
  await test('H3 id de versão inválido → 404', async () => (await admin.call('POST', '/catalog/history/../../x/restore', {})).status, 404);
  await admin.call('POST', '/catalog/discard', {});
  await test('A1 auditoria regista criação, fotos, publicação e falha', async () => {
    const e = (await admin.call('GET', '/audit')).data.entries.filter(x => x.entity === 'catalog').map(x => x.action);
    return ['catalog_item_created', 'catalog_photo_uploaded', 'catalog_item_saved', 'catalog_published', 'catalog_publish_failed', 'catalog_version_loaded', 'catalog_draft_discarded'].every(a => e.includes(a));
  }, true);
} finally {
  /* Repor tudo como estava */
  for (const f of FILES) writeFileSync(join('data', f), snapshot[f]);
  rmSync(DRAFT, { recursive: true, force: true });
  if (draftBackup) { cpSync(draftBackup, DRAFT, { recursive: true }); rmSync(draftBackup, { recursive: true, force: true }); }
  for (const v of existsSync(HISTORY) ? readdirSync(HISTORY) : []) if (!historyBefore.has(v)) rmSync(join(HISTORY, v), { recursive: true, force: true });
  for (const d of [photoDir, join('assets/images/_opt/packages', SLUG), join('tours', SLUG), join('en/tours', SLUG)]) rmSync(d, { recursive: true, force: true });
  mkdirSync('assets/images/_opt', { recursive: true });
  execSync('node scripts/publish.mjs', { stdio: 'ignore' });
  const m = JSON.parse(readFileSync('assets/images/_opt/manifest.json', 'utf8'));
  console.log(`Reposto: data/*.json, rascunho, fotos e páginas de teste (manifesto sem fotos de teste: ${!Object.keys(m).some(k => k.includes(SLUG))}).`);
}

const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} testes passaram`);
process.exit(ok === results.length ? 0 : 1);
