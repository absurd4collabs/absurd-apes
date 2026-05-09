/**
 * Merch packs page: wait list (Discord + email) and admin list viewer.
 */
(function () {
  function fetchWithCreds(url, opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    options.credentials = options.credentials || 'include';
    return fetch(url, options);
  }

  function waitListApiUrl(pathSegment) {
    var origin = window.location.origin;
    var isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    if (isLocal) {
      return pathSegment ? origin + '/api/wait-list/' + pathSegment : origin + '/api/wait-list/';
    }
    var base = origin + '/api/wait-list-proxy';
    if (pathSegment) return base + '?path=' + encodeURIComponent(pathSegment);
    return base;
  }

  function rafflesAdminCheckUrl() {
    var origin = window.location.origin;
    var isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    if (isLocal) return origin + '/api/raffles/admin-check';
    return origin + '/api/raffles-proxy?path=' + encodeURIComponent('admin-check');
  }

  var joinBtn = null;
  var hintEl = null;
  var adminBtn = null;
  var emailModal = null;
  var emailInput = null;
  var emailErr = null;
  var adminModal = null;
  var adminListEl = null;
  var adminLoading = null;
  var adminEmpty = null;
  var claimBtn = null;
  var claimModal = null;
  var claimInput = null;
  var claimErr = null;
  var eventsBound = false;

  function setJoinModal(open) {
    if (!emailModal) return;
    emailModal.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      if (emailErr) {
        emailErr.hidden = true;
        emailErr.textContent = '';
      }
      if (emailInput) {
        emailInput.value = '';
        setTimeout(function () { emailInput.focus(); }, 50);
      }
    }
  }

  function setAdminModal(open) {
    if (!adminModal) return;
    adminModal.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function setClaimModal(open) {
    if (!claimModal) return;
    claimModal.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      if (claimErr) {
        claimErr.hidden = true;
        claimErr.textContent = '';
      }
      if (claimInput) {
        claimInput.value = '';
        setTimeout(function () { claimInput.focus(); }, 50);
      }
    }
  }

  function submitClaimCode() {
    var code = claimInput && claimInput.value.trim();
    if (claimErr) {
      claimErr.hidden = true;
      claimErr.textContent = '';
    }
    if (!code) {
      if (claimErr) {
        claimErr.textContent = 'Enter your mint code.';
        claimErr.hidden = false;
      }
      return;
    }
    /* Placeholder until GraveMint / API wiring — next step: validate code server-side */
    setClaimModal(false);
  }

  function refreshMerchWaitlistUI() {
    bindEvents();
    if (!joinBtn || !document.getElementById('main-merch') || document.getElementById('main-merch').hidden) {
      return;
    }

    if (adminBtn) adminBtn.hidden = true;

    fetchWithCreds(waitListApiUrl('me'), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var discordOk = data && data.discordConnected;
        var joined = data && data.joined;

        if (hintEl) {
          hintEl.hidden = discordOk;
        }

        if (joined) {
          joinBtn.classList.add('merch-packs-page__waitlist-btn--joined');
          joinBtn.disabled = true;
          joinBtn.textContent = '\u2713 Joined';
          joinBtn.removeAttribute('title');
        } else {
          joinBtn.classList.remove('merch-packs-page__waitlist-btn--joined');
          joinBtn.textContent = 'Join wait list';
          joinBtn.disabled = !discordOk;
          if (!discordOk) {
            joinBtn.setAttribute('title', 'Log in with Discord first');
          } else {
            joinBtn.removeAttribute('title');
          }
        }
      })
      .catch(function () {
        if (hintEl) hintEl.hidden = false;
        joinBtn.classList.remove('merch-packs-page__waitlist-btn--joined');
        joinBtn.disabled = true;
        joinBtn.textContent = 'Join wait list';
        joinBtn.setAttribute('title', 'Could not load wait list status');
      });

    fetchWithCreds(rafflesAdminCheckUrl(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('admin-check failed');
        return r.json();
      })
      .then(function (data) {
        if (!adminBtn) return;
        adminBtn.hidden = !(data && data.admin === true);
      })
      .catch(function () {
        if (adminBtn) adminBtn.hidden = true;
      });
  }

  function submitJoin() {
    var em = emailInput && emailInput.value.trim();
    if (emailErr) {
      emailErr.hidden = true;
      emailErr.textContent = '';
    }
    if (!em) {
      if (emailErr) {
        emailErr.textContent = 'Enter your email.';
        emailErr.hidden = false;
      }
      return;
    }

    fetchWithCreds(waitListApiUrl('join'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: em }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .then(function (res) {
        if (res.ok && res.data && res.data.ok) {
          setJoinModal(false);
          refreshMerchWaitlistUI();
          return;
        }
        var msg = (res.data && res.data.error) || 'Could not join. Try again.';
        if (emailErr) {
          emailErr.textContent = msg;
          emailErr.hidden = false;
        }
      })
      .catch(function () {
        if (emailErr) {
          emailErr.textContent = 'Network error. Try again.';
          emailErr.hidden = false;
        }
      });
  }

  function loadAdminList() {
    if (!adminListEl || !adminLoading || !adminEmpty) return;
    adminLoading.hidden = false;
    adminEmpty.hidden = true;
    adminListEl.hidden = true;
    adminListEl.innerHTML = '';

    fetchWithCreds(waitListApiUrl('all'), { cache: 'no-store' })
      .then(function (r) {
        if (r.status === 403 || r.status === 401) {
          adminLoading.hidden = true;
          adminEmpty.textContent = 'Not authorized.';
          adminEmpty.hidden = false;
          return null;
        }
        return r.json();
      })
      .then(function (data) {
        adminLoading.hidden = true;
        if (!data || !data.entries) {
          adminEmpty.hidden = false;
          return;
        }
        var entries = data.entries;
        if (entries.length === 0) {
          adminEmpty.hidden = false;
          return;
        }
        adminEmpty.hidden = true;
        adminListEl.hidden = false;
        /* copy-document from SVG Repo; fill set via CSS (.merch-waitlist-copy-btn__svg path) */
        var copyIconSvg =
          '<svg class="merch-waitlist-copy-btn__svg" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M768 832a128 128 0 0 1-128 128H192A128 128 0 0 1 64 832V384a128 128 0 0 1 128-128v64a64 64 0 0 0-64 64v448a64 64 0 0 0 64 64h448a64 64 0 0 0 64-64h64z"/><path d="M384 128a64 64 0 0 0-64 64v448a64 64 0 0 0 64 64h448a64 64 0 0 0 64-64V192a64 64 0 0 0-64-64H384zm0-64h448a128 128 0 0 1 128 128v448a128 128 0 0 1-128 128H384a128 128 0 0 1-128-128V192A128 128 0 0 1 384 64z"/></svg>';
        var checkIconSvg =
          '<svg class="merch-waitlist-copy-btn__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

        entries.forEach(function (row) {
          var email = String(row.email || '');
          var username = (row.discordUsername && String(row.discordUsername).trim()) || '';
          var div = document.createElement('div');
          div.className = 'merch-waitlist-admin-row';
          var main = document.createElement('div');
          main.className = 'merch-waitlist-admin-row__main';
          var emailSpan = document.createElement('span');
          emailSpan.className = 'merch-waitlist-admin-row__email';
          emailSpan.textContent = email;
          var meta = document.createElement('span');
          meta.className = 'merch-waitlist-admin-row__meta';
          meta.textContent = username || '—';
          main.appendChild(emailSpan);
          main.appendChild(meta);
          var copyBtn = document.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'btn btn--outline merch-waitlist-copy-btn';
          copyBtn.setAttribute('aria-label', 'Copy email');
          copyBtn.title = 'Copy email';
          copyBtn.innerHTML = copyIconSvg;
          copyBtn.addEventListener('click', function () {
            if (!email || !navigator.clipboard || !navigator.clipboard.writeText) return;
            navigator.clipboard.writeText(email).then(function () {
              copyBtn.innerHTML = checkIconSvg;
              copyBtn.setAttribute('aria-label', 'Copied');
              copyBtn.classList.add('merch-waitlist-copy-btn--ok');
              setTimeout(function () {
                copyBtn.innerHTML = copyIconSvg;
                copyBtn.setAttribute('aria-label', 'Copy email');
                copyBtn.classList.remove('merch-waitlist-copy-btn--ok');
              }, 1500);
            });
          });
          div.appendChild(main);
          div.appendChild(copyBtn);
          adminListEl.appendChild(div);
        });
      })
      .catch(function () {
        adminLoading.hidden = true;
        adminEmpty.textContent = 'Could not load list.';
        adminEmpty.hidden = false;
      });
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    joinBtn = document.getElementById('merch-waitlist-join-btn');
    hintEl = document.getElementById('merch-waitlist-hint');
    adminBtn = document.getElementById('merch-waitlist-admin-btn');
    emailModal = document.getElementById('merch-waitlist-modal');
    emailInput = document.getElementById('merch-waitlist-email');
    emailErr = document.getElementById('merch-waitlist-modal-err');
    adminModal = document.getElementById('merch-waitlist-admin-modal');
    adminListEl = document.getElementById('merch-waitlist-admin-list');
    adminLoading = document.getElementById('merch-waitlist-admin-loading');
    adminEmpty = document.getElementById('merch-waitlist-admin-empty');
    claimBtn = document.getElementById('merch-claim-pack-btn');
    claimModal = document.getElementById('merch-claim-pack-modal');
    claimInput = document.getElementById('merch-claim-pack-code');
    claimErr = document.getElementById('merch-claim-pack-modal-err');

    if (claimBtn) {
      claimBtn.addEventListener('click', function () {
        setClaimModal(true);
      });
    }
    document.getElementById('merch-claim-pack-modal-close')?.addEventListener('click', function () { setClaimModal(false); });
    document.getElementById('merch-claim-pack-modal-backdrop')?.addEventListener('click', function () { setClaimModal(false); });
    document.getElementById('merch-claim-pack-modal-cancel')?.addEventListener('click', function () { setClaimModal(false); });
    document.getElementById('merch-claim-pack-modal-submit')?.addEventListener('click', submitClaimCode);
    if (claimInput) {
      claimInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitClaimCode();
        }
      });
    }

    if (joinBtn) {
      joinBtn.addEventListener('click', function () {
        if (joinBtn.disabled) return;
        if (joinBtn.classList.contains('merch-packs-page__waitlist-btn--joined')) return;
        setJoinModal(true);
      });
    }

    document.getElementById('merch-waitlist-modal-close')?.addEventListener('click', function () { setJoinModal(false); });
    document.getElementById('merch-waitlist-modal-backdrop')?.addEventListener('click', function () { setJoinModal(false); });
    document.getElementById('merch-waitlist-modal-cancel')?.addEventListener('click', function () { setJoinModal(false); });
    document.getElementById('merch-waitlist-modal-submit')?.addEventListener('click', submitJoin);
    if (emailInput) {
      emailInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitJoin();
        }
      });
    }

    if (adminBtn) {
      adminBtn.addEventListener('click', function () {
        setAdminModal(true);
        loadAdminList();
      });
    }
    document.getElementById('merch-waitlist-admin-modal-close')?.addEventListener('click', function () { setAdminModal(false); });
    document.getElementById('merch-waitlist-admin-modal-backdrop')?.addEventListener('click', function () { setAdminModal(false); });
  }

  function initMerchWaitlistPage() {
    bindEvents();
    refreshMerchWaitlistUI();
  }

  window.initMerchWaitlistPage = initMerchWaitlistPage;
  window.refreshMerchWaitlistUI = refreshMerchWaitlistUI;
})();
