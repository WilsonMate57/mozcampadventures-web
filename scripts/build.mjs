/**
 * MOZ CAMP ADVENTURES — build.mjs
 * =====================================================
 * Gera o site público (PT + EN) em HTML estático a partir de:
 *   data/tours.json, data/accommodations.json, data/en.json,
 *   data/booking-rules.json, scripts/i18n.mjs,
 *   assets/images/_opt/manifest.json (scripts/optimize-images.mjs)
 *
 * Uso:  node scripts/build.mjs
 * Saída: index.html, pages/*.html, tours/<slug>/, alojamentos/<slug>/,
 *        en/…, 404.html, sitemap.xml, robots.txt
 * Sem dependências externas. Ver docs/DEPLOYMENT.md.
 * =====================================================
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { T, CATEGORIES, LOCATIONS } from './i18n.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://mozcampadventures.co.mz';
const WA = '258844406543';
const GTM = 'GTM-MQ73VSS3';
const LANGS = ['pt', 'en'];

/* ── Dados ───────────────────────────────────────────────── */
const readJson = f => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const TOURS = readJson('data/tours.json');
const STAYS = readJson('data/accommodations.json');
const EN = readJson('data/en.json');
const RULES = readJson('data/booking-rules.json');
/* Transfers privados por omissão dos beach tours (mesma fonte que a API) */
const DEFAULT_TRANSFER = Object.fromEntries(['pt', 'en'].map(l => [l, RULES._defaultTransfers.map(o => ({ id: o.id, price: o.price, ...o[l] }))]));
const MANIFEST = existsSync(join(ROOT, 'assets/images/_opt/manifest.json')) ? readJson('assets/images/_opt/manifest.json') : {};

