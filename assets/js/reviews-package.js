/**
 * MOZ CAMP ADVENTURES — reviews-package.js
 * ─────────────────────────────────────────────────────────
 * Package detail page review system:
 *   1. Loads approved reviews for the current package
 *   2. Renders them in #pkg-reviews-list
 *   3. Handles the inline review submission form
 *
 * The packageId is read from the URL ?id= parameter.
 * ─────────────────────────────────────────────────────────
 */

import { db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';


/* ── Helpers ──────────────────────────────────────────── */

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function starsHtml(rating) {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function formatDate(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const lang = window.MCA_LANG === 'en' ? 'en-GB' : 'pt-MZ';
  return date.toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
}

function getPackageId() {
  return new URLSearchParams(window.location.search).get('id') || '';
}


/* ── Render reviews list ──────────────────────────────── */

function renderReviews(reviews) {
  const list    = document.getElementById('pkg-reviews-list');
  const counter = document.getElementById('pkg-reviews-count');
  const avg     = document.getElementById('pkg-reviews-avg');
  if (!list) return;

  if (counter) counter.textContent = reviews.length;

  const priceStars = document.querySelector('.pkg-stars');

  if (avg && reviews.length) {
    const mean = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    avg.textContent = mean.toFixed(1);

    /* Sync the price-block stars with the real calculated rating */
    if (priceStars) {
      const rounded = Math.round(mean);
      priceStars.innerHTML =
        '<span class="pkg-stars-icons">' + starsHtml(rounded) + '</span>' +
        '<span class="pkg-stars-avg"> ' + mean.toFixed(1) + '</span>' +
        '<span class="pkg-stars-count"> (' + reviews.length + ')</span>';
    }
  } else if (priceStars) {
    /* No reviews yet — append a zero-count label */
    priceStars.insertAdjacentHTML('beforeend',
      ' <span class="pkg-stars-count">(0)</span>');
  }

  if (!reviews.length) {
    list.innerHTML = '<p class="pkg-reviews-empty">Seja o primeiro a avaliar este pacote!</p>';
    return;
  }

  list.innerHTML = reviews.map(r => `
    <div class="pkg-review-item">
      <div class="pkg-review-header">
        <div class="pkg-review-avatar"><i class="bx bxs-user"></i></div>
        <div>
          <div class="pkg-review-name">${esc(r.name)}</div>
          ${r.role ? `<div class="pkg-review-role">${esc(r.role)}</div>` : ''}
        </div>
        <div class="pkg-review-stars ms-auto">${starsHtml(r.rating)}</div>
      </div>
      ${r.createdAt ? `<div class="pkg-review-date">${formatDate(r.createdAt)}</div>` : ''}
      <p class="pkg-review-text">${esc(r.text)}</p>
    </div>
  `).join('');
}


/* ── Load reviews for this package ───────────────────── */

async function loadPackageReviews(packageId) {
  const list = document.getElementById('pkg-reviews-list');
  if (!list) return;

  list.innerHTML = '<p class="pkg-reviews-loading"><i class="bx bx-loader-alt bx-spin"></i> A carregar avaliações...</p>';

  try {
    const q = query(
      collection(db, 'reviews'),
      where('approved', '==', true),
      where('packageId', '==', packageId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    renderReviews(snap.docs.map(d => d.data()));
  } catch (err) {
    console.warn('[Reviews] Package reviews load failed:', err);
    list.innerHTML = '<p class="pkg-reviews-empty">Não foi possível carregar as avaliações.</p>';
  }
}


/* ── Star picker ──────────────────────────────────────── */

function initStarPicker(pickerId, inputId) {
  const picker = document.getElementById(pickerId);
  const input  = document.getElementById(inputId);
  if (!picker || !input) return;

  function highlight(val) {
    picker.querySelectorAll('i').forEach(s => {
      s.className = parseInt(s.dataset.v) <= parseInt(val) ? 'bx bxs-star' : 'bx bx-star';
    });
  }

  picker.querySelectorAll('i').forEach(star => {
    star.addEventListener('mouseover', () => highlight(star.dataset.v));
    star.addEventListener('mouseout',  () => highlight(input.value));
    star.addEventListener('click',     () => { input.value = star.dataset.v; highlight(star.dataset.v); });
  });
}


/* ── Inline review form ───────────────────────────────── */

function initReviewForm(packageId) {
  const form      = document.getElementById('pkg-review-form');
  const successEl = document.getElementById('pkg-review-success');
  const errorEl   = document.getElementById('pkg-review-error');
  const submitBtn = document.getElementById('pkg-r-submit');
  if (!form) return;

  initStarPicker('pkg-star-picker', 'pkg-r-rating');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorEl.style.display = 'none';

    const name   = document.getElementById('pkg-r-name').value.trim();
    const role   = document.getElementById('pkg-r-role').value.trim();
    const text   = document.getElementById('pkg-r-text').value.trim();
    const rating = parseInt(document.getElementById('pkg-r-rating').value);

    if (!name)   return showError('Por favor, insira o seu nome.');
    if (!rating) return showError('Por favor, selecione uma avaliação em estrelas.');
    if (!text)   return showError('Por favor, escreva a sua experiência.');

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin me-2"></i>A enviar...';

    try {
      await addDoc(collection(db, 'reviews'), {
        name,
        role:      role || null,
        text,
        rating,
        packageId,
        approved:  false,
        source:    'direct',
        createdAt: serverTimestamp()
      });
      form.style.display      = 'none';
      successEl.style.display = 'block';
    } catch (err) {
      console.error('[Reviews] Submit failed:', err);
      showError('Erro ao enviar. Por favor, tente novamente.');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="bx bxs-send me-2"></i>Enviar Avaliação';
    }

    function showError(msg) {
      errorEl.textContent   = msg;
      errorEl.style.display = 'block';
    }
  });
}


/* ── Init ─────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  const packageId = getPackageId();
  if (!packageId) return;

  loadPackageReviews(packageId);
  initReviewForm(packageId);
});
