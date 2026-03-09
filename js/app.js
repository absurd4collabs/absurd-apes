/**
 * Project dashboard — config-driven template for NFT/token projects.
 * All project-specific copy and URLs come from window.ABSURD_APES_CONFIG (js/config.js).
 */

(function () {
  'use strict';

  const BREAKPOINT = 900;
  const CONFIG = window.ABSURD_APES_CONFIG || { holderPortalUrl: '', endpoints: {}, discordConnectUrl: '' };
  const BASE_PATH = '';
  const PORTAL_URL = (CONFIG.holderPortalUrl || '').replace(/\/$/, '');
  const HOLDINGS_ENDPOINT = PORTAL_URL && CONFIG.endpoints?.holdings ? PORTAL_URL + CONFIG.endpoints.holdings : '';

  // ----- Apply project config to DOM (template: brand, hero, token, footer, etc.) -----
  function applyProjectConfig() {
    var c = CONFIG;
    var projectName = c.projectName || 'Project';
    var logoUrl = c.logoUrl || 'assets/logo.png';
    var social = c.social || {};
    var token = c.token || {};
    var hero = c.hero || {};
    var tokenSymbol = (token.symbol || 'Token').toUpperCase();

    document.title = projectName + ' — NFT & Token';

    // Hero
    var heroTitle = document.getElementById('hero-title');
    var heroTitleInner = document.getElementById('hero-title-inner');
    if (heroTitleInner) heroTitleInner.textContent = hero.title || projectName;
    var heroTagline = document.getElementById('hero-tagline');
    if (heroTagline) heroTagline.textContent = hero.tagline || '';
    var heroSub = document.getElementById('hero-subtitle');
    if (heroSub && hero.subtitle) {
      if (/\s+Solana\.?\s*$/i.test(hero.subtitle)) {
        var solanaUrl = hero.solanaLogoUrl || 'https://cryptologos.cc/logos/solana-sol-logo.svg?v=040';
        var beforeSolana = hero.subtitle.replace(/\s+Solana\.?\s*$/i, '');
        heroSub.innerHTML = beforeSolana + ' <img src="' + solanaUrl + '" alt="" class="hero-home__solana-icon" width="20" height="20"> Solana.';
      } else if (hero.subtitle.indexOf('<') !== -1) {
        heroSub.innerHTML = hero.subtitle;
      } else {
        heroSub.textContent = hero.subtitle;
      }
    }

    // Dashboard brand
    var dashTitle = document.querySelector('.dashboard__title');
    if (dashTitle) dashTitle.textContent = projectName;
    var dashLogos = document.querySelectorAll('.dashboard__logo-img, .footer__logo');
    dashLogos.forEach(function (img) { if (img && logoUrl) img.src = logoUrl; });
    var logoAlt = document.querySelector('.dashboard__logo-img');
    if (logoAlt) logoAlt.alt = projectName;

    // Token section only: logo img (menu uses CSS mask icon)
    var sectionThumbs = document.querySelectorAll('.section__thumb, .panel__thumb');
    sectionThumbs.forEach(function (img) { if (img && token.logoUrl) img.src = token.logoUrl; });
    var tokenLabels = document.querySelectorAll('[data-config="token-label"]');
    var tokenLabelText = (token.navLabel != null && token.navLabel !== '') ? token.navLabel : tokenSymbol;
    tokenLabels.forEach(function (el) { el.textContent = tokenLabelText; });

    // Token section: token address, Solana logo, DEXTools + Solscan links
    var contractEl = document.getElementById('tokenomics-contract');
    if (contractEl && c.tokenMint) contractEl.textContent = c.tokenMint;
    var solanaLogoEl = document.getElementById('tokenomics-solana-logo');
    if (solanaLogoEl) solanaLogoEl.src = hero.solanaLogoUrl || 'https://cryptologos.cc/logos/solana-sol-logo.svg?v=040';
    var dextoolsLink = document.getElementById('tokenomics-dextools-link');
    if (dextoolsLink && c.tokenDextoolsPairUrl) dextoolsLink.href = c.tokenDextoolsPairUrl;
    var birdeyeLink = document.getElementById('tokenomics-birdeye-link');
    if (birdeyeLink) birdeyeLink.href = c.tokenBirdeyeUrl || ('https://birdeye.so/solana/token/' + (c.tokenMint || ''));
    var solscanLink = document.getElementById('tokenomics-solscan-link');
    if (solscanLink && c.tokenMint) solscanLink.href = 'https://solscan.io/token/' + c.tokenMint;

    // Social links (sticky + footer)
    var socialXEls = document.querySelectorAll('[data-config="social-x"], .footer__link-x');
    socialXEls.forEach(function (a) { if (social.x) a.href = social.x; });
    var socialDiscordEls = document.querySelectorAll('[data-config="social-discord"], .footer__link-discord');
    socialDiscordEls.forEach(function (a) { if (social.discord) a.href = social.discord; });

    // Token section
    var tokenPriceLabel = document.getElementById('tokenomics-price-label');
    if (tokenPriceLabel && token.priceLabel) tokenPriceLabel.textContent = token.priceLabel;
    var tokenChartLabel = document.getElementById('tokenomics-chart-label');
    if (tokenChartLabel && token.chartLabel) tokenChartLabel.textContent = token.chartLabel;
    var tokenSummary = document.getElementById('tokenomics-summary-text');
    if (tokenSummary && token.summaryText) tokenSummary.textContent = token.summaryText;

    // Optional shop link (sidebar)
    var shopUrl = c.shopUrl;
    var shopLink = document.querySelector('[data-config="shop-link"]');
    if (shopLink) {
      if (shopUrl) { shopLink.href = shopUrl; shopLink.style.display = ''; }
      else { shopLink.style.display = 'none'; }
    }

    // Footer
    var footerCopyText = document.getElementById('footer-copy-text');
    if (footerCopyText) footerCopyText.textContent = c.footerCopy || projectName;

    // X spaces
    var xSpacesLead = document.getElementById('x-spaces-lead');
    if (xSpacesLead) xSpacesLead.textContent = c.xSpacesLead || 'Tune in to our weekly X space...';
    var xSpacesTime = document.getElementById('x-spaces-time');
    if (xSpacesTime) xSpacesTime.textContent = c.xSpacesTime || 'Tuesdays @ 2pm est';
    var xSpacesHosts = document.getElementById('x-spaces-hosts');
    if (xSpacesHosts && c.xSpacesHosts && c.xSpacesHosts.length) {
      var hostLinks = c.xSpacesHosts.map(function (h) {
        return '<a href="' + (h.url || '#') + '" target="_blank" rel="noopener" class="x-spaces__link">' + (h.label || '') + '</a>';
      });
      xSpacesHosts.innerHTML = hostLinks.length === 2
        ? 'Hosted by ' + hostLinks[0] + '<br>with co-host ' + hostLinks[1]
        : 'Hosted by ' + hostLinks.join(' and ');
    }
    var xSpacesTagline = document.getElementById('x-spaces-tagline');
    if (xSpacesTagline && c.xSpacesTagline) xSpacesTagline.innerHTML = '"' + c.xSpacesTagline + '"';
    // Partners
    var partnersLead = document.getElementById('partners-lead');
    if (partnersLead) partnersLead.textContent = c.partnersLead || 'Partners.';
    var partnersGrid = document.getElementById('partners-grid');
    if (partnersGrid && c.partners && c.partners.length) {
      partnersGrid.innerHTML = c.partners.map(function (p) {
        return '<div class="partners__item"><img src="' + (p.logo || '') + '" alt="' + (p.name || '') + '" class="partners__logo" loading="lazy"><span class="partners__name">' + (p.name || '') + '</span></div>';
      }).join('');
    }

    // Utilities (Lunarverse, GOTM Labz cards)
    var utilitiesLead = document.getElementById('utilities-lead');
    if (utilitiesLead && c.utilitiesLead) utilitiesLead.textContent = c.utilitiesLead;
    var utilitiesGrid = document.getElementById('utilities-grid');
    if (utilitiesGrid && c.utilities && c.utilities.length) {
      utilitiesGrid.innerHTML = c.utilities.map(function (u) {
        if (u.url) {
          return '<a href="' + escapeHtml(u.url) + '" class="card card--lunarverse" target="_blank" rel="noopener">' +
            '<div class="card__bg"></div>' +
            '<div class="card__lunarverse-content">' +
              '<h3 class="card__title">' + escapeHtml(u.name || '') + '</h3>' +
              '<p class="card__text">' + escapeHtml(u.description || '') + '</p>' +
              '<span class="btn btn--primary">Visit</span>' +
            '</div></a>';
        }
        if (u.links && u.links.length) {
          var buttonsHtml = u.links.map(function (l) {
            return '<a href="' + escapeHtml(l.url || '#') + '" class="btn btn--outline" target="_blank" rel="noopener">' + escapeHtml(l.label || '') + '</a>';
          }).join('');
          return '<div class="card card--gotm">' +
            '<div class="card__bg"></div>' +
            '<div class="card__gotm-content">' +
              '<h3 class="card__title">' + escapeHtml(u.name || '') + '</h3>' +
              '<p class="card__text">' + escapeHtml(u.description || '') + '</p>' +
              '<div class="card__gotm-buttons">' + buttonsHtml + '</div>' +
            '</div></div>';
        }
        return '';
      }).join('');
    }

    // Holders labels (sidebar + mobile panel key labels)
    var labels = c.holdingsLabels || {};
    ['token', 'absurdApes', 'col2', 'totalNfts'].forEach(function (key) {
      if (!labels[key]) return;
      document.querySelectorAll('[data-holdings-key="' + key + '"]').forEach(function (el) {
        el.textContent = labels[key];
      });
    });
    var holdersLead = document.getElementById('holders-lead');
    if (holdersLead && c.holdersLead) holdersLead.textContent = c.holdersLead;
    var sortOpts = c.holdersSortOptions || {};
    var sortToken = document.querySelector('#holders-sort option[value="token"]');
    if (sortToken && sortOpts.token) sortToken.textContent = sortOpts.token;
    var sortAbsurdApes = document.querySelector('#holders-sort option[value="absurdApes"]');
    if (sortAbsurdApes && sortOpts.absurdApes) sortAbsurdApes.textContent = sortOpts.absurdApes;
    var thToken = document.querySelector('.holders-table th[data-col="token"]');
    if (thToken && labels.token) thToken.textContent = labels.token;
    var thAbsurdApes = document.querySelector('.holders-table th[data-col="absurdApes"]');
    if (thAbsurdApes && labels.absurdApes) thAbsurdApes.textContent = labels.absurdApes;
  }
  applyProjectConfig();

  // ----- Client-side route: home vs raffles (no full reload, dashboard stays) -----
  function getRoute() {
    var path = window.location.pathname.replace(/\/$/, '') || '/';
    return path === '/raffles' ? 'raffles' : 'home';
  }
  var mainHome = document.getElementById('main-home');
  var mainRaffles = document.getElementById('main-raffles');
  var routeLinks = document.querySelectorAll('[data-route="home"], [data-route="raffles"]');

  function setRouteActive(route) {
    routeLinks.forEach(function (link) {
      var isActive = link.getAttribute('data-route') === route;
      link.classList.toggle('dashboard__link--active', isActive);
      link.classList.toggle('dashboard-bottom__item--active', isActive);
      link.setAttribute('aria-current', isActive && route === 'raffles' ? 'page' : 'false');
    });
  }

  function showView(route) {
    if (mainHome) mainHome.hidden = route !== 'home';
    if (mainRaffles) mainRaffles.hidden = route !== 'raffles';
    setRouteActive(route);
    if (route === 'raffles' && typeof window.initRafflesPage === 'function') window.initRafflesPage();
    if (route === 'home') setActiveSection(getSectionIdFromHash());
    else {
      navLinks.forEach(function (link) {
        link.classList.remove('dashboard__link--active', 'dashboard-bottom__item--active');
      });
    }
  }

  routeLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      var href = link.getAttribute('href');
      if (!href || href === '#' || link.target === '_blank') return;
      var path = href.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
      if (path === '/raffles' || path === '/') {
        e.preventDefault();
        history.pushState(null, '', href);
        showView(getRoute());
      }
    });
  });
  window.addEventListener('popstate', function () { showView(getRoute()); });

  // ----- Section highlighting (home view only) -----
  const navLinks = document.querySelectorAll('[data-section]');
  const sections = document.querySelectorAll('.section');
  var navScrollInProgress = false;
  var navScrollTargetId = null;

  function setActiveSection(sectionId) {
    navLinks.forEach(function (link) {
      const id = link.getAttribute('data-section');
      link.classList.toggle('dashboard__link--active', id === sectionId);
      link.classList.toggle('dashboard-bottom__item--active', id === sectionId);
    });
  }

  function getSectionIdFromHash() {
    const hash = window.location.hash.slice(1);
    return hash || 'home';
  }

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    navScrollInProgress = true;
    navScrollTargetId = id;
    var base = (window.location.pathname || '/').replace(/\/$/, '') || '/';
    window.history.replaceState(null, '', base + '#' + id);
    setActiveSection(id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function () {
      navScrollInProgress = false;
      navScrollTargetId = null;
    }, 1200);
  }

  navLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      const sectionId = link.getAttribute('data-section');
      if (sectionId && link.getAttribute('href')?.startsWith('#')) {
        e.preventDefault();
        if (getRoute() === 'raffles') {
          history.pushState(null, '', '/#' + sectionId);
          showView('home');
        }
        scrollToSection(sectionId);
      }
    });
  });

  window.addEventListener('hashchange', function () {
    if (getRoute() !== 'home') return;
    if (!navScrollInProgress) setActiveSection(getSectionIdFromHash());
  });

  const observer = new IntersectionObserver(
    function (entries) {
      if (getRoute() !== 'home' || navScrollInProgress) return;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        if (id) {
          setActiveSection(id);
          if (window.location.hash !== '#' + id) {
            window.history.replaceState(null, '', (window.location.pathname || '/') + '#' + id);
          }
        }
      });
    },
    { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
  );
  sections.forEach(function (section) {
    if (section.id) observer.observe(section);
  });

  showView(getRoute());

  // ----- Hero scroll animations (tagline moves left, body moves right and up) -----
  (function () {
    var heroSection = document.getElementById('home');
    var heroTagline = document.getElementById('hero-tagline');
    var heroContent = document.querySelector('.hero-home__content');
    var headerTitle = document.getElementById('hero-title');
    if (!heroSection || !heroTagline || !heroContent) return;

    var taglineMoveLeft = 400;
    var taglineMoveDown = 200;
    var bodyMoveRight = 280;
    var bodyMoveUp = 140;
    var taglineBaseTopPx = null;

    function getScrollRoot() {
      var el = heroSection;
      while (el && el !== document.body) {
        var style = window.getComputedStyle(el);
        var overflow = (style.overflowY || style.overflow || '') + (style.overflowX || '');
        if (/(auto|scroll|overlay)/.test(overflow)) return el;
        el = el.parentElement;
      }
      return window;
    }

    function tick() {
      if (getRoute() !== 'home' || !heroSection.isConnected) {
        if (headerTitle) headerTitle.style.opacity = '';
        return;
      }
      var rect = heroSection.getBoundingClientRect();
      var h = rect.height;
      var top = rect.top;
      var progress = top <= 0 ? Math.min(1, -top / h) : 0;
      var txTag = -progress * taglineMoveLeft;
      var tyTag = progress * taglineMoveDown;
      var txBody = progress * bodyMoveRight;
      var tyBody = -progress * bodyMoveUp;
      if (taglineBaseTopPx == null && progress === 0) {
        taglineBaseTopPx = heroTagline.getBoundingClientRect().top;
      }
      if (taglineBaseTopPx != null) {
        heroTagline.style.top = (taglineBaseTopPx + tyTag) + 'px';
        heroTagline.style.visibility = rect.bottom < 0 ? 'hidden' : 'visible';
      }
      heroTagline.style.transform = 'translateX(' + txTag + 'px)';
      heroContent.style.transform = 'translate3d(' + txBody + 'px, ' + tyBody + 'px, 0)';
      heroContent.style.setProperty('--last-line-scale', 1 + Math.pow(progress, 0.6) * 2.2);
      if (headerTitle) {
        headerTitle.style.opacity = progress < 0.75 ? '1' : String(1 - (progress - 0.75) / 0.25);
        headerTitle.style.pointerEvents = progress >= 0.75 ? 'none' : '';
      }
      heroTagline.style.opacity = progress < 0.75 ? '1' : String(1 - (progress - 0.75) / 0.25);
      heroTagline.style.pointerEvents = progress >= 0.75 ? 'none' : '';
    }

    var ticking = false;
    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(function () {
          tick();
          ticking = false;
        });
        ticking = true;
      }
    }

    var scrollRoot = getScrollRoot();
    if (scrollRoot === window) {
      window.addEventListener('scroll', onScroll, { passive: true });
    } else {
      scrollRoot.addEventListener('scroll', onScroll, { passive: true });
    }
    window.addEventListener('resize', tick);
    tick();
  })();

  // ----- Horizons section: arrow moves down with scroll -----
  (function () {
    var section = document.getElementById('horizons');
    if (!section) return;

    function updateHorizonsScroll() {
      var rect = section.getBoundingClientRect();
      var vh = window.innerHeight;
      var progress;
      /* Section not laid out => arrow at top */
      if (rect.height <= 0) {
        progress = 0;
      } else if (rect.bottom >= vh) {
        /* Section not yet scrolled into view (bottom still at/below viewport); full-width load => arrow at top */
        progress = 0;
      } else if (rect.top <= 0) {
        /* Section above viewport => arrow at bottom */
        progress = 1;
      } else if (rect.height >= vh) {
        var travel = rect.height - vh;
        progress = 1 + rect.top / travel;
        progress = Math.max(0, Math.min(1, progress));
      } else {
        progress = (vh - rect.bottom) / (vh - rect.height);
        progress = Math.max(0, Math.min(1, progress));
      }
      section.style.setProperty('--horizons-scroll', String(progress));
    }

    var ticking = false;
    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(function () {
          updateHorizonsScroll();
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateHorizonsScroll);
    /* Class .horizons--arrow-at-top in HTML keeps arrow at top until we remove it here (no variable/cache issues) */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        section.classList.remove('horizons--arrow-at-top');
        updateHorizonsScroll();
      });
    });
  })();

  // ----- Wallet (Solana) -----
  function getDetectedWallets() {
    var list = [];
    // Phantom: check window.solana first (Firefox sometimes only has this), then window.phantom.solana
    if (window.solana?.isPhantom) {
      list.push({ name: 'Phantom', provider: window.solana });
    }
    if (window.phantom?.solana?.isPhantom && !list.some(function (w) { return w.provider === window.phantom.solana; })) {
      list.push({ name: 'Phantom', provider: window.phantom.solana });
    }
    if (window.solflare?.isSolflare) {
      list.push({ name: 'Solflare', provider: window.solflare });
    }
    if (window.solana && !list.some(function (w) { return w.provider === window.solana; })) {
      var label = window.solana.isPhantom ? 'Phantom' : window.solana.isSolflare ? 'Solflare' : 'Solana';
      list.push({ name: label, provider: window.solana });
    }
    return list;
  }

  function getSolanaProvider() {
    var wallets = getDetectedWallets();
    var connected = wallets.filter(function (w) { return w.provider.publicKey; });
    if (connected.length) return connected[0].provider;
    if (wallets.length) return wallets[0].provider;
    return null;
  }

  function getWalletPublicKey() {
    var provider = getSolanaProvider();
    return provider && provider.publicKey ? provider.publicKey.toString() : null;
  }
  window.getWalletPublicKey = getWalletPublicKey;
  window.getSolanaProvider = getSolanaProvider;

  function isWalletConnected() {
    return !!getWalletPublicKey();
  }

  function setWalletConnected(connected) {
    document.body.classList.toggle('wallet-connected', connected);
    var label = connected ? 'Connected' : 'Connect';
    document.querySelectorAll('#btn-connect-wallet, #btn-connect-wallet-mobile').forEach(function (btn) {
      if (!btn) return;
      var textEl = btn.querySelector('.btn__text');
      if (textEl) textEl.textContent = label; else btn.textContent = label;
    });
    if (typeof syncVerifyModalState === 'function') syncVerifyModalState();
    if (connected && document.getElementById('main-raffles') && !document.getElementById('main-raffles').hidden && typeof window.initRafflesPage === 'function') window.initRafflesPage();
  }

  function connectWithProvider(provider) {
    return provider.connect({ onlyIfTrusted: false })
      .then(function () {
        setWalletConnected(true);
        hideHoldings();
        if (typeof linkWalletToDiscord === 'function') {
          var w = getWalletPublicKey();
          if (w) linkWalletToDiscord(w);
        }
      })
      .catch(function (err) {
        if (err.code !== 4001) console.warn('Wallet connect error', err);
        throw err;
      });
  }

  var walletPicker = document.getElementById('wallet-picker');
  var walletPickerBackdrop = document.getElementById('wallet-picker-backdrop');
  var walletPickerClose = document.getElementById('wallet-picker-close');
  var walletPickerList = document.getElementById('wallet-picker-list');

  function openWalletPicker() {
    if (!walletPicker || !walletPickerList) return Promise.reject();
    return new Promise(function (resolve, reject) {
      function renderWallets(wallets) {
        walletPickerList.innerHTML = '';
        wallets.forEach(function (w) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'wallet-picker__btn';
          btn.textContent = w.name;
          btn.addEventListener('click', function () {
            closeWalletPicker();
            connectWithProvider(w.provider)
              .then(function () {
                if (walletPicker._resolve) walletPicker._resolve();
                walletPicker._resolve = null;
              })
              .catch(function () {});
          });
          walletPickerList.appendChild(btn);
        });
        walletPicker.setAttribute('aria-hidden', 'false');
        walletPicker._resolve = resolve;
      }
      function done(wallets) {
        if (wallets.length) {
          renderWallets(wallets);
        } else {
          walletPicker.setAttribute('aria-hidden', 'true');
          alert('No Solana wallet extension detected. Install or enable Phantom, Solflare, or another Solana wallet in this browser.');
          reject(new Error('No provider'));
        }
      }
      walletPicker.setAttribute('aria-hidden', 'false');
      walletPickerList.innerHTML = '<p class="wallet-picker__detecting">Detecting wallets…</p>';
      walletPicker._resolve = resolve;
      var delays = [100, 400, 900, 1600];
      var idx = 0;
      function check() {
        var wallets = getDetectedWallets();
        if (wallets.length) {
          renderWallets(wallets);
          return;
        }
        idx++;
        if (idx < delays.length) {
          setTimeout(check, delays[idx] - delays[idx - 1]);
        } else {
          done(wallets);
        }
      }
      setTimeout(check, delays[0]);
    });
  }

  function closeWalletPicker() {
    if (walletPicker) walletPicker.setAttribute('aria-hidden', 'true');
    if (walletPicker && walletPicker._resolve) {
      walletPicker._resolve();
      walletPicker._resolve = null;
    }
  }

  function connectWallet() {
    return openWalletPicker();
  }

  (function initWalletListener() {
    getDetectedWallets().forEach(function (w) {
      if (w.provider && typeof w.provider.on === 'function') {
        w.provider.on('accountChanged', function (pk) {
          if (pk) {
            setWalletConnected(true);
            if (typeof linkWalletToDiscord === 'function') linkWalletToDiscord(getWalletPublicKey());
          } else {
            setWalletConnected(false);
          }
          hideHoldings();
        });
      }
    });
    if (getWalletPublicKey()) setWalletConnected(true);
  })();

  document.getElementById('btn-connect-wallet')?.addEventListener('click', connectWallet);
  document.getElementById('btn-connect-wallet-mobile')?.addEventListener('click', connectWallet);
  walletPickerBackdrop?.addEventListener('click', closeWalletPicker);
  walletPickerClose?.addEventListener('click', closeWalletPicker);

  // ----- Holdings UI -----
  const holdingsPanels = document.querySelectorAll('.holdings');

  function showHoldings(data) {
    var tokenVal = data && data.tokenFormatted != null ? data.tokenFormatted : (data && data.token != null ? String(data.token) : '—');
    var absurdApes = data && data.absurdApesCount != null ? String(data.absurdApesCount) : '—';
    var col2 = data && data.col2Count != null ? String(data.col2Count) : '—';
    var totalNfts = data && data.totalNfts != null ? String(data.totalNfts) : '—';
    [
      [document.getElementById('holdings-token'), document.getElementById('holdings-token-mobile')],
      [document.getElementById('holdings-absurdApes'), document.getElementById('holdings-absurdApes-mobile')],
      [document.getElementById('holdings-col2'), document.getElementById('holdings-col2-mobile')],
      [document.getElementById('holdings-total-nfts'), document.getElementById('holdings-total-nfts-mobile')],
    ].forEach(function (pair, i) {
      var val = [tokenVal, absurdApes, col2, totalNfts][i];
      if (pair[0]) pair[0].textContent = val;
      if (pair[1]) pair[1].textContent = val;
    });
    holdingsPanels.forEach(function (panel) {
      panel.classList.remove('holdings--hidden');
      panel.classList.add('holdings--visible');
    });
  }

  function hideHoldings() {
    holdingsPanels.forEach(function (panel) {
      panel.classList.add('holdings--hidden');
      panel.classList.remove('holdings--visible');
    });
  }

  function setVerifyLoading(loading) {
    var btns = document.querySelectorAll('#btn-verify, #btn-verify-panel, #verify-modal-btn-verify');
    btns.forEach(function (btn) {
      if (!btn) return;
      btn.disabled = loading;
      btn.textContent = loading ? 'Checking…' : 'Verify holdings';
    });
  }

  function fetchVerifyHoldings(walletAddress) {
    var url = window.location.origin + '/api/verify?wallet=' + encodeURIComponent(walletAddress);
    return fetch(url, { credentials: 'include' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data) return data;
        if (HOLDINGS_ENDPOINT) {
          var portalUrl = HOLDINGS_ENDPOINT + (HOLDINGS_ENDPOINT.indexOf('?') >= 0 ? '&' : '?') + 'wallet=' + encodeURIComponent(walletAddress);
          return fetch(portalUrl, { method: 'GET', credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
              if (!d) return null;
              return {
                tokenFormatted: d.token != null ? String(d.token) : '0',
                absurdApesCount: 0,
                col2Count: 0,
                totalNfts: d.nfts != null ? d.nfts : 0,
              };
            });
        }
        return null;
      });
  }

  function isDiscordConnected() {
    return document.body.classList.contains('discord-connected');
  }

  var linkedWalletThisSession = null;
  function linkWalletToDiscord(walletAddress) {
    var addr = walletAddress != null ? String(walletAddress).trim() : '';
    if (!addr || !isDiscordConnected()) return Promise.resolve();
    if (linkedWalletThisSession === addr) return Promise.resolve();
    var base = window.location.origin + '/api/wallets/link';
    function doPost() {
      return fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ wallet: addr }),
      });
    }
    function doGet() {
      return fetch(base + '?wallet=' + encodeURIComponent(addr), { method: 'GET', credentials: 'include' });
    }
    function attempt(delay) {
      return new Promise(function (r) { setTimeout(r, delay || 0); })
        .then(doPost)
        .then(function (r) {
          if (r.ok) { linkedWalletThisSession = addr; return r; }
          if (r.status === 404) return doGet().then(function (g) { if (g.ok) linkedWalletThisSession = addr; return g; });
          if (r.status === 401 && delay !== 1200) return attempt(delay === 0 ? 400 : 1200);
          return r;
        })
        .catch(function () {});
    }
    return attempt(0);
  }

  function doVerify(onSuccess) {
    var wallet = getWalletPublicKey();
    if (!wallet) return;
    setVerifyLoading(true);
    function done(data) {
      setVerifyLoading(false);
      showHoldings(data || {});
      linkWalletToDiscord(wallet);
      if (typeof onSuccess === 'function') onSuccess();
    }
    function fail(err) {
      setVerifyLoading(false);
      console.warn('Verify failed', err);
      showHoldings({});
      alert('Could not load holdings. Check console or try again.');
    }
    fetchVerifyHoldings(wallet).then(done).catch(fail);
  }

  // ----- Verify modal (3 steps) -----
  var verifyModal = document.getElementById('verify-modal');
  var verifyModalBackdrop = document.getElementById('verify-modal-backdrop');
  var verifyModalClose = document.getElementById('verify-modal-close');
  var verifyModalBtnDiscord = document.getElementById('verify-modal-btn-discord');
  var verifyModalDiscordConnected = document.getElementById('verify-modal-discord-connected');
  var verifyModalDiscordAvatar = document.getElementById('verify-modal-discord-avatar');
  var verifyModalDiscordUsername = document.getElementById('verify-modal-discord-username');
  var verifyModalBtnWallet = document.getElementById('verify-modal-btn-wallet');
  var verifyModalWalletConnected = document.getElementById('verify-modal-wallet-connected');
  var verifyModalWalletAddress = document.getElementById('verify-modal-wallet-address');
  var verifyModalBtnVerify = document.getElementById('verify-modal-btn-verify');
  var verifyModalSuccess = document.getElementById('verify-modal-success');
  var heroVerifyActions = document.getElementById('hero-verify-actions');
  var hasVerifiedThisSession = false;

  function openVerifyModal() {
    if (!verifyModal) return;
    verifyModal.setAttribute('aria-hidden', 'false');
    syncVerifyModalState();
  }

  function closeVerifyModal() {
    if (verifyModal) verifyModal.setAttribute('aria-hidden', 'true');
  }

  function getDiscordAvatarUrl(user) {
    if (!user || !user.id) return '';
    if (user.avatar) {
      var ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
      return 'https://cdn.discordapp.com/avatars/' + user.id + '/' + user.avatar + '.' + ext;
    }
    return 'https://cdn.discordapp.com/embed/avatars/' + (parseInt(user.discriminator, 10) % 5) + '.png';
  }

  function syncVerifyModalState() {
    var discordOk = isDiscordConnected();
    var walletOk = !!getWalletPublicKey();

    if (verifyModalBtnDiscord) {
      verifyModalBtnDiscord.hidden = !!discordOk;
      verifyModalBtnDiscord.disabled = false;
    }
    if (verifyModalDiscordConnected) {
      verifyModalDiscordConnected.hidden = !discordOk;
      if (discordOk && discordUser) {
        if (verifyModalDiscordAvatar) {
          verifyModalDiscordAvatar.src = getDiscordAvatarUrl(discordUser);
          verifyModalDiscordAvatar.alt = (discordUser.global_name || discordUser.username) || 'Discord';
        }
        if (verifyModalDiscordUsername) {
          verifyModalDiscordUsername.textContent = discordUser.global_name || discordUser.username || 'Connected';
        }
      }
    }

    if (verifyModalBtnWallet) {
      verifyModalBtnWallet.disabled = !discordOk;
      verifyModalBtnWallet.hidden = !!walletOk;
    }
    if (verifyModalWalletConnected) {
      verifyModalWalletConnected.hidden = !walletOk;
      if (walletOk && verifyModalWalletAddress) {
        var addr = getWalletPublicKey();
        verifyModalWalletAddress.textContent = addr ? (addr.slice(0, 4) + '…' + addr.slice(-4)) : '';
      }
    }

    if (verifyModalBtnVerify) {
      verifyModalBtnVerify.disabled = !discordOk || !walletOk;
      verifyModalBtnVerify.hidden = hasVerifiedThisSession;
    }
    if (verifyModalSuccess) {
      verifyModalSuccess.hidden = !hasVerifiedThisSession;
    }
    if (heroVerifyActions) {
      heroVerifyActions.classList.toggle('hero-home__actions--verified', hasVerifiedThisSession);
    }
  }

  function setVerifySuccessInModal() {
    hasVerifiedThisSession = true;
    if (heroVerifyActions) heroVerifyActions.classList.add('hero-home__actions--verified');
    if (verifyModalBtnVerify) verifyModalBtnVerify.hidden = true;
    if (verifyModalSuccess) verifyModalSuccess.hidden = false;
  }

  document.getElementById('btn-verify')?.addEventListener('click', openVerifyModal);
  document.getElementById('btn-verify-panel')?.addEventListener('click', function () {
    closeMobilePanel();
    openVerifyModal();
  });

  if (verifyModalBackdrop) verifyModalBackdrop.addEventListener('click', closeVerifyModal);
  if (verifyModalClose) verifyModalClose.addEventListener('click', closeVerifyModal);

  if (verifyModalBtnDiscord) {
    verifyModalBtnDiscord.addEventListener('click', function () {
      window.location.href = getDiscordAuthUrl();
    });
  }

  if (verifyModalBtnWallet) {
    verifyModalBtnWallet.addEventListener('click', function () {
      if (verifyModalBtnWallet.disabled) return;
      connectWallet().then(syncVerifyModalState).catch(function () {});
    });
  }

  if (verifyModalBtnVerify) {
    verifyModalBtnVerify.addEventListener('click', function () {
      if (verifyModalBtnVerify.disabled) return;
      doVerify(function () {
        setVerifySuccessInModal();
      });
    });
  }

  // ----- Discord login -----
  var discordUser = null;

  function getDiscordAuthUrl() {
    if (CONFIG.discordConnectUrl && (CONFIG.discordConnectUrl.startsWith('http://') || CONFIG.discordConnectUrl.startsWith('https://'))) {
      return CONFIG.discordConnectUrl;
    }
    return window.location.origin + '/api/discord/auth';
  }

  function setDiscordUI(connected, userOrUsername) {
    document.body.classList.toggle('discord-connected', !!connected);
    if (connected && userOrUsername != null) {
      discordUser = typeof userOrUsername === 'object' ? userOrUsername : { global_name: userOrUsername, username: userOrUsername };
    } else {
      discordUser = null;
    }
    var name = discordUser && (discordUser.global_name || discordUser.username);
    var btnSidebar = document.getElementById('btn-connect-discord');
    var btnMobile = document.getElementById('btn-connect-discord-mobile');
    var wrapSidebar = document.getElementById('discord-connected-sidebar');
    var wrapMobile = document.getElementById('discord-connected-mobile');
    if (btnSidebar) {
      btnSidebar.hidden = !!connected;
      var textSidebar = btnSidebar.querySelector('.btn__text');
      if (textSidebar) textSidebar.textContent = 'Login'; else btnSidebar.textContent = 'Login';
      btnSidebar.title = 'Sign in with Discord';
      btnSidebar.dataset.discordConnected = connected ? '1' : '0';
    }
    if (btnMobile) {
      btnMobile.hidden = !!connected;
      var textMobile = btnMobile.querySelector('.btn__text');
      if (textMobile) textMobile.textContent = 'Login'; else btnMobile.textContent = 'Login';
      btnMobile.title = 'Sign in with Discord';
      btnMobile.dataset.discordConnected = connected ? '1' : '0';
    }
    if (wrapSidebar) {
      wrapSidebar.hidden = !connected;
      if (connected && discordUser) {
        var avSidebar = document.getElementById('discord-avatar-sidebar');
        var nameSidebar = document.getElementById('discord-username-sidebar');
        if (avSidebar) avSidebar.src = getDiscordAvatarUrl(discordUser);
        if (avSidebar) avSidebar.alt = name || 'Discord';
        if (nameSidebar) nameSidebar.textContent = name || 'Connected';
      }
    }
    if (wrapMobile) {
      wrapMobile.hidden = !connected;
      if (connected && discordUser) {
        var avMobile = document.getElementById('discord-avatar-mobile');
        var nameMobile = document.getElementById('discord-username-mobile');
        if (avMobile) avMobile.src = getDiscordAvatarUrl(discordUser);
        if (avMobile) avMobile.alt = name || 'Discord';
        if (nameMobile) nameMobile.textContent = name || 'Connected';
      }
    }
    syncVerifyModalState();
    if (connected && typeof getWalletPublicKey === 'function') {
      var w = getWalletPublicKey();
      if (w && typeof linkWalletToDiscord === 'function') setTimeout(function () { linkWalletToDiscord(w); }, 400);
    }
  }

  function fetchDiscordMe() {
    return fetch(window.location.origin + '/api/discord/me', { credentials: 'include' })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (data && data.connected && data.user) {
          setDiscordUI(true, data.user);
          return data.user;
        }
        setDiscordUI(false);
        return null;
      })
      .catch(function () {
        setDiscordUI(false);
        return null;
      });
  }

  function connectDiscord() {
    if (document.body.classList.contains('discord-connected')) {
      logoutDiscord();
      return;
    }
    window.location.href = getDiscordAuthUrl();
  }

  function logoutDiscord() {
    fetch(window.location.origin + '/api/discord/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(function () {
        setDiscordUI(false);
      })
      .catch(function () {
        setDiscordUI(false);
      });
  }

  document.getElementById('btn-connect-discord')?.addEventListener('click', function (e) {
    e.preventDefault();
    if (document.body.classList.contains('discord-connected')) logoutDiscord();
    else window.location.href = getDiscordAuthUrl();
  });
  document.getElementById('btn-connect-discord-mobile')?.addEventListener('click', function (e) {
    e.preventDefault();
    if (document.body.classList.contains('discord-connected')) logoutDiscord();
    else window.location.href = getDiscordAuthUrl();
  });
  document.getElementById('btn-discord-logout-sidebar')?.addEventListener('click', function (e) {
    e.preventDefault();
    logoutDiscord();
  });
  document.getElementById('btn-discord-logout-mobile')?.addEventListener('click', function (e) {
    e.preventDefault();
    logoutDiscord();
  });

  // On load: check Discord session and ?discord= query; reopen verify modal when returning from Discord
  (function onLoadDiscordAndModal() {
    var params = new URLSearchParams(window.location.search);
    var discordParam = params.get('discord');
    if (discordParam === 'connected') {
      openVerifyModal();
    }
    function done() {
      if (discordParam === 'connected' || discordParam === 'error') {
        var cleanUrl = window.location.pathname + (window.location.hash || '') || '/';
        window.history.replaceState(null, '', cleanUrl);
      }
    }
    fetchDiscordMe().then(function (user) {
      if (discordParam === 'connected' && !user) {
        setTimeout(function () {
          fetchDiscordMe().then(done);
        }, 600);
        return;
      }
      done();
    }).catch(done);
  })();

  // ----- Mobile panel -----
  var mobilePanel = document.getElementById('mobile-panel');
  var panelHandle = document.getElementById('panel-handle');

  function openMobilePanel() {
    if (window.innerWidth >= BREAKPOINT) return;
    if (mobilePanel) {
      mobilePanel.classList.remove('panel--hidden');
      mobilePanel.setAttribute('aria-hidden', 'false');
    }
  }

  function closeMobilePanel() {
    if (mobilePanel) {
      mobilePanel.classList.add('panel--hidden');
      mobilePanel.setAttribute('aria-hidden', 'true');
    }
  }

  panelHandle?.addEventListener('click', function () {
    if (mobilePanel?.classList.contains('panel--hidden')) openMobilePanel();
    else closeMobilePanel();
  });

  document.getElementById('btn-more-mobile')?.addEventListener('click', function () {
    if (mobilePanel?.classList.contains('panel--hidden')) openMobilePanel();
    else closeMobilePanel();
  });

  // Close panel when a "more" menu link is clicked (section nav still handled by [data-section] links)
  mobilePanel?.querySelectorAll('.panel__link').forEach(function (link) {
    link.addEventListener('click', closeMobilePanel);
  });

  // ----- Collections embeds (from /api/collections) -----
  var grid = document.getElementById('collections-grid');
  if (grid) {
    fetch(window.location.origin + '/api/collections', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.collections || !data.collections.length) return;
        grid.innerHTML = '';
        data.collections.forEach(function (c) {
          var card = document.createElement('div');
          card.className = 'card card--nft card--embed';
          var mainCollectionLogo = c.symbol === 'absurd_art_apes' ? 'assets/logo.png' : null;
          var mediaSrc = mainCollectionLogo || c.animationUrl || c.image;
          var mediaHtml = '';
          if (mediaSrc) {
            var isGif = !mainCollectionLogo && (/\.gif(\?|$)/i.test(mediaSrc) || (c.animationUrl && !c.image));
            if (isGif) {
              mediaHtml = '<div class="embed__media embed__media--video"><img src="' + escapeHtml(mediaSrc) + '" alt="" loading="lazy" /></div>';
            } else {
              mediaHtml = '<div class="embed__media"><img src="' + escapeHtml(mediaSrc) + '" alt="" loading="lazy" /></div>';
            }
          } else {
            var fallbackImg = c.symbol === 'absurd_horizons' ? ('assets/absurd-horizons.png') : null;
            if (fallbackImg) {
              mediaHtml = '<div class="embed__media embed__media--video"><img src="' + escapeHtml(fallbackImg) + '" alt="" loading="lazy" /></div>';
            } else {
              mediaHtml = '<div class="embed__media embed__media--placeholder" aria-hidden="true"></div>';
            }
          }
          var desc = (c.description || '').slice(0, 280);
          if ((c.description || '').length > 280) desc += '…';
          var stats = [];
          if (c.supply != null && Number(c.supply) > 1) stats.push({ label: 'Supply', value: formatNum(c.supply) });
          if (c.listedCount != null) stats.push({ label: 'Listed', value: formatNum(c.listedCount) });
          if (c.floorPriceSol != null) stats.push({ label: 'Floor', value: c.floorPriceSol + ' SOL' });
          if (c.volumeAllSol != null) stats.push({ label: 'Volume', value: c.volumeAllSol + ' SOL' });
          if (c.avgPrice24hrSol != null) stats.push({ label: '24h avg', value: c.avgPrice24hrSol + ' SOL' });
          var statsHtml = stats.length ? '<div class="embed__stats">' + stats.map(function (s) {
            return '<div class="embed__stat"><span class="embed__stat-label">' + escapeHtml(s.label) + '</span><span class="embed__stat-value">' + escapeHtml(s.value) + '</span></div>';
          }).join('') + '</div>' : '';
          var meUrl = c.marketplaceUrl || ('https://magiceden.io/marketplace/' + encodeURIComponent(c.symbol || ''));
          var tensorUrl = c.tensorUrl || ('https://www.tensor.trade/trade/' + encodeURIComponent(c.symbol || ''));
          var actionsHtml =
            '<div class="collections__actions">' +
            '<a href="' + escapeHtml(meUrl) + '" class="collections__btn" target="_blank" rel="noopener" aria-label="Trade on Magic Eden">' +
              '<img src="assets/magic-eden.png" alt="Magic Eden" class="collections__btn-img collections__btn-img--me" loading="lazy" />' +
            '</a>' +
            '<a href="' + escapeHtml(tensorUrl) + '" class="collections__btn" target="_blank" rel="noopener" aria-label="Trade on Tensor">' +
              '<img src="assets/tensor.png" alt="Tensor" class="collections__btn-img" loading="lazy" />' +
            '</a>' +
          '</div>';
          card.innerHTML =
            mediaHtml +
            '<div class="embed__body">' +
              '<h3 class="card__title">' + escapeHtml(c.name || c.symbol) + '</h3>' +
              (desc ? '<p class="card__text">' + escapeHtml(desc) + '</p>' : '') +
              statsHtml +
              actionsHtml +
            '</div>';
          grid.appendChild(card);
        });
      })
      .catch(function () {});
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
  function formatNum(n) {
    if (n == null) return '—';
    if (typeof n !== 'number') return String(n);
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }

  function discordAvatarUrlFromUser(u) {
    if (!u || !u.id) return '';
    if (u.avatar) {
      var ext = u.avatar.startsWith('a_') ? 'gif' : 'png';
      return 'https://cdn.discordapp.com/avatars/' + u.id + '/' + u.avatar + '.' + ext;
    }
    return 'https://cdn.discordapp.com/embed/avatars/' + (parseInt(u.discriminator, 10) % 5 || 0) + '.png';
  }

  function xHandleFromUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      var u = new URL(url.indexOf('://') >= 0 ? url : 'https://' + url);
      var path = u.pathname.replace(/^\/+|\/+$/g, '');
      var parts = path.split('/');
      var handle = parts[parts.length - 1];
      return handle ? '@' + handle : '';
    } catch (_) { return ''; }
  }

  // ----- Team (from ABSURD_APES_CONFIG.team: xProfileUrl, discordId, description) -----
  var teamGrid = document.getElementById('team-grid');
  if (teamGrid && window.ABSURD_APES_CONFIG && Array.isArray(window.ABSURD_APES_CONFIG.team) && window.ABSURD_APES_CONFIG.team.length > 0) {
    var teamList = window.ABSURD_APES_CONFIG.team;
    teamGrid.innerHTML = '';
    teamList.forEach(function (member) {
      var xUrl = member.xProfileUrl || '';
      var discordId = member.discordId || '';
      var description = member.description || '';
      var card = document.createElement('div');
      card.className = 'card card--team';
      var title = '';
      var avatarSrc = '';
      var fetchPromise = discordId
        ? fetch(window.location.origin + '/api/discord/user/' + encodeURIComponent(discordId), { credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (u) {
              if (u) {
                title = u.global_name || u.username || '';
                avatarSrc = discordAvatarUrlFromUser(u);
              }
            })
            .catch(function () {})
        : Promise.resolve();
      fetchPromise.then(function () {
        if (!title) title = xHandleFromUrl(xUrl) || 'Team';
        if (!avatarSrc) avatarSrc = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23666" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>');
        var linkAttrs = xUrl ? ' href="' + escapeHtml(xUrl) + '" target="_blank" rel="noopener"' : '';
        var handleDisplay = xHandleFromUrl(xUrl);
        card.innerHTML =
          '<div class="card__avatar-wrap">' +
            '<img class="card__avatar card__avatar--img" src="' + escapeHtml(avatarSrc) + '" alt="" loading="lazy" />' +
          '</div>' +
          '<h3 class="card__title">' + escapeHtml(title) + '</h3>' +
          (handleDisplay ? '<p class="card__meta card__meta--handle"><a class="link link--external" href="' + escapeHtml(xUrl) + '" target="_blank" rel="noopener">' + escapeHtml(handleDisplay) + '</a></p>' : '') +
          (description ? '<p class="card__text">' + escapeHtml(description) + '</p>' : '');
        if (xUrl && !handleDisplay) {
          var titleEl = card.querySelector('.card__title');
          if (titleEl) {
            var wrap = document.createElement('a');
            wrap.href = xUrl;
            wrap.target = '_blank';
            wrap.rel = 'noopener';
            wrap.className = 'link link--external';
            wrap.textContent = titleEl.textContent;
            titleEl.textContent = '';
            titleEl.appendChild(wrap);
          }
        }
      });
      teamGrid.appendChild(card);
    });
  }

  // ----- Holders table (with live $ value from /api/prices) -----
  var holdersTbody = document.getElementById('holders-tbody');
  var holdersSortSelect = document.getElementById('holders-sort');
  if (holdersTbody && holdersSortSelect) {
    function formatUsd(n) {
      if (n == null || isNaN(n)) return '—';
      if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
      if (n >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
      if (n >= 1) return '$' + n.toFixed(2);
      if (n >= 0.01) return '$' + n.toFixed(2);
      return '$' + n.toFixed(4);
    }
    function loadHolders(sort) {
      sort = sort || 'total';
      if (sort === 'col2' || sort === 'nfts') sort = 'total'; // Horizons + Total NFTs hidden until after Horizons mints
      var table = document.getElementById('holders-table');
      if (table) table.className = 'holders-table holders-table--sort-' + sort;
      holdersTbody.innerHTML = '<tr><td colspan="5" class="holders-loading">Loading…</td></tr>';
      Promise.all([
        fetch(window.location.origin + '/api/holders?sort=' + encodeURIComponent(sort), { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }),
        fetch(window.location.origin + '/api/prices', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }),
        fetch(window.location.origin + '/api/collections', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }),
      ]).then(function (arr) {
        var data = arr[0];
        var prices = arr[1] || {};
        var collectionsData = arr[2];
        var tokenUsd = prices.tokenUsd;
        var solUsd = prices.solUsd;
        var floorAbsurdApesSol = null;
        var floorCol2Sol = null;
        if (collectionsData && collectionsData.collections && Array.isArray(collectionsData.collections)) {
          collectionsData.collections.forEach(function (c) {
            if (c.symbol === 'absurd_art_apes' && c.floorPriceSol != null) floorAbsurdApesSol = parseFloat(String(c.floorPriceSol), 10);
            if (c.symbol === 'absurd_horizons' && c.floorPriceSol != null) floorCol2Sol = parseFloat(String(c.floorPriceSol), 10);
          });
        }
        var solUsdNum = solUsd != null ? Number(solUsd) : null;
        var tokenUsdNum = tokenUsd != null ? Number(tokenUsd) : null;
        if (!data || !data.holders) {
          holdersTbody.innerHTML = '<tr><td colspan="5" class="holders-empty">No data</td></tr>';
          return;
        }
        var rows = data.holders.map(function (h, i) {
          var baseName = h.displayName || (h.wallet && h.wallet.length > 12 ? h.wallet.slice(0, 4) + '…' + h.wallet.slice(-4) : (h.wallet || '—'));
          var displayName = baseName + (h.walletCount > 1 ? ' (' + h.walletCount + ' wallets)' : '');
          var walletLink = h.wallet ? 'https://solscan.io/account/' + encodeURIComponent(h.wallet) : null;
          var tokenBal = h.tokenBalance != null ? Number(h.tokenBalance) : null;
          var absurdApesCount = Number(h.absurdApesCount) || 0;
          var col2Count = Number(h.col2Count) || 0;
          var tokenValueUsd = (tokenUsdNum != null && !isNaN(tokenUsdNum) && tokenBal != null && !isNaN(tokenBal)) ? tokenBal * tokenUsdNum : null;
          var nftValueAbsurdApes = (solUsdNum != null && !isNaN(solUsdNum) && floorAbsurdApesSol != null && !isNaN(floorAbsurdApesSol)) ? absurdApesCount * floorAbsurdApesSol * solUsdNum : null;
          var nftValueCol2 = (solUsdNum != null && !isNaN(solUsdNum) && floorCol2Sol != null && !isNaN(floorCol2Sol)) ? col2Count * floorCol2Sol * solUsdNum : null;
          var nftValueUsd = null;
          if (solUsdNum != null && !isNaN(solUsdNum) && (floorAbsurdApesSol != null || floorCol2Sol != null)) {
            var nftSol = absurdApesCount * (floorAbsurdApesSol || 0) + col2Count * (floorCol2Sol || 0);
            nftValueUsd = nftSol * solUsdNum;
          }
          var valueUsd = null;
          if (sort === 'total') {
            valueUsd = (tokenValueUsd != null ? tokenValueUsd : 0) + (nftValueUsd != null ? nftValueUsd : 0);
            if (tokenValueUsd == null && nftValueUsd == null) valueUsd = null;
          } else if (sort === 'token') valueUsd = tokenValueUsd;
          else if (sort === 'absurdApes') valueUsd = nftValueAbsurdApes;
          else if (sort === 'col2') valueUsd = nftValueCol2;
          else if (sort === 'nfts') valueUsd = nftValueUsd;
          var valueCell = valueUsd != null ? formatUsd(valueUsd) : '—';
          var nameCell = walletLink
            ? '<a href="' + escapeHtml(walletLink) + '" target="_blank" rel="noopener" class="holders-wallet">' + escapeHtml(displayName) + '</a>'
            : '<span class="holders-wallet">' + escapeHtml(displayName) + '</span>';
          return '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td>' + nameCell + '</td>' +
            '<td data-col="token">' + escapeHtml(h.tokenBalanceFormatted || '0') + '</td>' +
            '<td data-col="absurdApes">' + (h.absurdApesCount || 0) + '</td>' +
            '<td>' + escapeHtml(valueCell) + '</td>' +
            '</tr>';
        });
        holdersTbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5" class="holders-empty">No holders</td></tr>';
      }).catch(function () {
        holdersTbody.innerHTML = '<tr><td colspan="5" class="holders-empty">Failed to load</td></tr>';
      });
    }
    loadHolders('total');
    holdersSortSelect.addEventListener('change', function () {
      loadHolders(holdersSortSelect.value);
    });
  }

  // ----- Tokenomics: DEXTools-style price + metrics + 15m chart -----
  var priceUsdEl = document.getElementById('tokenomics-price-usd');
  var change24El = document.getElementById('tokenomics-change-24h');
  var priceSolEl = document.getElementById('tokenomics-price-sol');
  var mcapEl = document.getElementById('tokenomics-mcap');
  var liqEl = document.getElementById('tokenomics-liq');
  var volEl = document.getElementById('tokenomics-vol');
  var chartEl = document.getElementById('token-chart');
  var chartHintEl = document.getElementById('token-chart-hint');

  function formatUsd(val) {
    if (val == null || isNaN(val)) return '—';
    if (val >= 1e9) return '$' + (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6) return '$' + (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return '$' + (val / 1e3).toFixed(2) + 'K';
    if (val >= 1) return '$' + val.toFixed(2);
    if (val >= 0.01) return '$' + val.toFixed(4);
    return val < 0.0001 ? '$' + val.toExponential(2) : '$' + val.toFixed(6);
  }

  function formatPrice(val) {
    if (val == null || isNaN(val)) return '—';
    if (val >= 1) return val.toFixed(2);
    if (val >= 0.01) return val.toFixed(4);
    return val < 0.0001 ? val.toExponential(2) : val.toFixed(6);
  }

  if (priceUsdEl || priceSolEl) {
    fetch(window.location.origin + '/api/prices', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (p) {
        if (!p) return;
        if (priceUsdEl && p.tokenUsd != null) priceUsdEl.textContent = '$' + formatPrice(p.tokenUsd);
        if (priceSolEl && p.tokenPerSol != null) priceSolEl.textContent = formatPrice(p.tokenPerSol) + ' SOL';
        if (change24El && p.priceChange24h != null) {
          var pc = p.priceChange24h;
          change24El.textContent = (pc >= 0 ? '+' : '') + pc.toFixed(2) + '% 24H';
          change24El.classList.remove('tokenomics__change--pos', 'tokenomics__change--neg');
          change24El.classList.add(pc >= 0 ? 'tokenomics__change--pos' : 'tokenomics__change--neg');
        }
        if (mcapEl) mcapEl.textContent = p.marketCapUsd != null ? formatUsd(p.marketCapUsd) : '—';
        if (liqEl) liqEl.textContent = p.liquidityUsd != null ? formatUsd(p.liquidityUsd) : '—';
        if (volEl) volEl.textContent = p.volume24hUsd != null ? formatUsd(p.volume24hUsd) : '—';
      });
  }

  if (chartEl) {
    fetch(window.location.origin + '/api/token-ohlc?type=15m', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var items = (data && data.data && data.data.items) ? data.data.items : [];
        if (chartHintEl) chartHintEl.textContent = data && data.message ? data.message : '';
        if (items.length === 0) {
          if (chartHintEl && !chartHintEl.textContent) chartHintEl.textContent = 'Add BIRDEYE_API_KEY and AAA_TOKEN_MINT in server .env to show 15m chart.';
          return;
        }
        var candlestickData = items.map(function (c) {
          return {
            time: c.unix_time,
            open: c.o,
            high: c.h,
            low: c.l,
            close: c.c,
          };
        }).sort(function (a, b) { return a.time - b.time; });
        if (typeof window.LightweightCharts === 'undefined') return;
        var chart = window.LightweightCharts.createChart(chartEl, {
          layout: { background: { color: 'transparent' }, textColor: '#8b8f9a' },
          grid: { vertLines: { color: '#2a2d38' }, horzLines: { color: '#2a2d38' } },
          width: chartEl.clientWidth,
          height: 280,
          timeScale: { borderColor: '#2a2d38', timeVisible: true, secondsVisible: false },
          rightPriceScale: { borderColor: '#2a2d38', scaleMargins: { top: 0.1, bottom: 0.2 } },
        });
        var candleSeries = chart.addCandlestickSeries({
          upColor: '#14f195',
          downColor: '#f87171',
          borderDownColor: '#f87171',
          borderUpColor: '#14f195',
        });
        candleSeries.setData(candlestickData);
        chart.timeScale().fitContent();
        window.addEventListener('resize', function () {
          chart.applyOptions({ width: chartEl.clientWidth });
        });
      });
  }
})();
