/**
 * MOZ CAMP ADVENTURES — reviews.js
 * ─────────────────────────────────────────────────────────
 * Handles:
 *   1. Loading approved reviews from Firestore
 *   2. Rendering them in the #reviewCarousel
 *   3. Review submission form with star picker
 *
 * Reviews submitted here are stored with approved: false.
 * Approve them in the Firebase console to make them public.
 * ─────────────────────────────────────────────────────────
 */

import { db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
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


/* ── Carousel rendering ───────────────────────────────── */

function buildCarouselItem(review, index, total, isActive) {
  const dots = Array.from({ length: total }, (_, i) =>
    `<div class="dot${i === index ? ' active' : ''}" data-index="${i}"></div>`
  ).join('');

  return `
    <div class="carousel-item${isActive ? ' active' : ''}">
      <div class="review-card">
        <div class="quote-icon"><i class="bx bxs-quote-alt-left"></i></div>
        <p class="review-text">${esc(review.text)}</p>
        <div class="stars-review">${starsHtml(review.rating)}</div>
        <div class="reviewer mt-3">
          <div class="reviewer-avatar">
            <div class="img-box-placeholder" style="height:44px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;">
              <i class="bx bxs-user" style="font-size:1.2rem;color:#fff;"></i>
            </div>
          </div>
          <div>
            <div class="reviewer-name">– ${esc(review.name)}</div>
            ${review.role ? `<div class="reviewer-role">${esc(review.role)}</div>` : ''}
          </div>
          <div class="review-nav ms-auto">
            <button class="review-nav-btn" data-bs-target="#reviewCarousel" data-bs-slide="prev">
              <i class="bx bx-chevron-left"></i>
            </button>
            <div class="review-dots">${dots}</div>
            <button class="review-nav-btn" data-bs-target="#reviewCarousel" data-bs-slide="next">
              <i class="bx bx-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

function renderCarousel(reviews) {
  const el = document.getElementById('reviewCarousel');
  if (!el) return;

  const inner = el.querySelector('.carousel-inner');
  if (!inner) return;

  // Dispose existing Bootstrap Carousel instance before replacing HTML
  const existing = bootstrap.Carousel.getInstance(el);
  if (existing) existing.dispose();

  inner.innerHTML = reviews
    .map((r, i) => buildCarouselItem(r, i, reviews.length, i === 0))
    .join('');

  // Re-init Bootstrap Carousel
  const carousel = new bootstrap.Carousel(el, { interval: false, wrap: true });

  // Sync dots when slide changes
  el.addEventListener('slid.bs.carousel', function (e) {
    el.querySelectorAll('.review-dots').forEach(function (dotSet) {
      dotSet.querySelectorAll('.dot').forEach(function (dot, i) {
        dot.classList.toggle('active', i === e.to);
      });
    });
  });

  // Dots click navigation (delegated)
  el.addEventListener('click', function (e) {
    const dot = e.target.closest('.dot');
    if (dot) carousel.to(parseInt(dot.getAttribute('data-index')));
  });
}


/* ── Load approved reviews from Firestore ─────────────── */

async function loadReviews() {
  try {
    const q = query(
      collection(db, 'reviews'),
      where('approved', '==', true),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      renderCarousel(snap.docs.map(d => d.data()));
    }
    // If empty, hardcoded reviews in HTML remain visible
  } catch (err) {
    console.warn('[Reviews] Firestore load failed — showing fallback reviews.', err);
  }
}


/* ── Live review counters on cards ───────────────────── */

async function updateCardCounts() {
  const starEls = document.querySelectorAll('[data-pkg-id]');
  if (!starEls.length) return;

  const ids = [...new Set([...starEls].map(el => el.dataset.pkgId))];

  try {
    const counts = {};
    const sums   = {};
    // Firestore 'in' supports up to 30 values per query
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      const q = query(
        collection(db, 'reviews'),
        where('approved', '==', true),
        where('packageId', 'in', chunk)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        const { packageId: pid, rating } = d.data();
        counts[pid] = (counts[pid] || 0) + 1;
        sums[pid]   = (sums[pid]   || 0) + (rating || 0);
      });
    }

    starEls.forEach(el => {
      const pid     = el.dataset.pkgId;
      const n       = counts[pid] || 0;
      // No reviews → 5 filled stars; with reviews → round the average
      const avg     = n ? Math.round(sums[pid] / n) : 5;
      const starsEl = el.querySelector('.stars-text');
      const countEl = el.querySelector('.review-count');
      if (starsEl) starsEl.textContent = '★'.repeat(avg) + '☆'.repeat(5 - avg);
      if (countEl) countEl.textContent = `(${n})`;
    });
  } catch (err) {
    console.warn('[Reviews] Card count update failed:', err);
  }
}


/* ── Star picker ──────────────────────────────────────── */

function initStarPicker() {
  const picker = document.getElementById('star-picker');
  const input  = document.getElementById('r-rating');
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


/* ── Review form submission ───────────────────────────── */

function initReviewForm() {
  const form      = document.getElementById('review-form');
  const successEl = document.getElementById('review-success');
  const errorEl   = document.getElementById('review-error');
  const submitBtn = document.getElementById('r-submit');
  if (!form) return;

  initStarPicker();

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorEl.style.display = 'none';

    const name   = document.getElementById('r-name').value.trim();
    const role   = document.getElementById('r-role').value.trim();
    const text   = document.getElementById('r-text').value.trim();
    const rating = parseInt(document.getElementById('r-rating').value);

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
        approved:  false,
        source:    'direct',
        createdAt: serverTimestamp()
      });
      form.style.display    = 'none';
      successEl.style.display = 'block';
    } catch (err) {
      console.error('[Reviews] Submit failed:', err);
      showError('Erro ao enviar. Por favor, tente novamente.');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="bx bxs-send me-2"></i>Enviar Avaliação';
    }

    function showError(msg) {
      errorEl.textContent    = msg;
      errorEl.style.display  = 'block';
    }
  });

  // Reset modal state when closed
  const modal = document.getElementById('reviewModal');
  if (modal) {
    modal.addEventListener('hidden.bs.modal', function () {
      form.reset();
      form.style.display      = '';
      successEl.style.display = 'none';
      errorEl.style.display   = 'none';
      submitBtn.disabled      = false;
      submitBtn.innerHTML     = '<i class="bx bxs-send me-2"></i>Enviar Avaliação';
      document.getElementById('r-rating').value = '0';
      document.getElementById('star-picker').querySelectorAll('i')
        .forEach(s => s.className = 'bx bx-star');
    });
  }
}


/* ── Init ─────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  loadReviews();
  initReviewForm();
  // Run after data-loader signals cards are in the DOM
  document.addEventListener('mcaCardsReady', updateCardCounts, { once: true });
});
