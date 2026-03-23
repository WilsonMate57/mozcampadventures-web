/**
 * MOZ CAMP ADVENTURES — main.js
 * =====================================================
 * Global UI behaviours:
 *   1. Preloader (Lottie animation)
 *   2. Scroll-reveal animations
 *   3. Scroll-to-top button
 *   4. Review carousel (homepage)
 *   5. Package infinite carousel (homepage)
 *   6. Accommodation hero carousel
 *   7. Language switcher
 * =====================================================
 */


/* =============================================
   1. PRELOADER
   ============================================= */
document.addEventListener('DOMContentLoaded', function () {
  document.body.classList.add('preloading');

  var MIN_TIME = 2800;
  var startTime = Date.now();
  var loaderEl  = document.getElementById('lottie-loader');

  if (loaderEl && typeof lottie !== 'undefined') {
    lottie.loadAnimation({
      container: loaderEl,
      renderer:  'svg',
      loop:      true,
      autoplay:  true,
      path:      (window.MCA_BASE || '') + 'assets/preloader/summer-vibes.json'
    });
  }

  window.addEventListener('load', function () {
    var elapsed   = Date.now() - startTime;
    var remaining = Math.max(0, MIN_TIME - elapsed);

    setTimeout(function () {
      var preloader = document.getElementById('preloader');
      if (preloader) {
        preloader.style.transition = 'opacity 0.6s ease';
        preloader.style.opacity    = '0';
        setTimeout(function () {
          preloader.style.display = 'none';
          document.body.classList.remove('preloading');
          revealOnScroll();
        }, 600);
      }
    }, remaining);
  });
});


/* =============================================
   2. SCROLL REVEAL
   ============================================= */
function revealOnScroll() {
  document.querySelectorAll('.reveal').forEach(function (el) {
    if (el.getBoundingClientRect().top < window.innerHeight - 100) {
      el.classList.add('active');
    }
  });
}

window.addEventListener('scroll', revealOnScroll, { passive: true });
document.addEventListener('DOMContentLoaded', revealOnScroll);
window.addEventListener('load', revealOnScroll);


/* =============================================
   3. SCROLL-TO-TOP BUTTON
   ============================================= */
document.addEventListener('DOMContentLoaded', function () {
  var btn = document.createElement('button');
  btn.id = 'scroll-to-top';
  btn.innerHTML = '<i class="bx bx-up-arrow-alt"></i>';
  btn.setAttribute('aria-label', 'Voltar ao topo');
  document.body.appendChild(btn);

  window.addEventListener('scroll', function () {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });

  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});


/* =============================================
   4. REVIEW CAROUSEL (homepage)
   ============================================= */
document.addEventListener('DOMContentLoaded', function () {
  var reviewEl = document.getElementById('reviewCarousel');
  if (!reviewEl || typeof bootstrap === 'undefined') return;

  var carousel = new bootstrap.Carousel(reviewEl, { interval: false, wrap: true });

  reviewEl.addEventListener('slid.bs.carousel', function (e) {
    document.querySelectorAll('.review-dots').forEach(function (dotSet) {
      dotSet.querySelectorAll('.dot').forEach(function (dot, i) {
        dot.classList.toggle('active', i === e.to);
      });
    });
  });

  document.querySelectorAll('.review-dots .dot').forEach(function (dot) {
    dot.addEventListener('click', function () {
      carousel.to(parseInt(this.getAttribute('data-index')));
    });
  });
});


/* =============================================
   5. PACKAGES INFINITE CAROUSEL (homepage)
   ============================================= */
