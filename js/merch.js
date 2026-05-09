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

  function merchApiUrl(pathSegment) {
    var origin = window.location.origin;
    var isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    if (isLocal) {
      return origin + '/api/merch/' + pathSegment;
    }
    return origin + '/api/merch-proxy?path=' + encodeURIComponent(pathSegment);
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
  var shippingModal = null;
  var shippingErr = null;
  /** Mint code validated in step 1; submitted again with shipping form */
  var pendingClaimCode = '';
  /** Shipping fields snapshot after validation (used for review step + API submit) */
  var pendingReviewPayload = null;
  var eventsBound = false;

  function escapeHtml(text) {
    var s = String(text == null ? '' : text);
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function discordMeUrl() {
    return window.location.origin + '/api/discord/me';
  }

  function formatDeliveryAddress(parts) {
    var lines = [];
    lines.push(String(parts.street1 || '').trim());
    var s2 = String(parts.street2 || '').trim();
    if (s2) lines.push(s2);
    lines.push(String(parts.city || '').trim());
    lines.push(String(parts.country || '').trim());
    lines.push(String(parts.postal_code || '').trim());
    return lines.filter(Boolean).join('\n');
  }

  /* Sorted country names (same list as js/merch-countries.json; embedded so no separate HTTP fetch). */
  var MERCH_COUNTRY_NAMES = ["Afghanistan","Åland Islands","Albania","Algeria","American Samoa","Andorra","Angola","Anguilla","Antarctica","Antigua and Barbuda","Argentina","Armenia","Aruba","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bermuda","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Bouvet Island","Brazil","British Indian Ocean Territory","British Virgin Islands","Brunei","Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Cape Verde","Caribbean Netherlands","Cayman Islands","Central African Republic","Chad","Chile","China","Christmas Island","Cocos (Keeling) Islands","Colombia","Comoros","Cook Islands","Costa Rica","Croatia","Cuba","Curaçao","Cyprus","Czechia","Denmark","Djibouti","Dominica","Dominican Republic","DR Congo","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Falkland Islands","Faroe Islands","Fiji","Finland","France","French Guiana","French Polynesia","French Southern and Antarctic Lands","Gabon","Gambia","Georgia","Germany","Ghana","Gibraltar","Greece","Greenland","Grenada","Guadeloupe","Guam","Guatemala","Guernsey","Guinea","Guinea-Bissau","Guyana","Haiti","Heard Island and McDonald Islands","Honduras","Hong Kong","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Isle of Man","Israel","Italy","Ivory Coast","Jamaica","Japan","Jersey","Jordan","Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Macau","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Martinique","Mauritania","Mauritius","Mayotte","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Montserrat","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Caledonia","New Zealand","Nicaragua","Niger","Nigeria","Niue","Norfolk Island","North Korea","North Macedonia","Northern Mariana Islands","Norway","Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Pitcairn Islands","Poland","Portugal","Puerto Rico","Qatar","Republic of the Congo","Réunion","Romania","Russia","Rwanda","Saint Barthélemy","Saint Helena, Ascension and Tristan da Cunha","Saint Kitts and Nevis","Saint Lucia","Saint Martin","Saint Pierre and Miquelon","Saint Vincent and the Grenadines","Samoa","San Marino","São Tomé and Príncipe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Sint Maarten","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Georgia","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Svalbard and Jan Mayen","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tokelau","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Turks and Caicos Islands","Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","United States Minor Outlying Islands","United States Virgin Islands","Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Wallis and Futuna","Western Sahara","Yemen","Zambia","Zimbabwe"];

  function populateCountriesSelect() {
    var sel = document.getElementById('merch-shipping-country');
    if (!sel || sel.getAttribute('data-loaded') === '1') return;
    if (!MERCH_COUNTRY_NAMES || !MERCH_COUNTRY_NAMES.length) return;
    MERCH_COUNTRY_NAMES.forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    sel.setAttribute('data-loaded', '1');
  }

  function ensureCountryOption(selectEl, countryName) {
    if (!selectEl || !countryName) return;
    var v = String(countryName).trim();
    if (!v) return;
    selectEl.value = v;
    if (selectEl.value === v) return;
    var opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    var first = selectEl.querySelector('option[value=""]');
    if (first && first.nextSibling) {
      selectEl.insertBefore(opt, first.nextSibling);
    } else {
      selectEl.appendChild(opt);
    }
    selectEl.value = v;
  }

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

  function setShippingModal(open, opts) {
    opts = opts || {};
    if (!shippingModal) return;
    shippingModal.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (!open && !opts.keepClaimSession) {
      pendingClaimCode = '';
      pendingReviewPayload = null;
      resetShippingForm();
    }
    if (!open && shippingErr) {
      shippingErr.hidden = true;
      shippingErr.textContent = '';
    }
  }

  function finishClaimSession() {
    pendingClaimCode = '';
    pendingReviewPayload = null;
    resetShippingForm();
  }

  function setReviewModal(open) {
    var m = document.getElementById('merch-claim-review-modal');
    if (!m) return;
    m.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (!open) {
      var re = document.getElementById('merch-claim-review-err');
      if (re) {
        re.hidden = true;
        re.textContent = '';
      }
    }
  }

  function setSuccessModal(open) {
    var m = document.getElementById('merch-claim-success-modal');
    if (!m) return;
    m.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function renderReviewSummary(payload) {
    var el = document.getElementById('merch-claim-review-summary');
    if (!el || !payload) return;
    var addrExtra =
      '<dt>Street line 1</dt><dd>' +
      escapeHtml(payload.street1) +
      '</dd>';
    var s2 = String(payload.street2 || '').trim();
    if (s2) {
      addrExtra +=
        '<dt>Street line 2</dt><dd>' +
        escapeHtml(s2) +
        '</dd>';
    }
    addrExtra +=
      '<dt>Town / city</dt><dd>' +
      escapeHtml(payload.city) +
      '</dd>' +
      '<dt>Country</dt><dd>' +
      escapeHtml(payload.country) +
      '</dd>' +
      '<dt>ZIP / postal code</dt><dd>' +
      escapeHtml(payload.postal_code) +
      '</dd>';
    el.innerHTML =
      '<dl>' +
      '<dt>X handle</dt><dd>' +
      escapeHtml(payload.x_handle) +
      '</dd>' +
      '<dt>Discord</dt><dd>' +
      escapeHtml(payload.discord_display) +
      '</dd>' +
      '<dt>Size</dt><dd>' +
      escapeHtml(payload.size) +
      '</dd>' +
      '<dt>T-shirt colour</dt><dd>' +
      escapeHtml(payload.shirt_color) +
      '</dd>' +
      addrExtra +
      '</dl>';
  }

  function applyPayloadToShippingForm(p) {
    if (!p) return;
    var xEl = document.getElementById('merch-shipping-x');
    var discEl = document.getElementById('merch-shipping-discord');
    var sizeEl = document.getElementById('merch-shipping-size');
    var colorEl = document.getElementById('merch-shipping-color');
    var st1 = document.getElementById('merch-shipping-street1');
    var st2 = document.getElementById('merch-shipping-street2');
    var cityEl = document.getElementById('merch-shipping-city');
    var countryEl = document.getElementById('merch-shipping-country');
    var postEl = document.getElementById('merch-shipping-postal');
    if (xEl) xEl.value = p.x_handle || '';
    if (discEl) discEl.value = p.discord_display || '';
    if (sizeEl) sizeEl.value = p.size || '';
    if (colorEl) colorEl.value = p.shirt_color || '';
    if (st1) st1.value = p.street1 || '';
    if (st2) st2.value = p.street2 || '';
    if (cityEl) cityEl.value = p.city || '';
    if (postEl) postEl.value = p.postal_code || '';
    if (countryEl && p.country) ensureCountryOption(countryEl, p.country);
  }

  function validateShippingForm() {
    var xEl = document.getElementById('merch-shipping-x');
    var discEl = document.getElementById('merch-shipping-discord');
    var sizeEl = document.getElementById('merch-shipping-size');
    var colorEl = document.getElementById('merch-shipping-color');
    var st1 = document.getElementById('merch-shipping-street1');
    var st2 = document.getElementById('merch-shipping-street2');
    var cityEl = document.getElementById('merch-shipping-city');
    var countryEl = document.getElementById('merch-shipping-country');
    var postEl = document.getElementById('merch-shipping-postal');
    var xHandle = xEl && xEl.value.trim();
    var discordDisplay = discEl && discEl.value.trim();
    var size = sizeEl && sizeEl.value;
    var shirtColor = colorEl && colorEl.value;
    var street1 = st1 && st1.value.trim();
    var street2 = st2 && st2.value.trim();
    var city = cityEl && cityEl.value.trim();
    var country = countryEl && countryEl.value.trim();
    var postal = postEl && postEl.value.trim();
    if (!xHandle) return { ok: false, message: 'Enter your X handle.' };
    if (!size || !shirtColor) return { ok: false, message: 'Select size and colour.' };
    if (!street1 || street1.length < 2) return { ok: false, message: 'Enter street address line 1.' };
    if (!city || city.length < 2) return { ok: false, message: 'Enter town or city.' };
    if (!country) return { ok: false, message: 'Select country.' };
    if (!postal || postal.length < 2) return { ok: false, message: 'Enter ZIP or postal code.' };
    var deliveryAddress = formatDeliveryAddress({
      street1: street1,
      street2: street2,
      city: city,
      country: country,
      postal_code: postal,
    });
    if (deliveryAddress.length < 8) return { ok: false, message: 'Complete your delivery address.' };
    return {
      ok: true,
      payload: {
        x_handle: xHandle,
        discord_display: discordDisplay || '',
        size: size,
        shirt_color: shirtColor,
        street1: street1,
        street2: street2,
        city: city,
        country: country,
        postal_code: postal,
        delivery_address: deliveryAddress,
      },
    };
  }

  function openReviewFromShipping() {
    if (!pendingClaimCode) {
      if (shippingErr) {
        shippingErr.textContent = 'Session expired. Open Claim pack and enter your code again.';
        shippingErr.hidden = false;
      }
      return;
    }
    var pk = typeof window.getWalletPublicKey === 'function' ? window.getWalletPublicKey() : null;
    if (shippingErr) {
      shippingErr.hidden = true;
      shippingErr.textContent = '';
    }
    if (!pk) {
      if (shippingErr) {
        shippingErr.textContent = 'Connect your wallet first.';
        shippingErr.hidden = false;
      }
      return;
    }
    var v = validateShippingForm();
    if (!v.ok) {
      if (shippingErr) {
        shippingErr.textContent = v.message || 'Check your details.';
        shippingErr.hidden = false;
      }
      return;
    }
    pendingReviewPayload = v.payload;
    renderReviewSummary(pendingReviewPayload);
    setShippingModal(false, { keepClaimSession: true });
    setReviewModal(true);
  }

  function editFromReview() {
    setReviewModal(false);
    applyPayloadToShippingForm(pendingReviewPayload);
    setShippingModal(true);
  }

  function confirmMerchClaimFromReview() {
    var code = pendingClaimCode;
    var payload = pendingReviewPayload;
    var pk = typeof window.getWalletPublicKey === 'function' ? window.getWalletPublicKey() : null;
    var reviewErr = document.getElementById('merch-claim-review-err');
    if (reviewErr) {
      reviewErr.hidden = true;
      reviewErr.textContent = '';
    }
    if (!code || !payload) {
      if (reviewErr) {
        reviewErr.textContent = 'Session expired. Start again from Claim pack.';
        reviewErr.hidden = false;
      }
      return;
    }
    if (!pk) {
      if (reviewErr) {
        reviewErr.textContent = 'Connect your wallet first.';
        reviewErr.hidden = false;
      }
      return;
    }
    var confirmBtn = document.getElementById('merch-claim-review-confirm');
    if (confirmBtn) confirmBtn.disabled = true;
    fetchWithCreds(merchApiUrl('submit-claim'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        wallet: pk,
        x_handle: payload.x_handle,
        discord_handle: payload.discord_display || '',
        size: payload.size,
        shirt_color: payload.shirt_color,
        delivery_address: payload.delivery_address,
      }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .then(function (res) {
        if (res.ok && res.data && res.data.ok) {
          setReviewModal(false);
          finishClaimSession();
          setSuccessModal(true);
          return;
        }
        var msg = (res.data && res.data.error) || 'Could not submit. Try again.';
        if (reviewErr) {
          reviewErr.textContent = msg;
          reviewErr.hidden = false;
        }
      })
      .catch(function () {
        if (reviewErr) {
          reviewErr.textContent = 'Network error. Try again.';
          reviewErr.hidden = false;
        }
      })
      .finally(function () {
        if (confirmBtn) confirmBtn.disabled = false;
      });
  }

  function resetShippingForm() {
    var xEl = document.getElementById('merch-shipping-x');
    var sizeEl = document.getElementById('merch-shipping-size');
    var colorEl = document.getElementById('merch-shipping-color');
    var st1 = document.getElementById('merch-shipping-street1');
    var st2 = document.getElementById('merch-shipping-street2');
    var cityEl = document.getElementById('merch-shipping-city');
    var countryEl = document.getElementById('merch-shipping-country');
    var postEl = document.getElementById('merch-shipping-postal');
    if (xEl) xEl.value = '';
    if (sizeEl) sizeEl.value = '';
    if (colorEl) colorEl.value = '';
    if (st1) st1.value = '';
    if (st2) st2.value = '';
    if (cityEl) cityEl.value = '';
    if (countryEl) countryEl.value = '';
    if (postEl) postEl.value = '';
    var discEl = document.getElementById('merch-shipping-discord');
    var discHint = document.getElementById('merch-shipping-discord-hint');
    if (discEl) {
      discEl.value = '';
      discEl.placeholder = '';
      discEl.readOnly = false;
      discEl.classList.remove('merch-shipping-modal__input--readonly');
      discEl.removeAttribute('readonly');
    }
    if (discHint) {
      discHint.textContent = 'Optional — helps us reach you on Discord for shipping updates.';
    }
  }

  function prefillShippingModal() {
    resetShippingForm();
    var el = document.getElementById('merch-shipping-discord');
    var discHint = document.getElementById('merch-shipping-discord-hint');
    var isDisc = document.body.classList.contains('discord-connected');
    if (el) {
      if (isDisc) {
        el.readOnly = true;
        el.setAttribute('readonly', 'readonly');
        el.classList.add('merch-shipping-modal__input--readonly');
        el.placeholder = '';
      } else {
        el.readOnly = false;
        el.removeAttribute('readonly');
        el.classList.remove('merch-shipping-modal__input--readonly');
        el.value = '';
        el.placeholder = 'e.g. @username (optional)';
      }
    }
    if (discHint) {
      discHint.textContent = isDisc
        ? 'From your connected Discord account.'
        : 'Optional — helps us reach you on Discord for shipping updates.';
    }
    if (!isDisc) return;
    fetchWithCreds(discordMeUrl(), { cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var dEl = document.getElementById('merch-shipping-discord');
        if (!dEl) return;
        if (data && data.connected && data.user) {
          var u = data.user;
          var gn = (u.global_name && String(u.global_name).trim()) || '';
          var un = (u.username && String(u.username).trim()) || '';
          dEl.value = gn || (un ? '@' + un : '');
        } else {
          dEl.value = '';
        }
      })
      .catch(function () {
        var dEl = document.getElementById('merch-shipping-discord');
        if (dEl) dEl.value = '';
      });
  }

  function submitClaimCode() {
    var code = claimInput && claimInput.value.trim();
    var pk = typeof window.getWalletPublicKey === 'function' ? window.getWalletPublicKey() : null;
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
    if (!pk) {
      if (claimErr) {
        claimErr.textContent = 'Connect your wallet first.';
        claimErr.hidden = false;
      }
      return;
    }
    var submitBtn = document.getElementById('merch-claim-pack-modal-submit');
    if (submitBtn) submitBtn.disabled = true;
    fetchWithCreds(merchApiUrl('verify-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, wallet: pk }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .then(function (res) {
        if (res.ok && res.data && res.data.ok) {
          pendingClaimCode = code;
          setClaimModal(false);
          prefillShippingModal();
          setShippingModal(true);
          return;
        }
        var msg = (res.data && res.data.error) || 'Invalid code';
        if (claimErr) {
          claimErr.textContent = msg;
          claimErr.hidden = false;
        }
      })
      .catch(function () {
        if (claimErr) {
          claimErr.textContent = 'Network error. Try again.';
          claimErr.hidden = false;
        }
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  }

  function openClaimPackModal() {
    var gateHint = document.getElementById('merch-claim-gate-hint');
    var pk = typeof window.getWalletPublicKey === 'function' ? window.getWalletPublicKey() : null;
    if (gateHint) gateHint.hidden = true;
    if (!pk) {
      if (gateHint) {
        gateHint.textContent = 'Connect your wallet in the sidebar to claim a pack.';
        gateHint.hidden = false;
      }
      return;
    }
    setClaimModal(true);
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
    shippingModal = document.getElementById('merch-shipping-modal');
    shippingErr = document.getElementById('merch-shipping-modal-err');

    if (claimBtn) {
      claimBtn.addEventListener('click', function () {
        openClaimPackModal();
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

    document.getElementById('merch-shipping-modal-close')?.addEventListener('click', function () {
      setShippingModal(false);
    });
    document.getElementById('merch-shipping-modal-backdrop')?.addEventListener('click', function () {
      setShippingModal(false);
    });
    document.getElementById('merch-shipping-modal-cancel')?.addEventListener('click', function () {
      setShippingModal(false);
    });
    document.getElementById('merch-shipping-modal-submit')?.addEventListener('click', openReviewFromShipping);

    document.getElementById('merch-claim-review-modal-close')?.addEventListener('click', editFromReview);
    document.getElementById('merch-claim-review-modal-backdrop')?.addEventListener('click', editFromReview);
    document.getElementById('merch-claim-review-edit')?.addEventListener('click', editFromReview);
    document.getElementById('merch-claim-review-confirm')?.addEventListener('click', confirmMerchClaimFromReview);

    document.getElementById('merch-claim-success-modal-close')?.addEventListener('click', function () {
      setSuccessModal(false);
    });
    document.getElementById('merch-claim-success-modal-backdrop')?.addEventListener('click', function () {
      setSuccessModal(false);
    });
    document.getElementById('merch-claim-success-done')?.addEventListener('click', function () {
      setSuccessModal(false);
    });

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
    populateCountriesSelect();
    refreshMerchWaitlistUI();
  }

  window.initMerchWaitlistPage = initMerchWaitlistPage;
  window.refreshMerchWaitlistUI = refreshMerchWaitlistUI;
})();
