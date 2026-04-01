/**
 * MOZ CAMP ADVENTURES — components.js
 * =====================================================
 * Fetches and injects navbar + footer HTML components.
 * Handles: path resolution, active nav links, sticky
 * navbar, mobile nav, and copyright year update.
 * =====================================================
 */

(function () {
  'use strict';

  /* ── Path resolution ────────────────────────────────────── */
  var _cParts = window.location.pathname.split('/').filter(Boolean);
  if (_cParts.length > 0 && _cParts[_cParts.length - 1].indexOf('.') > -1) { _cParts.pop(); }
  var _base = _cParts.length > 0 ? _cParts.map(function () { return '..'; }).join('/') + '/' : '';

  /* ── Language & component directory ─────────────────────── */
  var _isEn = window.location.pathname.indexOf('/en/') !== -1 || window.location.pathname.startsWith('/en');
  var _compDir = _isEn ? _base + 'en/components/' : _base + 'components/';

  /* ── Active page detection ──────────────────────────────── */
  var _path = window.location.pathname;
  var _activePage = 'home';
  if (_path.includes('/pages/tours'))              _activePage = 'tours';
  else if (_path.includes('/pages/package'))       _activePage = 'tours';
  else if (_path.includes('/pages/accommodations')) _activePage = 'accommodation';
  else if (_path.includes('/pages/contact'))       _activePage = 'contact';
  else if (_path.includes('index'))                _activePage = 'home';
  var _hash = window.location.hash;
  if (_hash === '#about')    _activePage = 'about';
  if (_hash === '#feedback') _activePage = 'contact';

  /* ── Fetch helper ───────────────────────────────────────── */
  function fetchComponent(url, callback) {
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(callback)
      .catch(function (err) {
        console.warn('[MCA] Component load failed:', url, err);
      });
  }

  /* ── Inject Navbar ──────────────────────────────────────── */
  function injectNavbar() {
    var placeholder = document.getElementById('navbar-placeholder');
    if (!placeholder) return;

    fetchComponent(_compDir + 'navbar.html', function (html) {
      // Replace base placeholder
      html = html.replace(/\{base\}/g, _base);

      placeholder.innerHTML = html;

      // Mark active link
      placeholder.querySelectorAll('.nav-links a[data-page]').forEach(function (a) {
        if (a.dataset.page === _activePage) {
          a.classList.add('active');
        }
      });
      placeholder.querySelectorAll('.mobile-nav-links a[data-page]').forEach(function (a) {
        if (a.dataset.page === _activePage) {
          a.classList.add('active');
        }
      });

      // Sticky navbar on scroll
      var navbar = document.getElementById('main-navbar');
      if (navbar) {
        window.addEventListener('scroll', function () {
          navbar.classList.toggle('scrolled', window.scrollY > 40);
        }, { passive: true });

        // Keep --header-h in sync with the actual navbar height so that
        // any sticky element using top:var(--header-h) sticks at the right offset.
        function syncHeaderHeight() {
          document.documentElement.style.setProperty(
            '--header-h', navbar.offsetHeight + 'px'
          );
        }
        syncHeaderHeight();
        if (typeof ResizeObserver !== 'undefined') {
          new ResizeObserver(syncHeaderHeight).observe(navbar);
        }
      }

      // Mobile nav toggle
      initMobileNav();

      // Signal that navbar is ready
      document.dispatchEvent(new CustomEvent('mcaNavReady'));
    });
  }

  /* ── Mobile Nav ─────────────────────────────────────────── */
  function initMobileNav() {
    var hamburger = document.getElementById('nav-hamburger');
    var mobileNav = document.getElementById('mobile-nav');
    var backdrop  = document.getElementById('mobile-nav-backdrop');
    var closeBtn  = document.getElementById('mobile-nav-close');

    if (!hamburger || !mobileNav) return;

    function openNav() {
      mobileNav.classList.add('open');
      backdrop.classList.add('visible');
      document.body.style.overflow = 'hidden';
      hamburger.setAttribute('aria-expanded', 'true');
      mobileNav.setAttribute('aria-hidden', 'false');
    }

    function closeNav() {
      mobileNav.classList.remove('open');
      backdrop.classList.remove('visible');
      document.body.style.overflow = '';
      hamburger.setAttribute('aria-expanded', 'false');
      mobileNav.setAttribute('aria-hidden', 'true');
    }

    hamburger.addEventListener('click', openNav);
    if (closeBtn)  closeBtn.addEventListener('click', closeNav);
    if (backdrop)  backdrop.addEventListener('click', closeNav);

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });

    // Mobile submenus
    document.querySelectorAll('.mobile-sub-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-target');
        var submenu  = document.getElementById(targetId);
        var isOpen   = !submenu.hidden;

        // Close all others
        document.querySelectorAll('.mobile-submenu').forEach(function (m) { m.hidden = true; });
        document.querySelectorAll('.mobile-sub-toggle').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });

        if (!isOpen) {
          submenu.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  /* ── Inject Footer ──────────────────────────────────────── */
  function injectFooter() {
    var placeholder = document.getElementById('footer-placeholder');
    if (!placeholder) return;

    fetchComponent(_compDir + 'footer.html', function (html) {
      html = html.replace(/\{base\}/g, _base);
      placeholder.innerHTML = html;

      // Update copyright year
      var yearEl = document.getElementById('footer-year');
      if (yearEl) yearEl.textContent = new Date().getFullYear();
    });
  }

  /* ── Inject Cookie Banner ───────────────────────────────── */
  function injectCookieBanner() {
    fetchComponent(_compDir + 'cookie-banner.html', function (html) {
      var wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      // Append banner + modal at the end of <body>
      while (wrapper.firstChild) {
        document.body.appendChild(wrapper.firstChild);
      }
      // Signal that cookie banner is ready
      document.dispatchEvent(new CustomEvent('mcaCookieReady'));
    });
  }

  /* ── Init on DOM ready ──────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      injectNavbar();
      injectFooter();
      injectCookieBanner();
    });
  } else {
    injectNavbar();
    injectFooter();
    injectCookieBanner();
  }

})();