const fixPath = s => typeof s === 'string' ? s.replace(/^\.\.\//, '/') : s;

function mergeById(base = [], tr = []) {
  const map = Object.fromEntries((tr || []).map(e => [e.id, e]));
  return base.map(e => map[e.id] ? { ...e, ...map[e.id], price: e.price, capacity: e.capacity, perPerson: e.perPerson, currency: e.currency } : e);
}

function localise(item, lang, kind) {
  let p = { ...item };
  if (lang === 'en') {
    const tr = EN[item.id] || EN[item.slug];
    if (tr) {
      p = { ...p, ...tr };
      if (item.extras) p.extras = mergeById(item.extras, tr.extras);
      if (item.privateBoatOptions) p.privateBoatOptions = mergeById(item.privateBoatOptions, tr.privateBoatOptions);
      if (item.privateTransferOptions) p.privateTransferOptions = mergeById(item.privateTransferOptions, tr.privateTransferOptions);
    }
  }
  p.slug = item.slug || item.id;
  p.kind = kind;
  p.rules = RULES[p.slug] || {};
  p.image = fixPath(p.image);
  p.gallery = (item.gallery && item.gallery.length ? item.gallery : item.images && item.images.length ? item.images : [item.image]).map(fixPath);
  if (kind === 'stay') p.category = 'island-accommodation';
  return p;
}

const DATA = Object.fromEntries(LANGS.map(l => [l, {
  tours: TOURS.map(p => localise(p, l, 'tour')),
  stays: STAYS.map(p => localise(p, l, 'stay'))
}]));
DATA.pt.all = [...DATA.pt.tours, ...DATA.pt.stays];
DATA.en.all = [...DATA.en.tours, ...DATA.en.stays];

/* ── Helpers ─────────────────────────────────────────────── */
/* Meta description: no máximo 160 caracteres, cortada numa palavra */
const clip = (s, n = 160) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const c = s.slice(0, n - 1); return c.slice(0, c.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…'; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' MZN';
const active = list => list.filter(p => !p.disabled);
const byCat = (lang, c) => active(c === 'island-accommodation' ? DATA[lang].stays : DATA[lang].tours.filter(p => p.category === c));
const find = (lang, id) => DATA[lang].all.find(p => p.slug === id);
const json = o => JSON.stringify(o).replace(/</g, '\\u003c');

const hashes = {};
function asset(path) {
  if (!hashes[path]) hashes[path] = createHash('md5').update(readFileSync(join(ROOT, path))).digest('hex').slice(0, 8);
  return `${path}?v=${hashes[path]}`;
}

/* Imagem responsiva a partir do manifesto (_opt/) */
function optSrc(src, w) {
  const m = MANIFEST[src];
  if (!m) return src;
  const v = m.v.filter(x => x <= w).pop() || m.v[0];
  return '/assets/images/_opt/' + src.replace('/assets/images/', '').replace(/\.[a-z]+$/i, '') + `-${v}.webp`;
}
function img(src, { alt = '', sizes = '100vw', cls = '', eager = false, max = 1600 } = {}) {
  const m = MANIFEST[src];
  const a = [`alt="${esc(alt)}"`];
  if (cls) a.push(`class="${cls}"`);
  if (m) {
    const variants = m.v.filter(v => v <= max);
    const top = variants[variants.length - 1] || m.v[0];
    const base = '/assets/images/_opt/' + src.replace('/assets/images/', '').replace(/\.[a-z]+$/i, '');
    a.unshift(`src="${base}-${top}.webp"`, `srcset="${variants.map(v => `${base}-${v}.webp ${v}w`).join(', ')}"`, `sizes="${sizes}"`);
    const w = Math.min(m.w, top);
    a.push(`width="${w}" height="${Math.round(m.h * w / m.w)}"`);
  } else {
    a.unshift(`src="${esc(src)}"`);
  }
  a.push(eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"');
  return `<img ${a.join(' ')}>`;
}

/* ── Rotas ───────────────────────────────────────────────── */
const R = {
  home: l => l === 'pt' ? '/' : '/en/',
  tours: l => l === 'pt' ? '/pages/tours.html' : '/en/pages/tours.html',
  stays: l => l === 'pt' ? '/pages/accommodations.html' : '/en/pages/accommodations.html',
  contact: l => l === 'pt' ? '/pages/contact.html' : '/en/pages/contact.html',
  privacy: l => l === 'pt' ? '/pages/privacidade.html' : '/en/pages/privacy.html',
  terms: l => l === 'pt' ? '/pages/termos.html' : '/en/pages/terms.html',
  account: l => l === 'pt' ? '/conta/' : '/en/account/',
  item: (p, l) => p.kind === 'stay'
    ? (l === 'pt' ? `/alojamentos/${p.slug}/` : `/en/accommodations/${p.slug}/`)
    : (l === 'pt' ? `/tours/${p.slug}/` : `/en/tours/${p.slug}/`),
  cat: (c, l) => c === 'island-accommodation' ? R.stays(l) : `${R.tours(l)}?cat=${c}`
};
const fileFor = url => url.endsWith('/') ? url + 'index.html' : url;
const other = l => l === 'pt' ? 'en' : 'pt';
const wa = text => `https://wa.me/${WA}` + (text ? `?text=${encodeURIComponent(text)}` : '');

/* ── Componentes ─────────────────────────────────────────── */
function card(p, lang) {
  const t = T[lang], c = CATEGORIES[p.category];
  return `<a class="xcard" href="${R.item(p, lang)}" data-card data-cat="${p.category}" data-price="${p.price_from}" data-search="${esc([p.name, p.subtitle, p.location, p.destinations, p.description, (p.highlights || []).join(' '), c?.[lang]].join(' ').toLowerCase())}">
  <div class="xcard__media">${img(p.image, { alt: p.name, sizes: '(min-width:1024px) 380px, (min-width:640px) 46vw, 90vw', max: 960 })}${c ? `<span class="chip chip--white"><i class="bx ${c.icon}"></i>${esc(c[lang])}</span>` : ''}</div>
  <div class="xcard__body">
    <div class="xcard__meta"><span><i class="bx bxs-map"></i>${esc(p.location)}</span>${p.duration ? `<span><i class="bx bx-time-five"></i>${esc(p.duration)}</span>` : ''}</div>
    <h3>${esc(p.name)}</h3>
    <p class="xcard__desc">${esc(p.description)}</p>
    <div class="xcard__foot"><div class="price"><small>${t.price.from}</small><strong>${fmt(p.price_from)}</strong> <span>${esc(p.priceLabel || '')}</span></div><span class="xcard__go" aria-hidden="true"><i class="bx bx-right-arrow-alt"></i></span></div>
  </div>
</a>`;
}

function stayCard(p, lang) {
  const t = T[lang];
  return `<a class="stay" href="${R.item(p, lang)}" data-card data-loc="${p.locationCategory || ''}" data-price="${p.price_from}">
  <div class="stay__media">${img(p.image, { alt: p.name, sizes: '(min-width:1024px) 380px, (min-width:640px) 46vw, 90vw', max: 960 })}${p.badge ? `<span class="chip chip--white">${esc(p.badge)}</span>` : ''}</div>
  <div class="stay__body">
    <div class="xcard__meta"><span><i class="bx bxs-map"></i>${esc(p.location)}</span><span><i class="bx bx-moon"></i>${esc(p.duration)}</span></div>
    <h3>${esc(p.name)}</h3>
    <ul>${(p.features || []).slice(0, 3).map(f => `<li class="chip">${esc(f)}</li>`).join('')}</ul>
    <div class="xcard__foot"><div class="price"><small>${t.price.from}</small><strong>${fmt(p.price_from)}</strong> <span>${esc(p.priceLabel || '')}</span></div><span class="xcard__go" aria-hidden="true"><i class="bx bx-right-arrow-alt"></i></span></div>
  </div>
</a>`;
}

const CAT_ORDER = ['island-tours', 'sunset-cruise', 'beach-tours', 'safaris', 'ocean-activities', 'island-accommodation', 'city-tour', 'transfers'];

function header(lang, alt, { cta } = {}) {
  const t = T[lang].nav;
  const mega = CAT_ORDER.map(c => `<a href="${R.cat(c, lang)}">${img(CATEGORIES[c].img, { alt: '', sizes: '56px', max: 480 })}<span><strong>${esc(CATEGORIES[c][lang])}</strong><small>${t.options(byCat(lang, c).length)}</small></span></a>`).join('');
  const mobile = CAT_ORDER.map(c => `<a href="${R.cat(c, lang)}">${esc(CATEGORIES[c][lang])} <small>${byCat(lang, c).length}</small></a>`).join('');
  const langs = l => `<a href="${l === lang ? '#' : alt}" ${l === lang ? 'aria-current="true"' : 'data-lang-link'} lang="${l}" hreflang="${l}">${l.toUpperCase()}</a>`;
  return `<header class="site-header">
  <div class="site-header__bar">
    <a class="brand" href="${R.home(lang)}" aria-label="Moz Camp Adventures — ${t.home}">
      <img src="/assets/images/logo/logo_moz_camp_adventures.webp" alt="" width="48" height="48">
      <span>Moz Camp<small>Adventures</small></span>
    </a>
    <nav class="main-nav" aria-label="${t.experiences}">
      <ul>
        <li class="has-mega">
          <button type="button" aria-expanded="false" aria-controls="mega-exp">${t.experiences} <i class="bx bx-chevron-down"></i></button>
          <div class="mega" id="mega-exp">${mega}<a class="mega-all text-link" href="${R.tours(lang)}">${t.all} <i class="bx bx-right-arrow-alt"></i></a></div>
        </li>
        <li><a href="${R.stays(lang)}">${t.accommodation}</a></li>
        <li><a href="${R.home(lang)}#destinos">${t.destinations}</a></li>
        <li><a href="${R.home(lang)}#como-reservar">${t.how}</a></li>
        <li><a href="${R.contact(lang)}">${t.contact}</a></li>
      </ul>
    </nav>
    <div class="header-actions">
      <a class="icon-btn search-btn" href="${R.tours(lang)}#procurar" aria-label="${t.search}"><i class="bx bx-search"></i></a>
      <a class="icon-btn account-btn" href="${R.account(lang)}" aria-label="${t.account}" title="${t.account}" data-account-link><i class="bx bx-user"></i></a>
      <div class="lang-switch" aria-label="${t.lang}">${langs('pt')}${langs('en')}</div>
      <a class="nav-phone" href="tel:+258844406543"><span class="nav-phone__icon" aria-hidden="true"><i class="bx bxs-phone"></i></span><span><small>${t.phone}</small>+258 84 440 6543</span></a>
${cta ? `      <a class="btn-x btn-x--primary header-cta" href="${cta}">${T[lang].bk.title}</a>
` : ''}
      <button class="icon-btn menu-toggle" type="button" aria-label="${t.menuOpen}" aria-controls="mobile-menu" aria-expanded="false" data-menu-open><i class="bx bx-menu"></i></button>
    </div>
  </div>
</header>
<div class="mobile-menu" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" data-open="false">
  <div class="mobile-menu__top">
    <a class="brand" href="${R.home(lang)}"><img src="/assets/images/logo/logo_moz_camp_adventures.webp" alt="" width="44" height="44"><span>Moz Camp<small>Adventures</small></span></a>
    <button class="icon-btn" type="button" aria-label="${t.menuClose}" data-menu-close><i class="bx bx-x"></i></button>
  </div>
  <nav aria-label="Menu">${mobile}<a href="${R.home(lang)}#about">${t.about}</a><a href="${R.contact(lang)}">${t.contact}</a><a href="${R.account(lang)}">${t.account} <i class="bx bx-user"></i></a></nav>
  <div class="mobile-menu__foot">
    <a class="btn-x btn-x--wa btn-x--block" href="${wa()}" target="_blank" rel="noopener"><i class="bx bxl-whatsapp"></i> +258 84 440 6543</a>
    <div class="lang-switch lang-switch--dark" aria-label="${t.lang}">${langs('pt')}${langs('en')}</div>
  </div>
</div>`;
}

function footer(lang) {
  const t = T[lang], f = t.footer;
  return `<footer class="site-footer">
  <div class="container-x">
    <div class="footer-grid">
      <div class="footer-brand">
        <img src="/assets/images/logo/logo_moz_camp_adventures.webp" alt="Moz Camp Adventures" width="72" height="72" loading="lazy">
        <p>${f.blurb}</p>
        <div class="social">
          <a href="https://www.facebook.com/mozcampadventures" target="_blank" rel="noopener" aria-label="Facebook"><i class="bx bxl-facebook"></i></a>
          <a href="https://www.instagram.com/moz__camp_adventures_official/" target="_blank" rel="noopener" aria-label="Instagram"><i class="bx bxl-instagram"></i></a>
          <a href="${wa()}" target="_blank" rel="noopener" aria-label="WhatsApp"><i class="bx bxl-whatsapp"></i></a>
        </div>
      </div>
      <div><h2>${t.nav.experiences}</h2><ul>${CAT_ORDER.map(c => `<li><a href="${R.cat(c, lang)}">${esc(CATEGORIES[c][lang])}</a></li>`).join('')}</ul></div>
      <div><h2>${f.company}</h2><ul>
        <li><a href="${R.home(lang)}#about">${t.nav.about}</a></li>
        <li><a href="${R.home(lang)}#como-reservar">${t.nav.how}</a></li>
        <li><a href="${R.contact(lang)}">${t.nav.contact}</a></li>
        <li><a href="${R.privacy(lang)}">${f.privacy}</a></li>
        <li><a href="${R.terms(lang)}">${f.terms}</a></li>
      </ul></div>
      <div><h2>${f.contact}</h2><ul class="footer-contact">
        <li><i class="bx bxs-map"></i><span>${t.contact.address}</span></li>
        <li><i class="bx bxs-phone"></i><a href="tel:+258844406543">+258 84 440 6543</a></li>
        <li><i class="bx bxs-envelope"></i><a href="mailto:info@mozcampadventures.co.mz">info@mozcampadventures.co.mz</a></li>
        <li><i class="bx bxs-calendar-check"></i><a href="mailto:booking@mozcampadventures.co.mz">booking@mozcampadventures.co.mz</a></li>
      </ul>
      <div class="footer-pay"><img src="/assets/images/payment-methods/mpesa.webp" alt="M-Pesa" width="56" height="34" loading="lazy"><img src="/assets/images/payment-methods/emola.webp" alt="e-Mola" width="56" height="34" loading="lazy"><span><i class="bx bxs-bank"></i> ${t.home.bank}</span></div></div>
    </div>
    <div class="footer-bottom">
      <span>© <span data-year>${new Date().getFullYear()}</span> Mozambique Camp Adventures. ${f.rights}</span>
      <nav aria-label="Legal"><a href="${R.privacy(lang)}">${f.privacy}</a><a href="${R.terms(lang)}">${f.terms}</a><a href="#" data-cookie-manage>${f.cookies}</a><span>${f.credit} <a href="https://wa.me/258878454031" target="_blank" rel="noopener">Wilson Creative Studio</a></span></nav>
    </div>
  </div>
</footer>`;
}

function cookieBanner(lang) {
  const c = T[lang].cookie;
  return `<div class="cookie-banner" id="cookie-banner" role="region" aria-label="${c.title}" style="display:none">
  <div><strong>${c.title}</strong><p>${c.text}</p></div>
  <div class="cookie-banner__actions">
    <button type="button" class="btn-x btn-x--ghost btn-x--sm" id="cb-essentials">${c.essentials}</button>
    <button type="button" class="btn-x btn-x--ghost btn-x--sm" id="cb-customize">${c.customize}</button>
    <button type="button" class="btn-x btn-x--teal btn-x--sm" id="cb-accept-all">${c.accept}</button>
  </div>
</div>
<dialog class="dialog" id="cookieModal" aria-labelledby="cookieModalLabel">
  <div class="dialog__head"><h2 id="cookieModalLabel">${c.modalTitle}</h2><button type="button" class="icon-btn" data-cookie-close aria-label="${T[lang].rev.close}"><i class="bx bx-x"></i></button></div>
  <div class="dialog__body">
    <div class="cookie-opt"><div><strong>${c.essTitle}</strong><p>${c.essText}</p></div><input type="checkbox" checked disabled aria-label="${c.essTitle}"></div>
    <div class="cookie-opt"><div><strong>${c.anaTitle}</strong><p>${c.anaText}</p></div><input type="checkbox" id="toggle-analytics" aria-label="${c.anaTitle}"></div>
  </div>
  <div class="dialog__foot"><button type="button" class="btn-x btn-x--ghost btn-x--sm" id="cm-save">${c.save}</button><button type="button" class="btn-x btn-x--teal btn-x--sm" id="cm-accept-all">${c.accept}</button></div>
</dialog>`;
}

function dock(lang, bookHref) {
  const t = T[lang].nav;
  return `<nav class="mobile-dock" aria-label="${t.explore}">
  <a href="${R.tours(lang)}"><i class="bx bx-compass"></i> ${t.explore}</a>
  <a class="is-wa" href="${wa()}" target="_blank" rel="noopener"><i class="bx bxl-whatsapp"></i> WhatsApp</a>
  <a class="is-primary" href="${bookHref || R.tours(lang)}"><i class="bx bxs-calendar-check"></i> ${t.bookShort}</a>
</nav>`;
}

/* ── Layout ──────────────────────────────────────────────── */
function page({ lang, path, alt, title, desc, main, bodyClass = '', noindex = false, ogImage, jsonld = [], extraHead = '', scripts = '', dockHtml, headerOpts = {}, preload }) {
  const t = T[lang];
  desc = clip(desc);
  const altLang = other(lang);
  const og = ogImage ? SITE + optSrc(ogImage, 1600) : SITE + optSrc('/assets/images/hero/island-hopping-maputo-bay.webp', 1600);
  const ptPath = lang === 'pt' ? path : alt, enPath = lang === 'en' ? path : alt;
  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow'}">
  <link rel="canonical" href="${SITE}${path}">
${alt ? `  <link rel="alternate" hreflang="pt" href="${SITE}${ptPath}">
  <link rel="alternate" hreflang="en" href="${SITE}${enPath}">
  <link rel="alternate" hreflang="x-default" href="${SITE}${ptPath}">\n` : ''}  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Moz Camp Adventures">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${SITE}${path}">
  <meta property="og:image" content="${og}">
  <meta property="og:locale" content="${lang === 'pt' ? 'pt_PT' : 'en_GB'}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#00c6c1">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/images/logo/favicon-32x32.png">
  <link rel="apple-touch-icon" href="/assets/images/logo/apple-touch-icon.png">
  <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/inter/inter-latin-wght-normal.woff2" crossorigin>
  <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/dancing-script/dancing-script-latin-700.woff2" crossorigin>
${preload ? `  <link rel="preload" as="image" href="${preload}" fetchpriority="high">\n` : ''}  <link rel="stylesheet" href="${asset('/assets/vendor/boxicons/boxicons.css')}">
  <link rel="stylesheet" href="${asset('/assets/css/tokens.css')}">
  <link rel="stylesheet" href="${asset('/assets/css/site.css')}">
${extraHead}${jsonld.map(j => `  <script type="application/ld+json">${json(j)}</script>\n`).join('')}  <script src="${asset('/assets/js/consent.js')}"></script>
  <script src="${asset('/assets/js/gtm.js')}" data-gtm="${GTM}"></script>
</head>
<body class="${bodyClass}">
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<a class="skip-link" href="#main">${t.skip}</a>
${header(lang, alt || R.home(altLang), headerOpts)}
${main}
${footer(lang)}
${dockHtml === undefined ? dock(lang) : dockHtml}
${cookieBanner(lang)}
<script src="${asset('/assets/js/analytics.js')}"></script>
<script src="${asset('/assets/js/site.js')}" defer></script>
${scripts}</body>
</html>
`;
}

function pageHero({ lang, eyebrow, h1, lead, image, crumbs }) {
  return `<section class="page-hero">
  <div class="page-hero__media">${img(image, { alt: '', eager: true, sizes: '100vw' })}</div>
  <div class="container-x page-hero__content">
    <nav class="crumbs crumbs--light" aria-label="Breadcrumb"><a href="${R.home(lang)}">${T[lang].nav.home}</a><span aria-hidden="true">/</span><span>${esc(crumbs)}</span></nav>
    <span class="eyebrow eyebrow--light">${eyebrow}</span>
    <h1>${h1}</h1>
    <p>${lead}</p>
  </div>
</section>`;
}

const ORG = {
  '@context': 'https://schema.org', '@type': 'TravelAgency', '@id': SITE + '/#org',
  name: 'Moz Camp Adventures', legalName: 'Mozambique Camp Adventures', url: SITE + '/',
  logo: SITE + '/assets/images/logo/logo_moz_camp_adventures.png', image: SITE + optSrc('/assets/images/hero/island-hopping-maputo-bay.webp', 1600),
  telephone: '+258844406543', email: 'info@mozcampadventures.co.mz',
  address: { '@type': 'PostalAddress', streetAddress: 'Marina, Escola Náutica', addressLocality: 'Maputo', addressCountry: 'MZ' },
  sameAs: ['https://www.facebook.com/mozcampadventures', 'https://www.instagram.com/moz__camp_adventures_official/']
};
const crumbsLd = items => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + url })) });

/* ── Páginas ─────────────────────────────────────────────── */
function home(lang) {
  const t = T[lang], h = t.home;
  const catCard = c => {
    const items = byCat(lang, c), min = Math.min(...items.map(p => p.price_from));
    return `<a class="cat-card" href="${R.cat(c, lang)}"><div class="cat-card__media">${img(CATEGORIES[c].img, { alt: '', sizes: '(min-width:1024px) 280px, (min-width:640px) 46vw, 90vw', max: 960 })}<span class="cat-card__icon" aria-hidden="true"><i class="bx ${CATEGORIES[c].icon}"></i></span></div><div class="cat-card__foot"><div><h3>${esc(CATEGORIES[c][lang])}</h3><small>${t.nav.options(items.length)} · ${t.price.from.toLowerCase()} ${fmt(min)}</small></div><span class="cat-card__more" aria-hidden="true">${t.nav.more} <i class="bx bx-right-arrow-alt"></i></span></div></a>`;
  };
  const featured = ['island-hopping-experience', 'maputo-bay-sunset-cruise', 'santa-maria-snorkeling', 'safari-parque-maputo', 'ponta-douro-day-trip', 'whale-watching'].map(id => find(lang, id)).filter(p => p && !p.disabled);
  const stays = ['machangulo-beach-lodge', 'mamas-lodge', 'villa-martins'].map(id => find(lang, id)).filter(Boolean);
  const dests = [
    ['inhaca-cultural', lang === 'pt' ? 'Ilha da Inhaca' : 'Inhaca Island', R.cat('island-tours', lang)],
    ['portuguese-island-bbq', lang === 'pt' ? 'Ilha dos Portugueses' : 'Portuguese Island', null],
    ['machangulo-beach-lodge', 'Machangulo', R.stays(lang) + '?loc=machangulo'],
    ['ponta-douro-day-trip', "Ponta D'Ouro", null],
    ['safari-parque-maputo', lang === 'pt' ? 'Reserva Especial de Maputo' : 'Maputo Special Reserve', null]
  ].map(([id, name, href]) => { const p = find(lang, id); return { p, name, href: href || R.item(p, lang) }; });
  /* Slider do topo (5 slides do site original). Só o 1.º título é <h1>; os outros slides ficam inertes até serem mostrados (site.js) */
  const slides = t.hero.slides, n = slides.length;
  const hero = `/assets/images/hero/${slides[0][0]}.webp`;

  const main = `<main id="main">
<section class="hero hero--slider" aria-roledescription="carousel" aria-label="${t.hero.label}" data-hero>
  <div class="hero__slides" aria-live="off" data-hero-track>
${slides.map(([file, place, title, sub, cat, alt], i) => `    <div class="hero__slide${i ? '' : ' is-active'}" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${n}" data-slide${i ? ' aria-hidden="true" inert' : ''}>
      <div class="hero__media">${img(`/assets/images/hero/${file}.webp`, { alt, eager: i === 0, sizes: '100vw' })}</div>
      <div class="container-x hero__content">
        <span class="chip chip--glass"><i class="bx bxs-map"></i> ${esc(place)}</span>
        ${i ? `<h2 class="hero__title">${esc(title)}</h2>` : `<h1 class="hero__title">${esc(title)}</h1>`}
        <p>${esc(sub)}</p>
        <a class="btn-x btn-x--primary hero__cta" href="${R.cat(cat, lang)}" data-slide-cta="${cat}">${t.hero.cta} <i class="bx bx-right-arrow-alt"></i></a>
      </div>
    </div>`).join('\n')}
  </div>
  <div class="hero__controls" data-hero-controls>
    <button type="button" class="hero__btn" data-hero-prev aria-label="${t.hero.prev}"><i class="bx bx-chevron-left"></i></button>
    <div class="hero__dots">${slides.map((s, i) => `<button type="button" class="hero__dot" data-hero-dot="${i}" aria-label="${t.hero.goTo(i + 1)}"${i ? '' : ' aria-current="true"'}></button>`).join('')}</div>
    <button type="button" class="hero__btn" data-hero-pause aria-label="${t.hero.pause}" data-label-pause="${t.hero.pause}" data-label-play="${t.hero.play}"><i class="bx bx-pause"></i></button>
    <button type="button" class="hero__btn" data-hero-next aria-label="${t.hero.next}"><i class="bx bx-chevron-right"></i></button>
  </div>
</section>
<div class="container-x finder-wrap">
  <form class="finder" action="${R.tours(lang)}" method="get" aria-label="${t.nav.search}" data-finder>
    <div class="finder__field"><label for="f-cat"><i class="bx bx-compass"></i> ${t.hero.fExp}</label>
      <select id="f-cat" name="cat"><option value="">${t.hero.fAll}</option>${CAT_ORDER.filter(c => c !== 'island-accommodation').map(c => `<option value="${c}">${esc(CATEGORIES[c][lang])}</option>`).join('')}<option value="island-accommodation">${esc(CATEGORIES['island-accommodation'][lang])}</option></select></div>
    <div class="finder__field"><label for="f-date"><i class="bx bx-calendar"></i> ${t.hero.fDate}</label><input id="f-date" name="date" type="date" data-min-today></div>
    <div class="finder__field"><label for="f-pax"><i class="bx bx-group"></i> ${t.hero.fPax}</label>
      <select id="f-pax" name="pax">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option${n === 2 ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
    <button class="btn-x btn-x--primary" type="submit" data-hero-cta><i class="bx bx-search"></i> ${t.hero.fGo}</button>
  </form>
  <div class="trust">${t.trust.map(([i, a, b]) => `<div class="trust__item"><i class="bx ${i}"></i><div><strong>${a}</strong>${b}</div></div>`).join('')}</div>
</div>

<section class="section section--teal" aria-labelledby="cat-title">
  <div class="container-x">
    <div class="section-head"><div><span class="eyebrow">${h.catEyebrow}</span><h2 id="cat-title">${h.catTitle}</h2></div><p>${h.catLead}</p></div>
    <div class="cat-grid">${CAT_ORDER.map(catCard).join('')}</div>
  </div>
</section>

<section class="section" aria-labelledby="feat-title">
  <div class="container-x">
    <div class="section-head"><div><span class="eyebrow">${h.featEyebrow}</span><h2 id="feat-title">${h.featTitle}</h2></div><a class="text-link" href="${R.tours(lang)}">${t.nav.all} <i class="bx bx-right-arrow-alt"></i></a></div>
    <div class="scroller">${featured.map(p => card(p, lang)).join('')}</div>
  </div>
</section>

<section class="section section--sand" id="about" aria-labelledby="about-title">
  <div class="container-x about">
    <div class="about__media">${img('/assets/images/about/about-1.webp', { alt: h.aboutAlt, sizes: '(min-width:960px) 45vw, 100vw', max: 960 })}</div>
    <div><span class="eyebrow">${h.aboutEyebrow}</span><h2 id="about-title" class="h2-lg">${h.aboutTitle}</h2><div class="prose">${h.aboutText.map(x => `<p>${x}</p>`).join('')}</div>
      <p class="about__cta"><a class="btn-x btn-x--teal" href="${R.tours(lang)}">${t.nav.all}</a></p></div>
  </div>
</section>

<section class="section section--teal" aria-labelledby="stay-title">
  <div class="container-x">
    <div class="section-head"><div><span class="eyebrow">${h.stayEyebrow}</span><h2 id="stay-title">${h.stayTitle}</h2></div><a class="text-link" href="${R.stays(lang)}">${h.stayAll(active(DATA[lang].stays).length)} <i class="bx bx-right-arrow-alt"></i></a></div>
    <div class="cards">${stays.map(p => stayCard(p, lang)).join('')}</div>
  </div>
</section>

<section class="section" id="destinos" aria-labelledby="dest-title">
  <div class="container-x dest">
    <div class="dest__visual">${dests.map((d, i) => img(d.p.image, { alt: d.p.name, cls: i === 0 ? 'is-active' : '', sizes: '(min-width:960px) 50vw, 100vw', max: 960 })).join('')}<span class="chip chip--white dest__caption" data-dest-caption><i class="bx bx-camera"></i> ${esc(dests[0].p.name)}</span></div>
    <div><span class="eyebrow">${h.destEyebrow}</span><h2 id="dest-title" class="h2-lg">${h.destTitle}</h2>
      <ul class="dest__list" data-dest>${dests.map((d, i) => `<li class="dest__item" data-open="${i === 0}" data-caption="${esc(d.p.name)}"><button type="button" aria-expanded="${i === 0}" aria-controls="dest-${i}"><span class="dest__num">0${i + 1}</span><span class="dest__name">${esc(d.name)}</span><i class="bx bx-plus"></i></button><div class="dest__panel" id="dest-${i}"><div><p>${esc(d.p.description)}</p><a class="text-link" href="${d.href}">${h.destExplore} ${esc(d.name)} <i class="bx bx-right-arrow-alt"></i></a></div></div></li>`).join('')}</ul></div>
  </div>
</section>

<section class="section section--teal" id="como-reservar" aria-labelledby="how-title">
  <div class="container-x">
    <div class="section-head"><div><span class="eyebrow">${h.howEyebrow}</span><h2 id="how-title">${h.howTitle}</h2></div><p>${h.howLead}</p></div>
    <div class="steps">${h.steps.map(([a, b]) => `<div class="step"><h3>${a}</h3><p>${b}</p></div>`).join('')}</div>
    <div class="pay-row"><span class="pay-row__label">${h.payTitle}</span><span class="pay-pill"><img src="/assets/images/payment-methods/mpesa.webp" alt="" width="36" height="22" loading="lazy"> M-Pesa</span><span class="pay-pill"><img src="/assets/images/payment-methods/emola.webp" alt="" width="36" height="22" loading="lazy"> e-Mola</span><span class="pay-pill"><i class="bx bxs-bank"></i> ${h.bank}</span></div>
  </div>
</section>

<section class="section" id="feedback" aria-labelledby="rev-title" data-reviews-section hidden>
  <div class="container-x reviews">
    <div><span class="eyebrow">${h.revEyebrow}</span><h2 id="rev-title" class="h2-lg">${h.revTitle}</h2><p class="lead">${h.revLead}</p>
      <p class="reviews__actions"><button type="button" class="btn-x btn-x--ghost btn-x--sm" data-review-open><i class="bx bxs-edit"></i> ${h.revWrite}</button></p></div>
    <div class="review-list" data-reviews="home"></div>
  </div>
</section>

<section class="container-x" aria-labelledby="cta-title">
  <div class="cta-band">${img('/assets/images/hero/sunset-cruise-maputo-bay.webp', { alt: '', sizes: '100vw' })}
    <span class="eyebrow eyebrow--sun">${h.ctaEyebrow}</span><h2 id="cta-title">${h.ctaTitle}</h2><p>${h.ctaLead}</p>
    <div class="cta-band__actions"><a class="btn-x btn-x--wa" href="${wa(h.ctaWaMsg)}" target="_blank" rel="noopener"><i class="bx bxl-whatsapp"></i> ${h.ctaWa}</a><a class="btn-x btn-x--outline-light" href="mailto:quotes@mozcampadventures.co.mz"><i class="bx bx-envelope"></i> quotes@mozcampadventures.co.mz</a></div>
  </div>
</section>
</main>
${reviewDialog(lang, '')}`;

  return page({
    lang, path: R.home(lang), alt: R.home(other(lang)), title: h.title, desc: h.desc, main, bodyClass: 'home', ogImage: hero,
    preload: optSrc(hero, 960), jsonld: [ORG],
    extraHead: `  <link rel="stylesheet" href="${asset('/assets/css/promo.css')}">\n`,
    scripts: `<script src="${asset('/assets/js/reviews.js')}" defer></script>\n<script src="${asset('/assets/js/promo-popup.js')}"></script>\n`
  });
}

function reviewDialog(lang, packageId) {
  const r = T[lang].rev;
  return `<dialog class="dialog" id="review-dialog" aria-labelledby="review-title">
  <div class="dialog__head"><h2 id="review-title">${r.formTitle}</h2><button type="button" class="icon-btn" data-review-close aria-label="${r.close}"><i class="bx bx-x"></i></button></div>
  <form class="dialog__body" data-review-form data-package="${esc(packageId)}" novalidate>
    <div class="field"><label for="rv-name">${r.name}</label><input id="rv-name" name="name" maxlength="80" autocomplete="name" required></div>
    <div class="field"><label for="rv-role">${r.origin}</label><input id="rv-role" name="role" maxlength="80"></div>
    <fieldset class="field"><legend>${r.rating}</legend><div class="star-input">${[5, 4, 3, 2, 1].map(n => `<input type="radio" id="rv-s${n}" name="rating" value="${n}"><label for="rv-s${n}" title="${r.stars(n)}"><i class="bx bxs-star"></i><span class="visually-hidden">${r.stars(n)}</span></label>`).join('')}</div></fieldset>
    <div class="field"><label for="rv-text">${r.text}</label><textarea id="rv-text" name="text" rows="4" maxlength="1200" required></textarea></div>
    <div class="hp" aria-hidden="true"><label for="rv-hp">Não preencher</label><input id="rv-hp" name="mca_hp" tabindex="-1" autocomplete="off"></div>
    <p class="form-msg" data-review-msg role="status"></p>
    <button type="submit" class="btn-x btn-x--teal btn-x--block">${r.send}</button>
  </form>
</dialog>
<script type="application/json" id="review-t">${json({ none: r.none, loading: r.loading, fail: r.fail, send: r.send, sending: r.sending, ok: r.ok, err: r.err, errName: r.errName, errRating: r.errRating, errText: r.errText, locale: T[lang].locale, stars: [1, 2, 3, 4, 5].map(n => r.stars(n)), one: r.reviews(1), many: r.reviews(2).replace('2', '{n}') })}</script>`;
}

function catalog(lang) {
  const t = T[lang], c = t.catalog;
  const tours = active(DATA[lang].tours);
  const cats = CAT_ORDER.filter(k => k !== 'island-accommodation');
  const main = `<main id="main">
${pageHero({ lang, eyebrow: c.eyebrow, h1: c.h1, lead: c.lead, image: '/assets/images/hero/island-hopping-maputo-bay.webp', crumbs: c.eyebrow })}
<section class="section section--tight" aria-label="${c.h1}">
  <div class="container-x" data-catalog>
    <div class="toolbar" id="procurar">
      <div class="chips" role="group" aria-label="${t.nav.experiences}">
        <button type="button" class="filter-chip" aria-pressed="true" data-filter="">${c.all} <span>${tours.length}</span></button>
        ${cats.map(k => `<button type="button" class="filter-chip" aria-pressed="false" data-filter="${k}"><i class="bx ${CATEGORIES[k].icon}"></i>${esc(CATEGORIES[k][lang])} <span>${byCat(lang, k).length}</span></button>`).join('')}
        <a class="filter-chip" href="${R.stays(lang)}"><i class="bx bxs-home-heart"></i>${c.stays} <span>${active(DATA[lang].stays).length}</span></a>
      </div>
      <div class="toolbar__row">
        <div class="search-field"><i class="bx bx-search"></i><label class="visually-hidden" for="q">${c.search}</label><input id="q" type="search" placeholder="${c.search}" data-search autocomplete="off"></div>
        <div class="sort-field"><label for="sort">${c.sort}</label><select id="sort" data-sort><option value="">${c.sortRec}</option><option value="asc">${c.sortAsc}</option><option value="desc">${c.sortDesc}</option></select></div>
      </div>
      <p class="toolbar__count" data-count aria-live="polite" data-count-tpl='${json({ one: c.count(1), many: c.count(2).replace('2', '{n}') })}'>${c.count(tours.length)}</p>
    </div>
    <h2 class="visually-hidden">${lang === 'pt' ? 'Resultados' : 'Results'}</h2>
    <div class="cards" data-grid>${tours.map(p => card(p, lang)).join('')}</div>
    <div class="empty" data-empty hidden><i class="bx bx-search-alt"></i><p>${c.empty}</p><button type="button" class="btn-x btn-x--ghost btn-x--sm" data-reset>${c.reset}</button></div>
  </div>
</section>
</main>`;
  return page({ lang, path: R.tours(lang), alt: R.tours(other(lang)), title: c.title, desc: c.desc, main, bodyClass: 'catalog-page',
    jsonld: [crumbsLd([[t.nav.home, R.home(lang)], [c.eyebrow, R.tours(lang)]])] });
}

function staysPage(lang) {
  const t = T[lang], s = t.stays;
  const list = active(DATA[lang].stays);
  const main = `<main id="main">
${pageHero({ lang, eyebrow: s.eyebrow, h1: s.h1, lead: s.lead, image: '/assets/images/accommodation/mamas-lodge/mamas_lodge_3.webp', crumbs: s.eyebrow })}
<section class="section section--tight">
  <div class="container-x" data-catalog data-key="loc">
    <div class="toolbar">
      <div class="chips" role="group" aria-label="${s.h1}">
        <button type="button" class="filter-chip" aria-pressed="true" data-filter="">${s.all} <span>${list.length}</span></button>
        ${Object.entries(LOCATIONS).map(([k, v]) => `<button type="button" class="filter-chip" aria-pressed="false" data-filter="${k}"><i class="bx bxs-map"></i>${v[lang]} <span>${list.filter(p => p.locationCategory === k).length}</span></button>`).join('')}
      </div>
      <p class="toolbar__count" data-count aria-live="polite" data-count-tpl='${json({ one: s.count(1), many: s.count(2).replace('2', '{n}') })}'>${s.count(list.length)}</p>
    </div>
    <h2 class="visually-hidden">${lang === 'pt' ? 'Resultados' : 'Results'}</h2>
    <div class="cards" data-grid>${list.map(p => stayCard(p, lang)).join('')}</div>
  </div>
</section>
</main>`;
  return page({ lang, path: R.stays(lang), alt: R.stays(other(lang)), title: s.title, desc: s.desc, main, bodyClass: 'catalog-page',
    jsonld: [crumbsLd([[t.nav.home, R.home(lang)], [s.eyebrow, R.stays(lang)]])] });
}

function contactPage(lang) {
  const t = T[lang], c = t.contact;
  const item = (icon, label, value, href, ext) => `<${href ? `a href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}` : 'div'} class="info-item"><i class="bx ${icon}"></i><span><small>${label}</small><strong>${value}</strong></span>${href ? '<i class="bx bx-right-arrow-alt info-item__go"></i>' : ''}</${href ? 'a' : 'div'}>`;
  const main = `<main id="main">
${pageHero({ lang, eyebrow: c.eyebrow, h1: c.h1, lead: c.lead, image: '/assets/images/hero/sunset-cruise-maputo-bay.webp', crumbs: c.eyebrow })}
<section class="section section--tight">
  <div class="container-x contact">
    <div class="contact__info">
      ${item('bxl-whatsapp', 'WhatsApp', '+258 84 440 6543', wa(), true)}
      ${item('bxs-phone', c.phone, '+258 84 440 6543', 'tel:+258844406543')}
      ${item('bxs-envelope', c.email, 'info@mozcampadventures.co.mz', 'mailto:info@mozcampadventures.co.mz')}
      ${item('bxs-calendar-check', c.bookings, 'booking@mozcampadventures.co.mz', 'mailto:booking@mozcampadventures.co.mz')}
      ${item('bxs-file', c.quotes, 'quotes@mozcampadventures.co.mz', 'mailto:quotes@mozcampadventures.co.mz')}
      ${item('bxs-map', c.where, c.address)}
      <div class="hours"><h2><i class="bx bx-time-five"></i> ${c.hours}</h2>${c.hoursRows.map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('')}</div>
    </div>
    <div class="contact__form">
      <h2>${c.formTitle}</h2><p class="lead">${c.formLead}</p>
      <form novalidate data-contact data-wa="${WA}" data-mail="info@mozcampadventures.co.mz" data-lang="${lang}" data-t="${esc(json({ send: c.send, sending: c.sending, ok: c.ok, fail: c.fail, tooMany: c.tooMany }))}">
        <div class="field-row">
          <div class="field"><label for="cf-name">${c.name}</label><input id="cf-name" name="name" autocomplete="name" required><span class="field__error">${c.errName}</span></div>
          <div class="field"><label for="cf-email">${c.mail}</label><input id="cf-email" name="email" type="email" autocomplete="email" required><span class="field__error">${c.errMail}</span></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="cf-phone">${c.tel}</label><input id="cf-phone" name="phone" type="tel" autocomplete="tel"></div>
          <div class="field"><label for="cf-subject">${c.subject}</label><select id="cf-subject" name="subject" required><option value="">${c.choose}</option>${c.subjects.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select><span class="field__error">${c.errSubject}</span></div>
        </div>
        <div class="field"><label for="cf-message">${c.message}</label><textarea id="cf-message" name="message" rows="5" required></textarea><span class="field__error">${c.errMsg}</span></div>
        <div class="hp" aria-hidden="true"><label for="cf-hp">Não preencher</label><input id="cf-hp" name="mca_hp" tabindex="-1" autocomplete="off"></div>
        <div class="form-actions"><button type="submit" class="btn-x btn-x--teal" value="api" data-submit><i class="bx bxs-send"></i> <span>${c.send}</span></button><button type="submit" class="btn-x btn-x--ghost" value="wa"><i class="bx bxl-whatsapp"></i> ${c.sendWa}</button></div>
        <p class="form-msg" data-contact-msg role="status"></p>
        <p class="form-note"><i class="bx bxs-shield"></i> ${c.privacy}</p>
      </form>
    </div>
  </div>
  <div class="container-x"><div class="map"><iframe title="${c.map}" src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d238541.5734282!2d32.4747!3d-25.9662!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x1ee69c94a88cf7f9%3A0x46c42d98bebbf3c4!2sMaputo%2C%20Mo%C3%A7ambique!5e0!3m2!1spt!2smz!4v1710000000000" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div></div>
</section>
</main>`;
  return page({ lang, path: R.contact(lang), alt: R.contact(other(lang)), title: c.title, desc: c.desc, main, bodyClass: 'contact-page', jsonld: [ORG] });
}

/* Página de detalhe (tour ou alojamento) */
function detail(p, lang) {
  const t = T[lang], k = t.pkg, b = t.bk;
  const isStay = p.kind === 'stay';
  const c = CATEGORIES[p.category];
  const path = R.item(p, lang), alt = R.item(find(other(lang), p.slug), other(lang));
  const listUrl = isStay ? R.stays(lang) : R.cat(p.category, lang);
  const listName = isStay ? t.stays.eyebrow : c[lang];

  if (p.disabled) {
    const main = `<main id="main" class="container-x unavailable"><span class="eyebrow">${esc(p.name)}</span><h1>${k.unavailableTitle}</h1><p class="lead">${k.unavailableLead}</p><p><a class="btn-x btn-x--teal" href="${R.tours(lang)}">${k.unavailableCta}</a></p></main>`;
    return page({ lang, path, alt, title: `${p.name} | Moz Camp Adventures`, desc: p.description, main, noindex: true });
  }

  const rules = p.rules;
  const minPax = rules.minPeople || 0;
  const maxPax = rules.maxPeople || p.maxPeople || 0;
  const minNights = rules.minNights || 1;
  const facts = isStay ? [
    ['bxs-map', k.location, p.location],
    ['bx-moon', k.nights, k.nightsN(minNights)],
    maxPax ? ['bx-group', k.capacity, k.upTo(maxPax)] : null,
    ['bx-child', k.children, p.price_child ? `${p.priceChildLabel || k.children} · ${fmt(p.price_child)}` : k.noChild],
    ['bx-calendar-x', k.cancellation, p.cancelPolicy ? k.cancelFree(p.cancelPolicy) : k.cancelAsk, !p.cancelPolicy]
  ] : [
    ['bx-time-five', k.duration, p.duration],
    ['bxs-map', k.location, p.location],
    p.destinations ? ['bx-map-alt', k.destinations, p.destinations] : null,
    ['bx-group', minPax ? k.minimum : maxPax ? k.maximum : k.minimum, minPax ? k.people(minPax) : maxPax ? k.upTo(maxPax) : k.noMin],
    ['bx-child', k.children, p.price_child ? `${p.priceChildLabel || k.children} · ${fmt(p.price_child)}` : k.noChild],
    ['bx-calendar-x', k.cancellation, p.cancelPolicy ? k.cancelFree(p.cancelPolicy) : k.cancelAsk, !p.cancelPolicy]
  ];

  const sections = [['visao', k.overview], p.itinerary?.length && ['itinerario', k.itinerary], (p.includes?.length || p.excludes?.length) && ['inclui', k.included], p.menu?.length && ['menu', k.menu], p.importantInfo?.length && ['info', k.info], ['avaliacoes', k.reviews], ['reservar', k.book]].filter(Boolean);
  const g = p.gallery;
  const related = active(DATA[lang].all.filter(x => x !== p && x.category === p.category)).slice(0, 3);
  const transfers = p.category === 'beach-tours' ? (p.privateTransferOptions || DEFAULT_TRANSFER[lang]) : [];

  const bookingData = {
    id: p.slug, name: p.name, kind: p.kind, lang,
    price: p.price_from, child: p.price_child || 0, childLabel: p.priceChildLabel || '', unit: p.priceLabel || '',
    pricing: rules.pricing || (isStay ? 'per-person-night' : 'per-person'),
    minPeople: minPax, maxPeople: maxPax, minNights, nightRates: rules.nightRates || null,
    boats: (p.privateBoatOptions || []).map(o => ({ id: o.id, title: o.title, price: o.price, capacity: o.capacity || 0 })),
    boatRequired: !!p.boatSelectionRequired,
    extras: (p.extras || []).map(o => ({ id: o.id, title: o.title, price: o.price, perPerson: !!o.perPerson, currency: o.currency || 'MZN', unit: o.priceUnit || '' })),
    transfers: transfers.map(o => ({ id: o.id, title: o.title, price: o.price })),
    peopleLabel: p.bookingPeopleLabel || '',
    t: { ...Object.fromEntries(Object.entries(b).filter(([, v]) => typeof v === 'string')), errors: b.errors, minBlock: b.minBlock('{n}'), minNightsMsg: b.minNights('{n}'), maxReached: b.maxReached('{n}'), night1: b.nightsX(1), nightsN: b.nightsX(2).replace('2', '{n}'), locale: t.locale }
  };

  const fmtExtra = o => o.price ? (o.currency === 'USD' ? `$ ${o.price}` : `+${fmt(o.price)}`) + (o.priceUnit ? ` ${esc(o.priceUnit)}` : o.perPerson ? b.perPax : '') : b.included;
  let step = 1;
  const label = s => `<div class="bk-step__label"><b>${step++}</b>${s}</div>`;
  const stepper = (key, title, sub) => `<div class="pax"><div><strong>${title}</strong><small>${sub}</small></div><div class="stepper"><button type="button" data-step="${key}:-1" aria-label="${b.less}: ${title}"><i class="bx bx-minus"></i></button><output data-out="${key}" aria-live="polite">${key === 'adults' ? Math.max(1, minPax || 1) : 0}</output><button type="button" data-step="${key}:1" aria-label="${b.more}: ${title}"><i class="bx bx-plus"></i></button></div></div>`;
  const unitTxt = isStay && bookingData.pricing === 'per-person-night' ? `${fmt(p.price_from)} · ${esc(p.priceLabel || '')}` : `${fmt(p.price_from)} ${esc(p.priceLabel || '')}`;

  const booking = `<div class="booking">
  <div class="booking__head"><div class="price"><small>${t.price.from}</small><strong>${fmt(p.price_from)}</strong> <span>${esc(p.priceLabel || '')}</span></div><h2 id="bk-title" class="visually-hidden">${b.title}</h2></div>
  <form class="booking__body" novalidate data-booking>
    ${isStay
      ? `<div class="bk-step">${label(b.stayDates)}<div class="field-row"><div class="field"><label for="bk-in">${b.checkin}</label><input id="bk-in" type="date" required data-min-today><span class="field__error">${b.errDate}</span></div><div class="field"><label for="bk-out">${b.checkout}</label><input id="bk-out" type="date" required data-min-today><span class="field__error">${b.errCheckout}</span></div></div></div>`
      : `<div class="bk-step">${label(b.date)}<div class="field"><label for="bk-date">${b.dateLabel}</label><input id="bk-date" type="date" required data-min-today><span class="field__error">${b.errDate}</span></div></div>`}
    <div class="bk-step">${label(b.pax)}<div>${stepper('adults', esc(p.bookingPeopleLabel || b.adults), bookingData.pricing === 'per-group' || bookingData.pricing === 'per-unit-night' ? esc(p.priceLabel || '') : unitTxt)}${p.price_child && bookingData.pricing !== 'per-group' && bookingData.pricing !== 'per-unit-night' ? stepper('children', b.childrenL, `${esc(p.priceChildLabel || '')} · ${fmt(p.price_child)}`) : ''}</div></div>
    ${(bookingData.boats.length || bookingData.extras.length || transfers.length) ? `<div class="bk-step">${label(b.options)}
      ${bookingData.boats.length ? `<fieldset class="opts"><legend class="visually-hidden">${esc(p.boatSelectionLabel || b.options)}</legend>${p.boatSelectionRequired ? '' : `<label class="opt"><input type="radio" name="boat" value="" checked><span><strong>${b.shared}</strong><small>${b.sharedSub}</small></span></label>`}${(p.privateBoatOptions || []).map((o, i) => `<label class="opt"><input type="radio" name="boat" value="${esc(o.id)}"${p.boatSelectionRequired && i === 0 ? ' checked' : ''}><span><strong>${esc(o.title)}</strong><small>${esc(o.desc || '')}</small></span><em>${fmt(o.price)}</em></label>`).join('')}</fieldset>` : ''}
      ${transfers.length ? `<fieldset class="opts"><legend class="visually-hidden">Transfer</legend><label class="opt"><input type="radio" name="transfer" value="" checked><span><strong>${b.noTransfer}</strong><small>${b.noTransferSub}</small></span></label>${transfers.map(o => `<label class="opt"><input type="radio" name="transfer" value="${esc(o.id)}"><span><strong>${esc(o.title)}</strong><small>${esc(o.subtitle || '')}</small></span><em>+${fmt(o.price)}</em></label>`).join('')}</fieldset>` : ''}
      ${(p.extras || []).map(o => `<label class="opt"><input type="checkbox" name="extra" value="${esc(o.id)}"><span><strong>${esc(o.title)}</strong><small>${esc(o.desc || '')}</small></span><em>${fmtExtra(o)}</em></label>`).join('')}
    </div>` : ''}
    <div class="bk-step">${label(b.you)}
      <div class="field"><label for="bk-name">${b.name}</label><input id="bk-name" autocomplete="name" required><span class="field__error">${b.errName}</span></div>
      <div class="field-row"><div class="field"><label for="bk-phone">${b.phone}</label><input id="bk-phone" type="tel" autocomplete="tel" placeholder="+258 84 000 0000" required><span class="field__error">${b.errPhone}</span></div><div class="field"><label for="bk-email">${b.email}</label><input id="bk-email" type="email" autocomplete="email"></div></div>
    </div>
    <div class="summary" data-summary aria-live="polite"></div>
    <p class="form-error" data-booking-error role="alert" hidden></p>
    <div class="hp" aria-hidden="true"><label for="bk-hp">Não preencher</label><input id="bk-hp" name="mca_hp" tabindex="-1" autocomplete="off"></div>
    <button type="submit" class="btn-x btn-x--primary btn-x--block" data-submit><i class="bx bxs-calendar-check"></i> <span>${b.submit}</span></button>
    <p class="booking__note"><i class="bx bx-info-circle"></i><span>${b.note}</span></p>
  </form>
  <div class="booking__result" data-booking-result role="status" tabindex="-1" hidden></div>
</div>
<script type="application/json" id="booking-data">${json(bookingData)}</script>`;

  const main = `<main id="main" class="container-x pkg-top">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${R.home(lang)}">${t.nav.home}</a><span aria-hidden="true">/</span><a href="${listUrl}">${esc(listName)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(p.name)}</span></nav>
  <div class="pkg-title"><div>
    <span class="chip"><i class="bx ${c.icon}"></i>${esc(isStay ? (LOCATIONS[p.locationCategory]?.[lang] || c[lang]) : c[lang])}</span>${p.badge ? ` <span class="chip chip--sun">${esc(p.badge)}</span>` : ''}
    <h1>${esc(p.name)}</h1><p class="lead">${esc(p.subtitle || '')}</p>
    <div class="pkg-meta"><span class="chip"><i class="bx bxs-map"></i>${esc(p.location)}</span><span class="chip"><i class="bx ${isStay ? 'bx-moon' : 'bx-time-five'}"></i>${esc(p.duration)}</span><span class="chip chip--rating" data-rating hidden></span></div>
  </div></div>
  <div class="gallery">${g.slice(0, 5).map((src, i) => `<button type="button" class="${i === 0 ? 'gallery__main' : 'gallery__thumb'}" data-gal="${i}" aria-label="${k.photoN(i + 1, g.length)}">${img(src, { alt: `${p.name} — ${i + 1}`, eager: i === 0, sizes: i === 0 ? '(min-width:768px) 50vw, 100vw' : '25vw', max: i === 0 ? 1600 : 960 })}</button>`).join('')}${g.length > 1 ? `<button type="button" class="btn-x btn-x--light btn-x--sm gallery__all" data-gal="0"><i class="bx bx-grid-alt"></i> ${k.photos(g.length)}</button>` : ''}</div>
  <script type="application/json" id="gallery-data">${json(g.map(s => optSrc(s, 1600)))}</script>

  <div class="pkg-layout"><div>
    <nav class="anchor-nav" aria-label="${k.sections}"><ul>${sections.map(([id, l]) => `<li><a href="#${id}">${l}</a></li>`).join('')}</ul></nav>
    <section class="pkg-block" id="visao"><h2>${k.overview}</h2><div class="prose">${(p.detailText || [p.description]).map(x => `<p>${esc(x)}</p>`).join('')}</div>
      <div class="facts">${facts.filter(Boolean).map(([i, l, v, pend]) => `<div class="fact${pend ? ' is-pending' : ''}"><i class="bx ${i}"></i><div><small>${l}</small><strong>${esc(v)}</strong></div></div>`).join('')}</div>
      ${isStay && p.features?.length ? `<h3 class="h3-sub">${k.amenities}</h3><ul class="checks checks--2">${p.features.map(x => `<li><i class="bx bx-check"></i>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${p.highlights?.length ? `<h3 class="h3-sub">${k.highlights}</h3><ul class="checks checks--2">${p.highlights.map(x => `<li><i class="bx bx-check"></i>${esc(x)}</li>`).join('')}</ul>` : ''}
    </section>
    ${p.itinerary?.length ? `<section class="pkg-block" id="itinerario"><h2>${k.itinerary}</h2><ol class="timeline">${p.itinerary.map(s => `<li><time>${esc(s.time)}</time><div><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p>${s.checklist?.length ? `<ul class="checks">${s.checklist.map(x => `<li><i class="bx bx-check"></i>${esc(x)}</li>`).join('')}</ul>` : ''}</div></li>`).join('')}</ol></section>` : ''}
    ${p.includes?.length || p.excludes?.length ? `<section class="pkg-block" id="inclui"><h2>${k.included}</h2><div class="incexc"><div><h3>${k.inc}</h3><ul class="checks">${(p.includes || []).map(x => `<li><i class="bx bx-check"></i>${esc(x)}</li>`).join('')}</ul></div><div><h3>${k.exc}</h3><ul class="checks checks--no">${(p.excludes || []).map(x => `<li><i class="bx bx-x"></i>${esc(x)}</li>`).join('')}</ul></div></div></section>` : ''}
    ${p.menu?.length ? `<section class="pkg-block" id="menu"><h2>${k.menu}</h2>${p.menu.map(m => `<h3 class="h3-sub">${esc(m.title)}</h3><div class="menu-grid">${(m.categories || []).map(cat => `<div class="menu-card"><h4>${esc(cat.name)}</h4><ul>${(cat.items || []).map(it => `<li>${esc(it)}</li>`).join('')}</ul></div>`).join('')}</div>`).join('')}</section>` : ''}
    ${p.importantInfo?.length ? `<section class="pkg-block" id="info"><h2>${k.info}</h2><div class="notice"><i class="bx bx-info-circle"></i><ul>${p.importantInfo.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></section>` : ''}
    <section class="pkg-block" id="avaliacoes"><div class="block-head"><h2>${k.reviews}</h2><button type="button" class="btn-x btn-x--ghost btn-x--sm" data-review-open><i class="bx bxs-edit"></i> ${t.home.revWrite}</button></div><div class="review-list review-list--stack" data-reviews="${esc(p.slug)}"></div></section>
  </div>
  <aside id="reservar" aria-labelledby="bk-title">${booking}</aside>
  </div>
  ${related.length ? `<section class="section section--flush-bottom"><h2 class="h2-md">${k.related}</h2><div class="cards">${related.map(x => x.kind === 'stay' ? stayCard(x, lang) : card(x, lang)).join('')}</div></section>` : ''}
</main>
<div class="lightbox" data-lightbox data-open="false" role="dialog" aria-modal="true" aria-label="${esc(p.name)}">
  <button class="icon-btn lb-close" type="button" aria-label="${t.rev.close}" data-lb-close><i class="bx bx-x"></i></button>
  <button class="icon-btn lb-prev" type="button" aria-label="‹" data-lb-prev><i class="bx bx-chevron-left"></i></button>
  <img alt="${esc(p.name)}" data-lb-img>
  <button class="icon-btn lb-next" type="button" aria-label="›" data-lb-next><i class="bx bx-chevron-right"></i></button>
  <span class="lb-count" data-lb-count></span>
</div>
${reviewDialog(lang, p.slug)}`;

  const bar = `<div class="book-bar"><div class="price"><small>${t.price.from}</small><strong>${fmt(p.price_from)}</strong> <span>${esc(p.priceLabel || '')}</span></div><a class="btn-x btn-x--primary" href="#reservar">${b.title}</a></div>`;
  const ld = [crumbsLd([[t.nav.home, R.home(lang)], [listName, listUrl], [p.name, path]])];
  if (!isStay) ld.push({ '@context': 'https://schema.org', '@type': 'TouristTrip', name: p.name, description: p.description, url: SITE + path, image: g.slice(0, 4).map(s => SITE + optSrc(s, 1600)), provider: { '@id': SITE + '/#org' }, offers: { '@type': 'Offer', price: p.price_from, priceCurrency: 'MZN', url: SITE + path, availability: 'https://schema.org/InStock' } });

  return page({
    lang, path, alt, title: `${p.name} — ${isStay ? listName : t.nav.experiences} | Moz Camp Adventures`, desc: p.description, main, bodyClass: 'pkg-page', ogImage: p.gallery[0] || p.image,
    preload: optSrc(g[0], 1600), jsonld: ld, dockHtml: bar, headerOpts: { cta: '#reservar' },
    scripts: `${ticketScripts()}<script src="${asset('/assets/js/reviews.js')}" defer></script>\n<script type="application/json" id="track-view">${json({ event: 'view_package', package_id: p.slug, package_name: p.name, category: p.category, price: p.price_from })}</script>\n`
  });
}

/* Páginas legais (provisórias — ver docs) */
function legal(lang, kind) {
  const t = T[lang];
  const isPt = lang === 'pt';
  const path = R[kind](lang);
  const title = kind === 'privacy' ? t.footer.privacy : t.footer.terms;
  const draft = isPt ? 'Versão provisória, em revisão. Última actualização: ' : 'Provisional version, under review. Last updated: ';
  const today = new Date().toLocaleDateString(t.locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const body = kind === 'privacy' ? (isPt ? `
<h2>Quem somos</h2><p>Mozambique Camp Adventures («Moz Camp Adventures»), Marina, Escola Náutica, Cidade de Maputo, Moçambique. Contacto: <a href="mailto:info@mozcampadventures.co.mz">info@mozcampadventures.co.mz</a> · +258 84 440 6543.</p>
<h2>Que dados recolhemos e para quê</h2><ul>
<li><strong>Pedidos de reserva e contacto:</strong> nome, telefone, e-mail, datas, número de participantes e a mensagem que escreve. São guardados no nosso servidor e usados apenas para responder e organizar a sua experiência. Guardamos também uma impressão irreversível (hash) do endereço IP, para protecção contra abusos.</li>
<li><strong>Avaliações:</strong> nome, origem (opcional), classificação e texto. São guardadas no nosso servidor e só são publicadas depois de aprovadas pela equipa.</li>
<li><strong>Conta de cliente (opcional):</strong> nome, e-mail, telefone (opcional), idioma e palavra-passe (guardada cifrada, nunca em texto). Serve para ver as suas reservas e os documentos. As reservas que fizer com a sessão iniciada ficam associadas à conta. Pode apagar a conta a qualquer momento em «A minha conta»; as reservas e os documentos fiscais já emitidos ficam guardados, por obrigação legal.</li>
<li><strong>Promoções:</strong> só se aceitar expressamente, ao criar a conta ou em «A minha conta». Guardamos a data do consentimento. Pode deixar de receber a qualquer momento em «A minha conta».</li>
<li><strong>Estatísticas de utilização:</strong> só com o seu consentimento, através do Google Analytics (via Google Tag Manager), com dados agregados.</li></ul>
<h2>Cookies</h2><p>Usamos armazenamento local essencial para guardar as suas preferências de cookies e, se entrar na sua conta, um cookie de sessão essencial. Os cookies de análise só são activados se os aceitar. Pode mudar a escolha em «Gerir cookies», no rodapé.</p>
<h2>Partilha</h2><p>Não vendemos dados pessoais. Partilhamos apenas o necessário com os prestadores envolvidos na sua experiência (por exemplo, o alojamento reservado) e com os serviços técnicos acima referidos.</p>
<h2>Os seus direitos</h2><p>Pode pedir acesso, correcção ou eliminação dos seus dados através de <a href="mailto:info@mozcampadventures.co.mz">info@mozcampadventures.co.mz</a>.</p>` : `
<h2>Who we are</h2><p>Mozambique Camp Adventures (“Moz Camp Adventures”), Marina, Escola Náutica, Maputo City, Mozambique. Contact: <a href="mailto:info@mozcampadventures.co.mz">info@mozcampadventures.co.mz</a> · +258 84 440 6543.</p>
<h2>What we collect and why</h2><ul>
<li><strong>Booking and contact requests:</strong> name, phone, e-mail, dates, number of participants and your message. They are stored on our own server and used only to reply and arrange your experience. We also keep an irreversible fingerprint (hash) of your IP address to protect against abuse.</li>
<li><strong>Reviews:</strong> name, origin (optional), rating and text. Stored on our own server and published only after our team approves them.</li>
<li><strong>Customer account (optional):</strong> name, e-mail, phone (optional), language and password (stored encrypted, never as plain text). It lets you see your bookings and documents. Bookings you make while signed in are linked to the account. You can delete the account at any time under “My account”; bookings and tax documents already issued are kept, as required by law.</li>
<li><strong>Promotions:</strong> only if you explicitly agree, when creating the account or under “My account”. We record the date of your consent. You can stop at any time under “My account”.</li>
<li><strong>Usage statistics:</strong> only with your consent, through Google Analytics (via Google Tag Manager), as aggregated data.</li></ul>
<h2>Cookies</h2><p>We use essential local storage to remember your cookie preferences and, if you sign in to your account, an essential session cookie. Analytics cookies are only enabled if you accept them. You can change your choice under “Manage cookies” in the footer.</p>
<h2>Sharing</h2><p>We do not sell personal data. We only share what is needed with the providers involved in your experience (for example the accommodation booked) and the technical services mentioned above.</p>
<h2>Your rights</h2><p>You can ask to access, correct or delete your data at <a href="mailto:info@mozcampadventures.co.mz">info@mozcampadventures.co.mz</a>.</p>`)
    : (isPt ? `
<h2>Pedidos e confirmação</h2><p>Os pedidos feitos pelo site, por WhatsApp ou por e-mail não constituem reserva confirmada. A reserva fica confirmada quando a nossa equipa confirmar a disponibilidade e o pagamento for recebido.</p>
<h2>Preços</h2><p>Os preços publicados estão em meticais (MZN) e incluem os impostos aplicáveis. O total apresentado no site é uma estimativa calculada com as tarifas publicadas; o valor final é o indicado na confirmação da equipa.</p>
<h2>Pagamentos</h2><p>Aceitamos M-Pesa, e-Mola e transferência bancária. As instruções de pagamento são enviadas após a confirmação da disponibilidade.</p>
<h2>Participantes mínimos e máximos</h2><p>Algumas experiências exigem um número mínimo de participantes ou têm capacidade máxima, indicados na página de cada experiência.</p>
<h2>Cancelamentos e alterações</h2><p>As condições de cancelamento constam da página de cada experiência. Quando não estiverem indicadas, aplicam-se as condições comunicadas pela equipa na confirmação.</p>
<h2>Condições meteorológicas e segurança</h2><p>As actividades no mar dependem das condições meteorológicas e podem ser reagendadas pela equipa por razões de segurança.</p>
<h2>Contacto</h2><p>Mozambique Camp Adventures · Marina, Escola Náutica, Cidade de Maputo · <a href="mailto:booking@mozcampadventures.co.mz">booking@mozcampadventures.co.mz</a> · +258 84 440 6543.</p>` : `
<h2>Requests and confirmation</h2><p>Requests made through the website, WhatsApp or e-mail are not confirmed bookings. A booking is confirmed once our team confirms availability and payment is received.</p>
<h2>Prices</h2><p>Published prices are in Mozambican meticais (MZN) and include applicable taxes. The total shown on the website is an estimate based on published rates; the final amount is the one stated in our team’s confirmation.</p>
<h2>Payments</h2><p>We accept M-Pesa, e-Mola and bank transfer. Payment instructions are sent once availability is confirmed.</p>
<h2>Minimum and maximum participants</h2><p>Some experiences require a minimum number of participants or have a maximum capacity, shown on each experience page.</p>
<h2>Cancellations and changes</h2><p>Cancellation terms are shown on each experience page. Where none are shown, the terms communicated by our team in the confirmation apply.</p>
<h2>Weather and safety</h2><p>Sea activities depend on weather conditions and may be rescheduled by our team for safety reasons.</p>
<h2>Contact</h2><p>Mozambique Camp Adventures · Marina, Escola Náutica, Maputo City · <a href="mailto:booking@mozcampadventures.co.mz">booking@mozcampadventures.co.mz</a> · +258 84 440 6543.</p>`);
  const main = `<main id="main" class="container-x legal"><nav class="crumbs" aria-label="Breadcrumb"><a href="${R.home(lang)}">${t.nav.home}</a><span aria-hidden="true">/</span><span>${title}</span></nav><h1>${title}</h1><p class="draft-note"><i class="bx bx-info-circle"></i> ${draft}${today}</p><div class="prose">${body}</div></main>`;
  return page({ lang, path, alt: R[kind](other(lang)), title: `${title} | Moz Camp Adventures`, desc: title, main, noindex: true });
}

/* package.html?id= (URL antigo) → nova página */
function legacyRedirect(lang) {
  const map = Object.fromEntries(DATA[lang].all.map(p => [p.slug, R.item(p, lang)]));
  return `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, follow"><title>${T[lang].redirect} | Moz Camp Adventures</title>
<script type="application/json" id="redirect-map" data-fallback="${R.tours(lang)}">${json(map)}</script><script src="${asset('/assets/js/redirect.js')}"></script></head>
<body><p><a href="${R.tours(lang)}">${T[lang].catalog.h1}</a></p></body></html>
`;
}

/* Página privada para o cliente enviar o comprovativo (link com token no fragmento #t=) */
function proofPage() {
  const main = `<main id="main" class="container-x legal proof" data-proof>
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Início</a><span aria-hidden="true">/</span><span>Pagamento</span></nav>
  <h1>Enviar comprovativo de pagamento <small lang="en">Send proof of payment</small></h1>
  <p class="lead" data-proof-loading>A carregar… / Loading…</p>
  <div class="notice notice--warn" data-proof-error hidden><i class="bx bx-error-circle"></i><p>Este link não é válido ou expirou. Contacte-nos por WhatsApp +258 84 440 6543.<br><span lang="en">This link is invalid or has expired. Please contact us on WhatsApp +258 84 440 6543.</span></p></div>
  <div data-proof-body hidden>
    <div class="proof-summary">
      <div><small>Factura / Invoice</small><strong data-f="invoice"></strong></div>
      <div><small>Total</small><strong data-f="total"></strong></div>
      <div><small>Pago / Paid</small><strong data-f="paid"></strong></div>
      <div><small>Em dívida / Balance</small><strong data-f="balance"></strong></div>
    </div>
    <h2>Como pagar <small lang="en">How to pay</small></h2>
    <ul class="checks" data-f="methods"></ul>
    <h2>Comprovativo <small lang="en">Proof</small></h2>
    <form class="proof-form" novalidate data-proof-form>
      <div class="field-row">
        <div class="field"><label for="pf-method">Método / Method</label><select id="pf-method" name="method" required></select></div>
        <div class="field"><label for="pf-amount">Valor pago (MZN) / Amount paid</label><input id="pf-amount" name="amount" type="number" min="1" step="0.01" required></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="pf-date">Data do pagamento / Payment date</label><input id="pf-date" name="paid_on" type="date" required></div>
        <div class="field"><label for="pf-ref">Referência da transacção / Transaction reference</label><input id="pf-ref" name="reference" maxlength="80"></div>
      </div>
      <div class="field"><label for="pf-file">Ficheiro (PDF, JPG ou PNG, até 5 MB) / File (up to 5 MB)</label><input id="pf-file" name="proof" type="file" accept="application/pdf,image/jpeg,image/png" required></div>
      <div class="hp" aria-hidden="true"><label for="pf-hp">Não preencher</label><input id="pf-hp" name="mca_hp" tabindex="-1" autocomplete="off"></div>
      <p class="form-msg" data-proof-msg role="status"></p>
      <button class="btn-x btn-x--primary" type="submit"><i class="bx bx-upload"></i> <span>Enviar comprovativo / Send proof</span></button>
      <p class="booking__note"><i class="bx bx-info-circle"></i><span>O pagamento só é considerado depois de a nossa equipa confirmar a entrada dos fundos. Receberá o recibo.<br><span lang="en">The payment only counts once our team confirms the funds were received. You will receive a receipt.</span></span></p>
    </form>
  </div>
</main>`;
  return page({ lang: 'pt', path: '/pagamento/', alt: null, title: 'Pagamento | Moz Camp Adventures', desc: 'Envio de comprovativo de pagamento.', main, noindex: true, dockHtml: '',
    extraHead: '  <meta name="referrer" content="no-referrer">\n', scripts: `<script src="${asset('/assets/js/proof.js')}" defer></script>\n` });
}

/* Área do cliente: /reserva/#r=REF&t=TOKEN (link assinado enviado nos e-mails) */
/* Ticket do pedido com QR code (fim do pedido e área do cliente) */
const ticketScripts = () => `<script src="${asset('/assets/vendor/qrcode/qrcode.js')}" defer></script>\n<script src="${asset('/assets/js/ticket.js')}" defer></script>\n`;

function clientArea(lang) {
  const pt = lang === 'pt';
  const path = pt ? '/reserva/' : '/en/booking/';
  const main = `<main id="main" class="container-x legal client-area" data-client data-lang="${lang}">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${R.home(lang)}">${T[lang].nav.home}</a><span aria-hidden="true">/</span><span>${pt ? 'A minha reserva' : 'My booking'}</span></nav>
  <h1>${pt ? 'A minha reserva' : 'My booking'}</h1>
  <p class="lead" data-c-loading>${pt ? 'A carregar…' : 'Loading…'}</p>
  <div class="notice notice--warn" data-c-error hidden><i class="bx bx-error-circle"></i><p>${pt ? 'Este link não é válido ou foi substituído. Peça um novo link por WhatsApp +258 84 440 6543.' : 'This link is invalid or has been replaced. Ask for a new link on WhatsApp +258 84 440 6543.'}</p></div>
  <div data-c-body hidden>
    <div class="proof-summary" data-c-summary></div>
    <div class="client-ticket" data-c-ticket></div>
    <h2>${pt ? 'Facturas' : 'Invoices'}</h2><div data-c-invoices></div>
    <h2>${pt ? 'Recibos' : 'Receipts'}</h2><div data-c-receipts></div>
    <p class="booking__note"><i class="bx bx-shield"></i><span>${pt ? 'Este link é pessoal: não o partilhe. Dúvidas? WhatsApp +258 84 440 6543.' : 'This link is personal: please do not share it. Questions? WhatsApp +258 84 440 6543.'}</span></p>
  </div>
</main>`;
  return page({ lang, path, alt: null, title: `${pt ? 'A minha reserva' : 'My booking'} | Moz Camp Adventures`, desc: pt ? 'Área do cliente.' : 'Customer area.', main, noindex: true, dockHtml: '',
    extraHead: '  <meta name="referrer" content="no-referrer">\n', scripts: `${ticketScripts()}<script src="${asset('/assets/js/client.js')}" defer></script>\n` });
}

/* Conta de cliente (/conta/ e /en/account/): entrar, criar conta (funciona de imediato), repor palavra-passe,
   reservas da conta, perfil, promoções e apagar conta. Lógica em assets/js/account.js; API em /api/account/*. */
function accountPage(lang) {
  const pt = lang === 'pt', t = T[lang];
  const A = pt ? {
    title: 'A minha conta', loading: 'A carregar…',
    loginTitle: 'Entrar', loginLead: 'Veja as suas reservas, tickets e facturas num só lugar.', email: 'E-mail', password: 'Palavra-passe', login: 'Entrar',
    forgotLink: 'Esqueci-me da palavra-passe', noAccount: 'Ainda não tem conta?', createLink: 'Criar conta',
    regTitle: 'Criar conta', regLead: 'Crie a conta e pronto: as reservas que fizer com a sessão iniciada ficam todas aqui.', name: 'Nome completo', phone: 'Telefone / WhatsApp (opcional)',
    newPassword: 'Palavra-passe', passHint: 'Pelo menos 8 caracteres, com letras e números.',
    terms: `Li e aceito os <a href="${R.terms(lang)}">Termos</a> e a <a href="${R.privacy(lang)}">Política de Privacidade</a>.`,
    marketing: 'Quero receber promoções e novidades por e-mail (pode cancelar a qualquer momento).', register: 'Criar conta', haveAccount: 'Já tem conta?',
    forgotTitle: 'Repor a palavra-passe', forgotLead: 'Indique o e-mail da conta. Enviamos um link para escolher uma nova palavra-passe (válido 1 hora).', send: 'Enviar link',
    forgotSent: 'Se existir uma conta com este e-mail, enviámos o link. Veja também a pasta de spam.', back: 'Voltar a entrar',
    resetTitle: 'Nova palavra-passe', repeat: 'Repetir a palavra-passe', save: 'Guardar',
    hello: 'Olá', logout: 'Sair', bookings: 'As minhas reservas', noBookings: 'Ainda não há reservas nesta conta. Os pedidos que fizer com a sessão iniciada aparecem aqui.', explore: 'Ver experiências',
    profile: 'Dados pessoais', language: 'Idioma dos e-mails', prefs: 'Promoções', prefsLead: 'Receba ofertas e novidades da Moz Camp Adventures por e-mail.', prefsOn: 'Quero receber promoções por e-mail',
    pwTitle: 'Alterar palavra-passe', current: 'Palavra-passe actual', newPw: 'Nova palavra-passe', change: 'Alterar',
    delTitle: 'Apagar conta', delLead: 'A conta e as preferências são apagadas. As reservas e os documentos fiscais ficam guardados, por obrigação legal.', delConfirm: 'Confirme com a palavra-passe', del: 'Apagar a minha conta'
  } : {
    title: 'My account', loading: 'Loading…',
    loginTitle: 'Sign in', loginLead: 'See your bookings, tickets and invoices in one place.', email: 'E-mail', password: 'Password', login: 'Sign in',
    forgotLink: 'Forgot password', noAccount: "Don't have an account?", createLink: 'Create account',
    regTitle: 'Create account', regLead: 'Create your account and you are set: every booking you make while signed in shows up here.', name: 'Full name', phone: 'Phone / WhatsApp (optional)',
    newPassword: 'Password', passHint: 'At least 8 characters, with letters and numbers.',
    terms: `I have read and accept the <a href="${R.terms(lang)}">Terms</a> and the <a href="${R.privacy(lang)}">Privacy Policy</a>.`,
    marketing: 'I want to receive promotions and news by e-mail (you can unsubscribe at any time).', register: 'Create account', haveAccount: 'Already have an account?',
    forgotTitle: 'Reset password', forgotLead: 'Enter your account e-mail. We will send a link to choose a new password (valid 1 hour).', send: 'Send link',
    forgotSent: 'If there is an account with this e-mail, we have sent the link. Please also check your spam folder.', back: 'Back to sign in',
    resetTitle: 'New password', repeat: 'Repeat password', save: 'Save',
    hello: 'Hello', logout: 'Sign out', bookings: 'My bookings', noBookings: 'There are no bookings in this account yet. Requests you make while signed in show up here.', explore: 'See experiences',
    profile: 'Personal details', language: 'E-mail language', prefs: 'Promotions', prefsLead: 'Get offers and news from Moz Camp Adventures by e-mail.', prefsOn: 'I want to receive promotions by e-mail',
    pwTitle: 'Change password', current: 'Current password', newPw: 'New password', change: 'Change',
    delTitle: 'Delete account', delLead: 'Your account and preferences are deleted. Bookings and tax documents are kept, as required by law.', delConfirm: 'Confirm with your password', del: 'Delete my account'
  };
  const msgs = pt ? {
    invalid_credentials: 'E-mail ou palavra-passe incorrectos.', email_taken: 'Já existe uma conta com este e-mail. Entre, ou use «Esqueci-me da palavra-passe».',
    too_many_requests: 'Demasiadas tentativas. Aguarde alguns minutos.', weak_password: 'A palavra-passe deve ter pelo menos 8 caracteres, com letras e números.',
    invalid_link: 'Este link já não é válido. Peça um novo.', invalid_email: 'E-mail inválido.', invalid_name: 'Indique o seu nome.', invalid_phone: 'Telefone inválido.',
    terms_required: 'Para criar a conta, aceite os Termos e a Política de Privacidade.', mismatch: 'As palavras-passe não coincidem.', saved: 'Alterações guardadas.',
    pwChanged: 'Palavra-passe alterada. As outras sessões foram terminadas.', error: 'Não foi possível concluir. Tente de novo ou fale connosco por WhatsApp +258 84 440 6543.',
    confirmDelete: 'Apagar a conta? Esta acção não pode ser anulada.', view: 'Ver reserva e ticket', toConfirm: 'a confirmar', p1: '1 pessoa', pN: '{n} pessoas',
    st: { pedido: 'Pedido — aguarda confirmação', confirmada: 'Confirmada', concluida: 'Concluída', cancelada: 'Cancelada' }, since: 'desde', locale: 'pt-PT'
  } : {
    invalid_credentials: 'Wrong e-mail or password.', email_taken: 'There is already an account with this e-mail. Sign in, or use “Forgot password”.',
    too_many_requests: 'Too many attempts. Please wait a few minutes.', weak_password: 'The password must have at least 8 characters, with letters and numbers.',
    invalid_link: 'This link is no longer valid. Please ask for a new one.', invalid_email: 'Invalid e-mail.', invalid_name: 'Please enter your name.', invalid_phone: 'Invalid phone number.',
    terms_required: 'To create an account, please accept the Terms and the Privacy Policy.', mismatch: 'The passwords do not match.', saved: 'Changes saved.',
    pwChanged: 'Password changed. Your other sessions have been signed out.', error: 'Something went wrong. Please try again or contact us on WhatsApp +258 84 440 6543.',
    confirmDelete: 'Delete your account? This cannot be undone.', view: 'View booking and ticket', toConfirm: 'to be confirmed', p1: '1 person', pN: '{n} people',
    st: { pedido: 'Request — awaiting confirmation', confirmada: 'Confirmed', concluida: 'Completed', cancelada: 'Cancelled' }, since: 'since', locale: 'en-GB'
  };
  const field = (id, label, type, ac, extra = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id.replace(/^ac-/, '')}" type="${type}" autocomplete="${ac}" ${extra}></div>`;
  const main = `<main id="main" class="container-x account" data-account data-lang="${lang}">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${R.home(lang)}">${t.nav.home}</a><span aria-hidden="true">/</span><span>${A.title}</span></nav>
  <h1>${A.title}</h1>
  <p class="lead" data-view="loading">${A.loading}</p>
  <p class="form-msg account__msg" data-msg role="status" aria-live="polite" hidden></p>

  <section class="account-card" data-view="login" hidden><span class="eyebrow">${A.loginTitle}</span><p class="lead">${A.loginLead}</p>
    <form data-form="login" novalidate>${field('ac-email', A.email, 'email', 'email', 'required')}${field('ac-password', A.password, 'password', 'current-password', 'required')}
      <button class="btn-x btn-x--primary btn-x--block" type="submit">${A.login}</button></form>
    <p class="account__links"><a href="#" data-go="forgot">${A.forgotLink}</a><span>${A.noAccount} <a href="#" data-go="register">${A.createLink}</a></span></p></section>

  <section class="account-card" data-view="register" hidden><span class="eyebrow">${A.regTitle}</span><p class="lead">${A.regLead}</p>
    <form data-form="register" novalidate>${field('ac-name', A.name, 'text', 'name', 'required maxlength="120"')}${field('ac-remail', A.email, 'email', 'email', 'required')}${field('ac-phone', A.phone, 'tel', 'tel', 'maxlength="40"')}
      ${field('ac-rpassword', A.newPassword, 'password', 'new-password', 'required minlength="8"')}<p class="form-note">${A.passHint}</p>
      <label class="check-line"><input type="checkbox" name="terms" required> <span>${A.terms}</span></label>
      <label class="check-line"><input type="checkbox" name="marketing"> <span>${A.marketing}</span></label>
      <div class="hp" aria-hidden="true"><label for="ac-hp">Não preencher</label><input id="ac-hp" name="mca_hp" tabindex="-1" autocomplete="off"></div>
      <button class="btn-x btn-x--primary btn-x--block" type="submit">${A.register}</button></form>
    <p class="account__links"><span>${A.haveAccount} <a href="#" data-go="login">${A.login}</a></span></p></section>

  <section class="account-card" data-view="forgot" hidden><span class="eyebrow">${A.forgotTitle}</span><p class="lead">${A.forgotLead}</p>
    <form data-form="forgot" novalidate>${field('ac-femail', A.email, 'email', 'email', 'required')}<button class="btn-x btn-x--primary btn-x--block" type="submit">${A.send}</button></form>
    <p class="account__links"><a href="#" data-go="login">${A.back}</a></p></section>

  <section class="account-card" data-view="reset" hidden><span class="eyebrow">${A.resetTitle}</span>
    <form data-form="reset" novalidate>${field('ac-npassword', A.newPassword, 'password', 'new-password', 'required minlength="8"')}${field('ac-npassword2', A.repeat, 'password', 'new-password', 'required')}<p class="form-note">${A.passHint}</p>
      <button class="btn-x btn-x--primary btn-x--block" type="submit">${A.save}</button></form></section>

  <div class="account-dash" data-view="dashboard" hidden>
    <div class="account-dash__head"><p class="lead">${A.hello}, <strong data-c-name></strong></p><button type="button" class="btn-x btn-x--ghost btn-x--sm" data-logout><i class="bx bx-log-out"></i> ${A.logout}</button></div>
    <section aria-labelledby="ac-bk"><h2 id="ac-bk" class="h2-md">${A.bookings}</h2><div class="account-bookings" data-bookings></div>
      <p class="account-empty" data-no-bookings hidden>${A.noBookings} <a class="text-link" href="${R.tours(lang)}">${A.explore} <i class="bx bx-right-arrow-alt"></i></a></p></section>
    <div class="account-grid">
      <section class="account-card" aria-labelledby="ac-pf"><h2 id="ac-pf" class="h3-sub">${A.profile}</h2>
        <form data-form="profile" novalidate>${field('ac-pname', A.name, 'text', 'name', 'required maxlength="120"')}<div class="field"><label>${A.email}</label><input type="email" data-c-email readonly></div>
          ${field('ac-pphone', A.phone, 'tel', 'tel', 'maxlength="40"')}<div class="field"><label for="ac-plang">${A.language}</label><select id="ac-plang" name="plang"><option value="pt">Português</option><option value="en">English</option></select></div>
          <button class="btn-x btn-x--teal" type="submit">${A.save}</button></form></section>
      <section class="account-card" aria-labelledby="ac-pr"><h2 id="ac-pr" class="h3-sub">${A.prefs}</h2><p class="form-note">${A.prefsLead}</p>
        <label class="check-line"><input type="checkbox" data-marketing> <span>${A.prefsOn}</span></label><p class="form-note" data-marketing-since></p>
        <h2 class="h3-sub">${A.pwTitle}</h2>
        <form data-form="password" novalidate>${field('ac-cpassword', A.current, 'password', 'current-password', 'required')}${field('ac-cnew', A.newPw, 'password', 'new-password', 'required minlength="8"')}
          <button class="btn-x btn-x--ghost" type="submit">${A.change}</button></form></section>
    </div>
    <details class="account-delete"><summary>${A.delTitle}</summary><p class="form-note">${A.delLead}</p>
      <form data-form="delete" novalidate>${field('ac-dpassword', A.delConfirm, 'password', 'current-password', 'required')}<button class="btn-x btn-x--danger" type="submit">${A.del}</button></form></details>
  </div>
</main>
<script type="application/json" id="account-i18n">${json(msgs)}</script>`;
  return page({ lang, path: R.account(lang), alt: R.account(other(lang)), title: `${A.title} | Moz Camp Adventures`, desc: A.loginLead, main, noindex: true, dockHtml: '',
    extraHead: '  <meta name="referrer" content="no-referrer">\n', scripts: `<script src="${asset('/assets/js/account.js')}" defer></script>\n` });
}

function notFound() {
  const t = T.pt.notFound, e = T.en.notFound;
  const main = `<main id="main" class="container-x unavailable"><span class="eyebrow">404</span><h1>${t.title}</h1><p class="lead">${t.lead}</p><p class="lead" lang="en">${e.lead}</p><p class="unavailable__actions"><a class="btn-x btn-x--teal" href="/">${t.cta}</a><a class="btn-x btn-x--ghost" href="/pages/tours.html">${t.tours}</a><a class="btn-x btn-x--ghost" href="/en/" lang="en">English</a></p></main>`;
  return page({ lang: 'pt', path: '/404.html', alt: null, title: `${t.title} | Moz Camp Adventures`, desc: t.lead, main, noindex: true });
}

/* ── Escrita ─────────────────────────────────────────────── */
const written = [];
function out(url, html) {
  const f = join(ROOT, fileFor(url));
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, html);
  written.push(url);
}

const sitemap = [];
for (const lang of LANGS) {
  out(fileFor(R.home(lang)), home(lang));
  out(R.tours(lang), catalog(lang));
  out(R.stays(lang), staysPage(lang));
  out(R.contact(lang), contactPage(lang));
  out(R.privacy(lang), legal(lang, 'privacy'));
  out(R.terms(lang), legal(lang, 'terms'));
  out(lang === 'pt' ? '/pages/package.html' : '/en/pages/package.html', legacyRedirect(lang));
  for (const p of DATA[lang].all) out(R.item(p, lang), detail(p, lang));
  if (lang === 'pt') {
    for (const [a, b] of [[R.home, R.home], [R.tours, R.tours], [R.stays, R.stays], [R.contact, R.contact]]) sitemap.push([a('pt'), b('en')]);
    for (const p of active(DATA.pt.all)) sitemap.push([R.item(p, 'pt'), R.item(find('en', p.slug), 'en')]);
  }
}
out('/404.html', notFound());
out('/pagamento/', proofPage());
out('/reserva/', clientArea('pt'));
out('/en/booking/', clientArea('en'));
out(R.account('pt'), accountPage('pt'));
out(R.account('en'), accountPage('en'));

/* Painel (/admin/, HTML escrito à mão): carimbar os recursos com ?v=<hash> (cache longa no .htaccess) */
{
  const f = join(ROOT, 'admin/index.html');
  let html = readFileSync(f, 'utf8');
  const stamp = (url, file) => html = html.replace(new RegExp(`(["'])${url.replace(/[.?]/g, '\\$&')}(\\?v=[a-f0-9]+)?\\1`, 'g'), `$1${asset(file).replace('/admin/', '')}$1`);
  stamp('admin.css', '/admin/admin.css');
  stamp('admin.js', '/admin/admin.js');
  stamp('/assets/css/tokens.css', '/assets/css/tokens.css');
  stamp('/assets/vendor/boxicons/boxicons.css', '/assets/vendor/boxicons/boxicons.css');
  writeFileSync(f, html);
}

const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sitemap.flatMap(([pt, en]) => [pt, en].map(u => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><xhtml:link rel="alternate" hreflang="pt" href="${SITE}${pt}"/><xhtml:link rel="alternate" hreflang="en" href="${SITE}${en}"/><xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${pt}"/></url>`)).join('\n')}
</urlset>
`);
writeFileSync(join(ROOT, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /prototipo/
Disallow: /admin/
Disallow: /api/
Disallow: /pagamento/
Disallow: /reserva/
Disallow: /en/booking/
Disallow: /conta/
Disallow: /en/account/
Disallow: /docs/
Disallow: /scripts/

Sitemap: ${SITE}/sitemap.xml
`);

console.log(`${written.length} páginas · ${sitemap.length * 2} URLs no sitemap`);
