/**
 * MOZ CAMP ADVENTURES — data-loader.js
 * =====================================================
 * Loads tour and accommodation data from JSON files.
 * Provides rendering functions for all pages.
 * Handles WhatsApp booking on package detail page.
 * =====================================================
 */

(function () {
  'use strict';

  /* ── Constants ──────────────────────────────────────────── */
  var WA_PHONE = '258844406543';
  var WA_BASE  = 'https://wa.me/' + WA_PHONE + '?text=';

  /* ── Path resolution ────────────────────────────────────── */
  var _parts = window.location.pathname.split('/').filter(Boolean);
  if (_parts.length > 0 && _parts[_parts.length - 1].indexOf('.') > -1) { _parts.pop(); }
  var _base = _parts.length > 0 ? _parts.map(function () { return '..'; }).join('/') + '/' : '';

  /* ── Language detection ─────────────────────────────────── */
  var _lang = (window.location.pathname.indexOf('/en/') !== -1 ||
               window.location.pathname.startsWith('/en')) ? 'en' : 'pt';

  /* ── State ──────────────────────────────────────────────── */
  var MCA = { tours: [], accommodation: [] };
  var _ready = false;
  var _queue = [];

  /* ── Public API ─────────────────────────────────────────── */
  window.MCA = MCA;
  window.MCA_LANG = _lang;
  window.MCA_BASE = _base;

  /* ── Image path resolver ─────────────────────────────────
     JSON image paths are stored as '../assets/...' (depth-1).
     This normalises them to work at any depth using _base.
  ───────────────────────────────────────────────────────── */
  function resolveImg(src) {
    if (!src) return src;
    if (src.slice(0, 3) === '../') return _base + src.slice(3);
    return src;
  }
  window.resolveImg = resolveImg;

  window.mcaReady = function (cb) {
    if (_ready) { cb(MCA); return; }
    _queue.push(cb);
  };

  // Legacy alias
  window.PACKAGES_DATA = MCA;
  window._loadAllPackagesAsync = function (cb) { window.mcaReady(function () { cb(); }); };

  window.getPackageBySlug = function (slug) {
    return [].concat(MCA.tours, MCA.accommodation)
      .find(function (p) { return (p.slug || p.id) === slug; }) || null;
  };

  window.getPackageCategory = function (slug) {
    if (MCA.tours.find(function (p) { return (p.slug || p.id) === slug; })) return 'tour';
    if (MCA.accommodation.find(function (p) { return (p.slug || p.id) === slug; })) return 'accommodation';
    return null;
  };

  /* ── Load JSON ──────────────────────────────────────────── */
  function flush() {
    _ready = true;
    // Sync legacy alias
    window.PACKAGES_DATA.tours = MCA.tours;
    window.PACKAGES_DATA.accommodation = MCA.accommodation;
    _queue.forEach(function (cb) { cb(MCA); });
    _queue = [];
    // Signal that cards are in the DOM
    document.dispatchEvent(new CustomEvent('mcaCardsReady'));
  }

  function mergeEn(items, enMap) {
    return items.map(function (item) {
      var tr = enMap[item.id] || enMap[item.slug];
      return tr ? Object.assign({}, item, tr) : item;
    });
  }

  var fetches = [
    fetch(_base + 'data/tours.json').then(function (r) { return r.json(); }),
    fetch(_base + 'data/accommodations.json').then(function (r) { return r.json(); })
  ];
  if (_lang === 'en') {
    fetches.push(fetch(_base + 'data/en.json').then(function (r) { return r.json(); }));
  }

  Promise.all(fetches).then(function (results) {
    var tours  = results[0] || [];
    var accom  = results[1] || [];
    var enData = results[2] || null;
    if (_lang === 'en' && enData) {
      tours = mergeEn(tours, enData);
      accom = mergeEn(accom, enData);
    }
    MCA.tours         = tours;
    MCA.accommodation = accom;
    flush();
  }).catch(function (err) {
    console.error('[MCA] Data load failed:', err);
    flush();
  });

  /* ── Helpers ─────────────────────────────────────────────── */
  function stars(n) {
    n = n || 5;
    return '★'.repeat(n) + (n < 5 ? '☆'.repeat(5 - n) : '');
  }

  function fmt(n) {
    return Number(n).toLocaleString('pt-MZ') + ' MT';
  }

  /* ─────────────────────────────────────────────────────────
     TOUR CARD — used on tours.html and home page carousel
  ───────────────────────────────────────────────────────── */
  window.makeTourCard = function (pkg, animClass) {
    animClass = animClass || 'reveal-up';
    var slug = pkg.slug || pkg.id;
    var href = (_parts.length > 0 && _parts[_parts.length - 1] === 'pages' ? 'package.html' : 'pages/package.html') + '?id=' + slug;

    var col = document.createElement('div');
    col.className = 'col-md-4 reveal ' + animClass;
    col.innerHTML =
      '<div class="tour-card h-100">' +
        '<div class="tour-card-img-wrap">' +
          '<img src="' + resolveImg(pkg.image) + '" alt="' + pkg.name + '" loading="lazy">' +
          (pkg.badge ? '<div class="tour-card-badge">' + pkg.badge + '</div>' : '') +
        '</div>' +
        '<div class="tour-card-body">' +
          '<div class="tour-card-stars" data-pkg-id="' + slug + '"><span class="stars-text">' + stars(pkg.stars) + '</span><span class="review-count">(' + (pkg.reviewCount || 0) + ')</span></div>' +
          '<h5 class="tour-card-title">' + pkg.name + '</h5>' +
          '<div class="tour-card-meta">' +
            '<span><i class="bx bxs-map"></i> ' + (pkg.location || '') + '</span>' +
            (pkg.duration ? '<span><i class="bx bxs-time"></i> ' + pkg.duration + '</span>' : '') +
          '</div>' +
          '<p class="tour-card-desc">' + (pkg.description || '') + '</p>' +
          '<div class="tour-card-footer">' +
            '<div class="tour-card-price">' +
              '<span class="price-label">A partir de:</span>' +
              '<span class="price-amount">' + (pkg.price || '') + '</span>' +
              (pkg.priceOld ? '<span class="price-old">' + pkg.priceOld + '</span>' : '') +
            '</div>' +
            '<a href="' + href + '" class="btn-reserve">' + (_lang === 'en' ? 'Book Now' : 'Reservar') + ' <i class="bx bxs-right-arrow-circle"></i></a>' +
          '</div>' +
        '</div>' +
      '</div>';
    return col;
  };

  /* ─────────────────────────────────────────────────────────
     PACKAGE DETAIL PAGE
  ───────────────────────────────────────────────────────── */
  window.buildPackagePage = function (pkg) {
    if (!pkg) return;

    var slug = pkg.slug || pkg.id;
    var cat  = window.getPackageCategory(slug);
    var isAccom = cat === 'accommodation';

    /* Meta */
    document.title = pkg.name + ' | Moz Camp Adventures';
    var descMeta = document.getElementById('page-desc');
    if (descMeta) descMeta.setAttribute('content', pkg.description || '');

    /* Hero */
    var heroImg = document.getElementById('pkg-hero-img');
    if (heroImg) { heroImg.src = resolveImg((pkg.images && pkg.images[0]) || pkg.heroImage || pkg.image); heroImg.alt = pkg.name; }

    var badge = document.getElementById('pkg-badge');
    if (badge) badge.innerHTML = '<span class="pkg-hero-badge-pill"><i class="bx ' + (isAccom ? 'bxs-home-heart' : 'bxs-compass') + '"></i> ' + (isAccom ? (_lang === 'en' ? 'Accommodation' : 'Alojamento') : 'Tour') + '</span>';

    var titleEl = document.getElementById('pkg-title');
    if (titleEl) titleEl.textContent = pkg.name;
    var subEl = document.getElementById('pkg-subtitle');
    if (subEl) subEl.textContent = pkg.subtitle || '';

    var catEl = document.getElementById('breadcrumb-cat');
    if (catEl) catEl.innerHTML = '<a href="' + (isAccom ? 'accommodations.html' : 'tours.html') + '">' + (isAccom ? (_lang === 'en' ? 'Accommodations' : 'Alojamentos') : 'Tours') + '</a>';

    var nameEl = document.getElementById('breadcrumb-name');
    if (nameEl) nameEl.textContent = pkg.name;

    /* Hero meta bar */
    var metaEl = document.getElementById('pkg-hero-meta');
    if (metaEl) {
      var items = [
        { icon: 'bx bxs-map',    text: pkg.location },
        { icon: 'bx bxs-time',   text: pkg.duration }
      ];
      if (pkg.destinations) items.splice(2, 0, { icon: 'bx bxs-map-alt', text: pkg.destinations });
      metaEl.innerHTML = items.map(function (m) {
        return '<div class="pkg-hero-meta-item"><i class="' + m.icon + '"></i><span>' + m.text + '</span></div>';
      }).join('');
    }

    /* Gallery strip */
    buildGallery(pkg);

    /* Price block */
    var priceEl = document.getElementById('pkg-price-block');
    if (priceEl) {
      priceEl.innerHTML =
        '<div class="pkg-price-inner">' +
          '<div>' +
            '<span class="pkg-price-amount">' + (pkg.price || '') + '</span>' +
            (pkg.priceOld ? '<span class="pkg-price-old">' + pkg.priceOld + '</span>' : '') +
            '<span class="pkg-price-label"> / ' + (pkg.priceLabel || 'por pessoa') + '</span>' +
          '</div>' +
          '<div class="pkg-stars" data-pkg-id="' + slug + '">' + stars(pkg.stars) + '</div>' +
        '</div>' +
        (pkg.cancelPolicy ? '<div class="pkg-cancel-note"><i class="bx bxs-shield"></i> ' + (_lang === 'en' ? 'Free cancellation ' : 'Cancelamento gratuito ') + pkg.cancelPolicy + '</div>' : '');
    }

    /* Description */
    var descEl = document.getElementById('pkg-description');
    if (descEl) {
      (pkg.detailText || [pkg.description]).forEach(function (para) {
        var p = document.createElement('p');
        p.className = 'pkg-body-text';
        p.textContent = para;
        descEl.appendChild(p);
      });
    }

    /* Prices detail */
    if (pkg.priceChild) {
      var pricesSection = document.getElementById('pkg-prices-section');
      if (pricesSection) {
        pricesSection.style.display = '';
        var pricesEl = document.getElementById('pkg-prices-detail');
        if (pricesEl) {
          pricesEl.innerHTML =
            '<ul class="pkg-price-list">' +
              '<li><i class="bx bxs-user"></i> <strong>Adulto:</strong> ' + pkg.price + '</li>' +
              '<li><i class="bx bxs-user-plus"></i> <strong>' + (pkg.priceChildLabel || 'Crianças') + ':</strong> ' + pkg.priceChild + '</li>' +
            '</ul>';
        }
      }
    }

    /* Included / Excluded */
    var incExc = document.getElementById('pkg-inc-exc');
    if (incExc) {
      var html = '';
      (pkg.includes || []).forEach(function (item) { html += '<div class="pkg-inc-item"><i class="bx bx-check"></i><span>' + item + '</span></div>'; });
      (pkg.excludes || []).forEach(function (item) { html += '<div class="pkg-exc-item"><i class="bx bx-x"></i><span>' + item + '</span></div>'; });
      incExc.innerHTML = html;
    }

    /* Menu */
    if (pkg.menu && pkg.menu.length) {
      var menuSection = document.getElementById('pkg-menu-section');
      if (menuSection) {
        menuSection.style.display = '';
        var menuEl = document.getElementById('pkg-menu');
        if (menuEl) {
          var menuHtml = '';
          pkg.menu.forEach(function (block) {
            menuHtml += '<div class="menu-block"><div class="menu-block-title">' + block.title + '</div><div class="menu-categories-grid">';
            (block.categories || []).forEach(function (catItem) {
              menuHtml += '<div><div class="menu-category-name">' + catItem.name + '</div><ul class="menu-items">';
              (catItem.items || []).forEach(function (item) { menuHtml += '<li><i class="bx bxs-circle"></i> ' + item + '</li>'; });
              menuHtml += '</ul></div>';
            });
            menuHtml += '</div></div>';
          });
          menuEl.innerHTML = menuHtml;
        }
      }
    }

    /* Highlights */
    var hlEl = document.getElementById('pkg-highlights');
    if (hlEl) {
      (pkg.highlights || []).forEach(function (hl) {
        hlEl.innerHTML += '<li><i class="bx bxs-badge-check"></i> ' + hl + '</li>';
      });
    }

    /* Itinerary */
    var itiEl = document.getElementById('pkg-itinerary');
    if (itiEl) {
      (pkg.itinerary || []).forEach(function (step, i) {
        var isFirst = i === 0;
        itiEl.innerHTML +=
          '<div class="iti-item">' +
            '<div class="iti-header ' + (isFirst ? 'open' : '') + '" onclick="toggleItinerary(this)">' +
              '<div class="iti-badge">' + step.time + '</div>' +
              '<div class="iti-title">' + step.title + '</div>' +
              '<div class="iti-icon"><i class="bx bx-chevron-' + (isFirst ? 'up' : 'down') + '"></i></div>' +
            '</div>' +
            '<div class="iti-body' + (isFirst ? ' show' : '') + '">' +
              '<p>' + step.body + '</p>' +
              (step.checklist && step.checklist.length ? '<ul class="iti-checklist">' + step.checklist.map(function (c) { return '<li><i class="bx bx-check"></i> ' + c + '</li>'; }).join('') + '</ul>' : '') +
            '</div>' +
          '</div>';
      });
    }

    /* Important Information */
    if (pkg.importantInfo && pkg.importantInfo.length) {
      var impSection = document.getElementById('pkg-important-section');
      if (impSection) {
        impSection.style.display = '';
        var impEl = document.getElementById('pkg-important');
        if (impEl) {
          pkg.importantInfo.forEach(function (info) {
            impEl.innerHTML += '<li><i class="bx bxs-circle"></i> ' + info + '</li>';
          });
        }
      }
    }

    /* Booking sidebar */
    initBookingSidebar(pkg);

    /* Related packages — same category only */
    var allPkgs  = [].concat(MCA.tours, MCA.accommodation);
    var related  = allPkgs
      .filter(function (p) { return (p.slug || p.id) !== slug && p.category === pkg.category; })
      .slice(0, 3);
    var relEl = document.getElementById('pkg-related-list');
    if (relEl) {
      related.forEach(function (rp) {
        var rSlug = rp.slug || rp.id;
        relEl.innerHTML +=
          '<a href="package.html?id=' + rSlug + '" class="pkg-related-item">' +
            '<img src="' + resolveImg(rp.image) + '" alt="' + rp.name + '" loading="lazy">' +
            '<div class="pkg-related-info">' +
              '<div class="pkg-related-name">' + rp.name + '</div>' +
              '<div class="pkg-related-price">' + (rp.price || '') + '</div>' +
            '</div>' +
            '<i class="bx bx-right-arrow-circle"></i>' +
          '</a>';
      });
    }

    /* Scroll reveal */
    if (typeof revealOnScroll === 'function') revealOnScroll();

    /* Init extras section if package has extras (packages-extras.js) */
    if (pkg.extras && pkg.extras.length && typeof window._mcaInitExtras === 'function') {
      window._mcaInitExtras(pkg.extras);
    }

    /* Init private transfer section for beach-tour packages (packages-transfer.js) */
    if (pkg.category === 'beach-tours' && typeof window._mcaInitTransfer === 'function') {
      window._mcaInitTransfer(pkg.privateTransferOptions || null, _lang);
    }
  };

  /* ── Gallery ─────────────────────────────────────────────── */
  function buildGallery(pkg) {
    var stripEl = document.getElementById('pkg-gallery-strip');
    var src = pkg.images || pkg.gallery;
    if (!stripEl || !src || !src.length) return;

    var gallery = src.map(resolveImg);
    var current = 0;

    stripEl.innerHTML =
      '<div class="pkg-gallery-main" id="pkgMainWrap">' +
        '<img id="pkg-gallery-main-img" src="' + gallery[0] + '" alt="' + pkg.name + '" loading="eager">' +
        '<button class="pkg-gal-btn pkg-gal-prev" id="pkgGalPrev" aria-label="Imagem anterior"><i class="bx bx-chevron-left"></i></button>' +
        '<button class="pkg-gal-btn pkg-gal-next" id="pkgGalNext" aria-label="Próxima imagem"><i class="bx bx-chevron-right"></i></button>' +
        '<div class="pkg-gallery-count"><i class="bx bx-images"></i> ' + gallery.length + ' fotos</div>' +
      '</div>' +
      '<div class="pkg-thumb-grid" id="pkgThumbGrid">' +
        gallery.slice(0, 4).map(function (src, i) {
          return '<div class="pkg-thumb-item ' + (i === 0 ? 'active' : '') + '" data-idx="' + i + '" role="button" tabindex="0">' +
            '<img src="' + src + '" alt="' + pkg.name + ' ' + (i + 1) + '" loading="lazy">' +
            (i === 3 && gallery.length > 4 ? '<div class="pkg-thumb-more">+' + (gallery.length - 4) + '</div>' : '') +
            '</div>';
        }).join('') +
      '</div>';

    var mainImg = document.getElementById('pkg-gallery-main-img');
    if (mainImg) mainImg.style.transition = 'opacity .2s ease, transform .25s ease';

    function goTo(idx) {
      idx = ((idx % gallery.length) + gallery.length) % gallery.length;
      current = idx;
      if (mainImg) {
        mainImg.style.opacity = '0';
        mainImg.style.transform = 'scale(1.03)';
        setTimeout(function () {
          mainImg.src = gallery[idx];
          mainImg.style.opacity = '1';
          mainImg.style.transform = 'scale(1)';
        }, 180);
      }
      document.querySelectorAll('.pkg-thumb-item').forEach(function (t, i) {
        t.classList.toggle('active', i === idx || (idx >= 4 && i === 3));
      });
    }

    var prevBtn = document.getElementById('pkgGalPrev');
    var nextBtn = document.getElementById('pkgGalNext');
    if (prevBtn) prevBtn.addEventListener('click', function (e) { e.stopPropagation(); goTo(current - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function (e) { e.stopPropagation(); goTo(current + 1); });

    var thumbGrid = document.getElementById('pkgThumbGrid');
    if (thumbGrid) {
      thumbGrid.addEventListener('click', function (e) {
        var item = e.target.closest('.pkg-thumb-item');
        if (!item) return;
        var idx = parseInt(item.dataset.idx);
        if (idx === 3 && gallery.length > 4) {
          openLightbox(null, 3, gallery);
        } else {
          goTo(idx);
        }
      });
    }

    var mainWrap = document.getElementById('pkgMainWrap');
    if (mainWrap) {
      mainWrap.addEventListener('click', function (e) {
        if (prevBtn && prevBtn.contains(e.target)) return;
        if (nextBtn && nextBtn.contains(e.target)) return;
        openLightbox(null, current, gallery);
      });

      // Swipe
      var tx = 0;
      mainWrap.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
      mainWrap.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - tx;
        if (Math.abs(dx) > 40) goTo(current + (dx < 0 ? 1 : -1));
      }, { passive: true });
    }
  }

  /* ── Lightbox (used by package + accommodations pages) ───── */
  var _lbImages = [];
  var _lbIndex  = 0;

  window.openLightbox = function (_el, index, images) {
    if (images) {
      _lbImages = images;
    } else {
      var items = document.querySelectorAll('.gallery-item img');
      _lbImages = Array.from(items).map(function (img) { return img.src; });
    }
    _lbIndex = index !== undefined ? index : 0;
    _updateLightbox();
    var lb = document.getElementById('lightbox');
    if (lb) { lb.classList.add('open'); document.body.style.overflow = 'hidden'; }
  };

  window.lightboxNav = function (dir) {
    _lbIndex = (_lbIndex + dir + _lbImages.length) % _lbImages.length;
    _updateLightbox();
  };

  window.closeLightbox = function () {
    var lb = document.getElementById('lightbox');
    if (lb) { lb.classList.remove('open'); document.body.style.overflow = ''; }
  };

  function _updateLightbox() {
    var img  = document.getElementById('lightbox-img');
    var prev = document.getElementById('lightbox-prev');
    var next = document.getElementById('lightbox-next');
    if (img)  img.src = _lbImages[_lbIndex] || '';
    if (prev) prev.style.display = _lbImages.length > 1 ? 'flex' : 'none';
    if (next) next.style.display = _lbImages.length > 1 ? 'flex' : 'none';
  }

  document.addEventListener('keydown', function (e) {
    var lb = document.getElementById('lightbox');
    if (!lb || !lb.classList.contains('open')) return;
    if (e.key === 'Escape')     window.closeLightbox();
    if (e.key === 'ArrowLeft')  window.lightboxNav(-1);
    if (e.key === 'ArrowRight') window.lightboxNav(1);
  });

  document.addEventListener('click', function (e) {
    var lb = document.getElementById('lightbox');
    if (lb && e.target === lb) window.closeLightbox();
  });

  /* ── Booking Sidebar (package detail) ────────────────────── */
  var _priceAdult   = 0;
  var _priceChild   = 0;
  var _adults       = 1;
  var _children     = 0;
  var _pkgNameGlobal = '';

  function initBookingSidebar(pkg) {
    _priceAdult    = pkg.price_from || 0;
    _priceChild    = pkg.price_child || 0;
    _pkgNameGlobal = pkg.name || '';

    /* Show child row if child price exists */
    if (_priceChild) {
      var childRow = document.getElementById('book-child-row');
      if (childRow) childRow.style.display = '';
      var childLabel = document.getElementById('book-child-label');
      if (childLabel) childLabel.textContent = pkg.priceChildLabel || 'Crianças (4–10 anos)';
    }

    /* Set min date to today */
    var dateInput = document.getElementById('book-date');
    if (dateInput) {
      var today = new Date().toISOString().split('T')[0];
      dateInput.min = today;
      dateInput.addEventListener('change', updateWhatsAppLink);
    }

    updateBookingTotal();
  }

  window.bookAdjust = function (type, delta) {
    if (type === 'adults') {
      _adults = Math.max(1, Math.min(20, _adults + delta));
      var el = document.getElementById('book-adults-val');
      if (el) el.textContent = _adults;
    } else {
      _children = Math.max(0, Math.min(10, _children + delta));
      var el2 = document.getElementById('book-children-val');
      if (el2) el2.textContent = _children;
    }
    updateBookingTotal();
  };

  function updateBookingTotal() {
    var adultTotal    = _adults * _priceAdult;
    var childTotal    = _children * _priceChild;
    var extrasTotal   = window._mcaExtrasTotal   || 0;
    var transferTotal = window._mcaTransferTotal || 0;
    var total         = adultTotal + childTotal + extrasTotal + transferTotal;

    var elAd = document.getElementById('bps-adults');      if (elAd) elAd.textContent = _adults;
    var elAT = document.getElementById('bps-adult-total'); if (elAT) elAT.textContent = fmt(adultTotal);
    var elCh = document.getElementById('bps-children');    if (elCh) elCh.textContent = _children;
    var elCT = document.getElementById('bps-child-total'); if (elCT) elCT.textContent = fmt(childTotal);
    var elCR = document.getElementById('bps-child-row');   if (elCR) elCR.style.display = _children > 0 ? '' : 'none';

    /* Extras row */
    var extRow   = document.getElementById('bps-extras-row');
    var extTotEl = document.getElementById('bps-extras-total');
    if (extRow)   extRow.style.display = extrasTotal > 0 ? '' : 'none';
    if (extTotEl) extTotEl.textContent  = '+' + fmt(extrasTotal);

    /* Transfer row */
    var tfrRow   = document.getElementById('bps-transfer-row');
    var tfrLabel = document.getElementById('bps-transfer-label');
    var tfrTotEl = document.getElementById('bps-transfer-total');
    if (tfrRow)   tfrRow.style.display  = transferTotal > 0 ? '' : 'none';
    if (tfrLabel) tfrLabel.textContent  = window._mcaTransferLabel || (_lang === 'en' ? 'Private Transfer' : 'Transporte Privado');
    if (tfrTotEl) tfrTotEl.textContent  = '+' + fmt(transferTotal);

    var elTo = document.getElementById('bps-total');       if (elTo) elTo.textContent = fmt(total);

    /* Update mobile bar price */
    var mobilePrice = document.getElementById('mob-book-price');
    if (mobilePrice && _priceAdult) mobilePrice.textContent = fmt(_priceAdult) + '/pax';

    updateWhatsAppLink();
  }

  function updateWhatsAppLink() {
    var dateEl = document.getElementById('book-date');
    var dateVal = dateEl ? dateEl.value : '';
    var dateFmt = '';
    if (dateVal) {
      try {
        dateFmt = new Date(dateVal + 'T00:00:00').toLocaleDateString('pt-MZ', { day: 'numeric', month: 'long', year: 'numeric' });
      } catch (e) { dateFmt = dateVal; }
    }

    var nameVal  = (document.getElementById('wa-name')  || {}).value || '';
    var phoneVal = (document.getElementById('wa-phone') || {}).value || '';

    var adultTotal    = _adults * _priceAdult;
    var childTotal    = _children * _priceChild;
    var extrasTotal   = window._mcaExtrasTotal   || 0;
    var extrasSummary = window._mcaExtrasSummary || '';
    var transferTotal = window._mcaTransferTotal || 0;
    var transferLabel = window._mcaTransferLabel || '';
    var total         = adultTotal + childTotal + extrasTotal + transferTotal;

    var msg = _lang === 'en'
      ? 'Hello Moz Camp Adventures 👋\n\n' +
        'I would like to book the following:\n\n' +
        'Package: ' + _pkgNameGlobal + '\n' +
        (nameVal  ? 'Name: '  + nameVal  + '\n' : '') +
        (phoneVal ? 'Phone: ' + phoneVal + '\n' : '') +
        (dateFmt  ? 'Date: '  + dateFmt  + '\n' : '') +
        '\nParticipants:\n' +
        'Adults: '   + _adults   + ' × ' + fmt(_priceAdult) + ' = ' + fmt(adultTotal) + '\n' +
        (_priceChild ? 'Children: ' + _children + ' × ' + fmt(_priceChild) + ' = ' + fmt(childTotal) + '\n' : '') +
        (extrasTotal > 0 ? '\nCustomisations:\n' + extrasSummary + '\n' : '') +
        (transferTotal > 0 ? '\nPrivate Transfer: ' + transferLabel + ' = ' + fmt(transferTotal) + '\n' : '') +
        '\nEstimated total: ' + fmt(total) + '\n\n' +
        'Please confirm availability.'
      : 'Olá Moz Camp Adventures 👋\n\n' +
        'Gostaria de reservar o seguinte tour:\n\n' +
        'Tour: ' + _pkgNameGlobal + '\n' +
        (nameVal  ? 'Nome: '     + nameVal  + '\n' : '') +
        (phoneVal ? 'Telefone: ' + phoneVal + '\n' : '') +
        (dateFmt  ? 'Data: '     + dateFmt  + '\n' : '') +
        '\nParticipantes:\n' +
        'Adultos: ' + _adults + ' × ' + fmt(_priceAdult) + ' = ' + fmt(adultTotal) + '\n' +
        (_priceChild ? 'Crianças: ' + _children + ' × ' + fmt(_priceChild) + ' = ' + fmt(childTotal) + '\n' : '') +
        (extrasTotal > 0 ? '\nPersonalizações:\n' + extrasSummary + '\n' : '') +
        (transferTotal > 0 ? '\nTransporte Privado: ' + transferLabel + ' = ' + fmt(transferTotal) + '\n' : '') +
        '\nTotal estimado: ' + fmt(total) + '\n\n' +
        'Por favor, confirme a disponibilidade.';

    var url = WA_BASE + encodeURIComponent(msg);

    ['book-wa-btn', 'mob-book-btn'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.href = url;
    });
  }

  /* ── Itinerary accordion (global) ────────────────────────── */
  window.toggleItinerary = function (header) {
    var body   = header.nextElementSibling;
    var isOpen = header.classList.contains('open');

    document.querySelectorAll('.iti-header').forEach(function (h) {
      h.classList.remove('open');
      h.nextElementSibling.classList.remove('show');
      h.querySelector('.iti-icon i').className = 'bx bx-chevron-down';
    });

    if (!isOpen) {
      header.classList.add('open');
      body.classList.add('show');
      header.querySelector('.iti-icon i').className = 'bx bx-chevron-up';
    }
  };

  /* ── Video modal stop on close ───────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    var videoModal = document.getElementById('videoModal');
    var modalVideo = document.getElementById('modalVideo');
    if (videoModal && modalVideo) {
      videoModal.addEventListener('hidden.bs.modal', function () {
        modalVideo.pause();
        modalVideo.currentTime = 0;
      });
    }
  });

})();