document.addEventListener('DOMContentLoaded', function () {
  var track    = document.getElementById('pkgTrack');
  var dotsWrap = document.getElementById('pkgDots');
  var btnPrev  = document.getElementById('pkgPrev');
  var btnNext  = document.getElementById('pkgNext');

  if (!track || !btnPrev || !btnNext) return;

  function getSlidesPerView() {
    if (window.innerWidth <= 575) return 1;
    if (window.innerWidth <= 991) return 2;
    return 3;
  }

  var originals = Array.from(track.querySelectorAll('.pkg-slide'));
  var total     = originals.length;
  var perView   = getSlidesPerView();
  var current   = 0;
  var animating = false;
  var autoTimer = null;

  function buildTrack() {
    track.innerHTML = '';
    perView = getSlidesPerView();
    var prefix = originals.slice(-perView).map(function (s) { return s.cloneNode(true); });
    var suffix = originals.slice(0, perView).map(function (s) { return s.cloneNode(true); });
    [].concat(prefix, originals, suffix).forEach(function (s) { track.appendChild(s); });
  }

  function getSlideWidth() {
    var slides = track.querySelectorAll('.pkg-slide');
    if (!slides.length) return 0;
    return slides[0].offsetWidth + 24; // 24 = gap
  }

  function jumpTo(idx) {
    var off = (idx + perView) * getSlideWidth();
    track.style.transition = 'none';
    track.style.transform  = 'translateX(-' + off + 'px)';
  }

  function slideTo(idx) {
    if (animating) return;
    animating = true;
    current = ((idx % total) + total) % total;
    var off = (current + perView) * getSlideWidth();
    track.style.transition = 'transform 0.45s cubic-bezier(0.4,0,0.2,1)';
    track.style.transform  = 'translateX(-' + off + 'px)';
    updateDots();
  }

  track.addEventListener('transitionend', function () {
    animating = false;
    jumpTo(current);
  });

  function buildDots() {
    dotsWrap.innerHTML = '';
    for (var i = 0; i < total; i++) {
      var d = document.createElement('button');
      d.className = 'pkg-dot' + (i === 0 ? ' active' : '');
      d.setAttribute('aria-label', 'Pacote ' + (i + 1));
      (function (idx) { d.addEventListener('click', function () { slideTo(idx); resetAuto(); }); })(i);
      dotsWrap.appendChild(d);
    }
  }

  function updateDots() {
    dotsWrap.querySelectorAll('.pkg-dot').forEach(function (d, i) {
      d.classList.toggle('active', i === current);
    });
  }

  btnPrev.addEventListener('click', function () { slideTo(current - 1); resetAuto(); });
  btnNext.addEventListener('click', function () { slideTo(current + 1); resetAuto(); });

  function startAuto() { autoTimer = setInterval(function () { slideTo(current + 1); }, 4500); }
  function resetAuto()  { clearInterval(autoTimer); startAuto(); }

  var touchX = 0;
  track.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) { dx < 0 ? slideTo(current + 1) : slideTo(current - 1); resetAuto(); }
  }, { passive: true });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      buildTrack(); buildDots(); jumpTo(current);
    }, 200);
  });

  buildTrack();
  buildDots();
  jumpTo(current);
  startAuto();
});


/* =============================================
   7. LANGUAGE SWITCHER
   ============================================= */
(function () {
  var _path    = window.location.pathname;
  var _current = (_path.indexOf('/en/') !== -1 || _path.startsWith('/en')) ? 'en' : 'pt';

  function applyLang(lang) {
    document.documentElement.setAttribute('lang', lang === 'pt' ? 'pt' : 'en');
    document.querySelectorAll('.lang-pill, .mobile-lang-pill').forEach(function (btn) {
      var isActive = btn.dataset.lang === lang;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  document.addEventListener('click', function (e) {
    var pill = e.target.closest('.lang-pill, .mobile-lang-pill');
    if (!pill || !pill.dataset.lang) return;
    var lang = pill.dataset.lang;
    if (lang === _current) return;

    var search = window.location.search;
    if (lang === 'en') {
      window.location.href = '/en' + _path + search;
    } else {
      var ptPath = _path.replace(/^\/en/, '') || '/index.html';
      window.location.href = ptPath + search;
    }
  });

  // Apply correct pill state once navbar is injected
  var observer = new MutationObserver(function (_, obs) {
    if (document.querySelector('.lang-pill')) {
      applyLang(_current);
      obs.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();


/* =============================================
   6. ACCOMMODATION / TOURS HERO CAROUSEL
   ============================================= */
(function () {
  var track   = document.getElementById('aloHeroTrack');
  var dotsEl  = document.getElementById('aloHeroDots');
  var btnPrev = document.getElementById('aloPrev');
  var btnNext = document.getElementById('aloNext');

  if (!track) return;

  var slides  = Array.from(track.querySelectorAll('.alo-hero-slide'));
  var current = 0;
  var timer   = null;

  if (dotsEl) {
    slides.forEach(function (_, i) {
      var dot = document.createElement('button');
      dot.className = 'alo-hero-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Slide ' + (i + 1));
      dot.addEventListener('click', function () { goTo(i); reset(); });
      dotsEl.appendChild(dot);
    });
  }

  function goTo(idx) {
    slides[current].classList.remove('active');
    if (dotsEl && dotsEl.children[current]) dotsEl.children[current].classList.remove('active');
    current = ((idx % slides.length) + slides.length) % slides.length;
    slides[current].classList.add('active');
    if (dotsEl && dotsEl.children[current]) dotsEl.children[current].classList.add('active');
  }

  if (btnNext) btnNext.addEventListener('click', function () { goTo(current + 1); reset(); });
  if (btnPrev) btnPrev.addEventListener('click', function () { goTo(current - 1); reset(); });

  var tx = 0;
  track.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) { goTo(current + (dx < 0 ? 1 : -1)); reset(); }
  }, { passive: true });

  function start() { timer = setInterval(function () { goTo(current + 1); }, 5000); }
  function reset() { clearInterval(timer); start(); }

  track.addEventListener('mouseenter', function () { clearInterval(timer); });
  track.addEventListener('mouseleave', start);

  start();
})();
