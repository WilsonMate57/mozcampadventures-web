// =============================================
// MOZ CAMP ADVENTURES — script.js
// =============================================

// ===== 1. PRELOADER + LOTTIE =====
document.addEventListener('DOMContentLoaded', function () {

  const MIN_LOADING_TIME = 2800;
  const startTime = Date.now();

  const loaderContainer = document.getElementById('lottie-loader');

  if (loaderContainer && typeof lottie !== 'undefined') {
    lottie.loadAnimation({
      container: loaderContainer,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: 'assets/preloader/summer-vibes.json'
    });
  }

  window.addEventListener('load', function () {
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);

    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) {
        preloader.style.transition = 'opacity 0.6s ease';
        preloader.style.opacity = '0';
        setTimeout(() => {
          preloader.style.display = 'none';
          // ✅ Disparar reveal DEPOIS do preloader sumir
          revealOnScroll();
        }, 600);
      }
    }, remainingTime);
  });

});


// ===== 2. SCROLL REVEAL =====
function revealOnScroll() {
  const reveals = document.querySelectorAll('.reveal');
  reveals.forEach(function (el) {
    const windowHeight = window.innerHeight;
    const elementTop = el.getBoundingClientRect().top;
    const revealPoint = 100;

    if (elementTop < windowHeight - revealPoint) {
      el.classList.add('active');
    }
  });
}

// Ouvir scroll sempre
window.addEventListener('scroll', revealOnScroll, { passive: true });

// Primeiro disparo assim que o DOM estiver pronto
document.addEventListener('DOMContentLoaded', revealOnScroll);

// Segundo disparo quando tudo carregar (imagens, etc.)
window.addEventListener('load', revealOnScroll);


// ===== 3. VIDEO MODAL =====
document.addEventListener('DOMContentLoaded', function () {
  const videoModal = document.getElementById('videoModal');
  const modalVideo = document.getElementById('modalVideo');

  if (videoModal && modalVideo) {
    videoModal.addEventListener('hidden.bs.modal', function () {
      modalVideo.pause();
      modalVideo.currentTime = 0;
    });
  }
});


// ===== 4. REVIEW CAROUSEL =====
document.addEventListener('DOMContentLoaded', function () {

  const reviewCarouselEl = document.getElementById('reviewCarousel');
  if (!reviewCarouselEl) return;

  const reviewCarousel = new bootstrap.Carousel(reviewCarouselEl, {
    interval: false,
    wrap: true
  });

  // Sincronizar dots quando o slide muda
  reviewCarouselEl.addEventListener('slid.bs.carousel', function (e) {
    const currentIndex = e.to;
    document.querySelectorAll('.review-dots').forEach(function (dotSet) {
      dotSet.querySelectorAll('.dot').forEach(function (dot, i) {
        dot.classList.toggle('active', i === currentIndex);
      });
    });
  });

  // Clicar nos dots para navegar
  document.querySelectorAll('.review-dots .dot').forEach(function (dot) {
    dot.addEventListener('click', function () {
      const idx = parseInt(this.getAttribute('data-index'));
      reviewCarousel.to(idx);
    });
  });

  // Navegação por teclado
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft')  reviewCarousel.prev();
    if (e.key === 'ArrowRight') reviewCarousel.next();
  });

});


// ===== 5. PACKAGES INFINITE CAROUSEL =====
document.addEventListener('DOMContentLoaded', function () {

  const track     = document.getElementById('pkgTrack');
  const dotsWrap  = document.getElementById('pkgDots');
  const btnPrev   = document.getElementById('pkgPrev');
  const btnNext   = document.getElementById('pkgNext');

  if (!track || !btnPrev || !btnNext) return;

  // ── helpers ──────────────────────────────────────────────
  function getSlidesPerView() {
    if (window.innerWidth <= 575) return 1;
    if (window.innerWidth <= 991) return 2;
    return 3;
  }

  // ── state ────────────────────────────────────────────────
  const originalSlides = Array.from(track.querySelectorAll('.pkg-slide'));
  const total          = originalSlides.length;
  let   perView        = getSlidesPerView();
  let   current        = 0;   // logical index (0 … total-1)
  let   isAnimating    = false;
  let   autoTimer      = null;

  // ── build infinite track  ────────────────────────────────
  // Clone enough slides: prefix (last `perView`) + originals + suffix (first `perView`)
  function buildTrack() {
    // clear
    track.innerHTML = '';
    perView = getSlidesPerView();

    const prefix = originalSlides.slice(-perView).map(s => s.cloneNode(true));
    const suffix = originalSlides.slice(0, perView).map(s => s.cloneNode(true));

    [...prefix, ...originalSlides, ...suffix].forEach(s => track.appendChild(s));
  }

  // ── gap & slide width  ───────────────────────────────────
  function getSlideWidth() {
    const slides = track.querySelectorAll('.pkg-slide');
    if (!slides.length) return 0;
    const gap = 24; // matches CSS gap
    return slides[0].offsetWidth + gap;
  }

  // ── jump to correct position (no transition) ─────────────
  function jumpTo(logicalIndex) {
    const sw  = getSlideWidth();
    const off = (logicalIndex + perView) * sw; // +perView accounts for prefix clones
    track.style.transition = 'none';
    track.style.transform  = `translateX(-${off}px)`;
  }

  // ── slide to logicalIndex (with animation) ───────────────
  function slideTo(logicalIndex) {
    if (isAnimating) return;
    isAnimating = true;
    current = ((logicalIndex % total) + total) % total;

    const sw  = getSlideWidth();
    const off = (current + perView) * sw;

    track.style.transition = 'transform 0.45s cubic-bezier(0.4,0,0.2,1)';
    track.style.transform  = `translateX(-${off}px)`;

    updateDots();
  }

  track.addEventListener('transitionend', function () {
    isAnimating = false;
    // If we landed on a clone at the end, silently jump back
    jumpTo(current);
  });

  // ── dots ─────────────────────────────────────────────────
  function buildDots() {
    dotsWrap.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const d = document.createElement('button');
      d.className = 'pkg-dot' + (i === 0 ? ' active' : '');
      d.setAttribute('aria-label', 'Pacote ' + (i + 1));
      d.addEventListener('click', () => slideTo(i));
      dotsWrap.appendChild(d);
    }
  }

  function updateDots() {
    dotsWrap.querySelectorAll('.pkg-dot').forEach((d, i) => {
      d.classList.toggle('active', i === current);
    });
  }

  // ── buttons ──────────────────────────────────────────────
  btnPrev.addEventListener('click', () => { slideTo(current - 1); resetAuto(); });
  btnNext.addEventListener('click', () => { slideTo(current + 1); resetAuto(); });

  // ── autoplay ─────────────────────────────────────────────
  function startAuto() { autoTimer = setInterval(() => slideTo(current + 1), 4500); }
  function resetAuto()  { clearInterval(autoTimer); startAuto(); }

  // ── touch / swipe ────────────────────────────────────────
  let touchStartX = 0;
  track.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) { dx < 0 ? slideTo(current + 1) : slideTo(current - 1); resetAuto(); }
  }, { passive: true });

  // ── resize (debounced) ───────────────────────────────────
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      buildTrack();
      buildDots();
      jumpTo(current);
    }, 200);
  });

  // ── init ─────────────────────────────────────────────────
  buildTrack();
  buildDots();
  jumpTo(current);
  startAuto();

});
