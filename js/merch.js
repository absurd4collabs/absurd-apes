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

  var SOLANA_RPC = window.location.origin + '/api/solana-rpc';
  var RAFFLES_SEND_RAW = window.location.origin + '/api/raffles/send-raw';

  function buildAndSendMerchPackFeePayment(lamportsStr, destination) {
    var provider = typeof window.getSolanaProvider === 'function' ? window.getSolanaProvider() : null;
    var wallet = typeof window.getWalletPublicKey === 'function' ? window.getWalletPublicKey() : null;
    if (!provider || !wallet) return Promise.reject(new Error('Wallet not connected'));
    var solanaWeb3 = window.solanaWeb3;
    if (!solanaWeb3 || !solanaWeb3.Connection || !solanaWeb3.PublicKey || !solanaWeb3.Transaction || !solanaWeb3.SystemProgram) {
      return Promise.reject(new Error('Solana web3 not loaded. Refresh the page.'));
    }
    var lamportsRaw = String(lamportsStr || '').trim().replace(/\s/g, '');
    if (!/^\d+$/.test(lamportsRaw)) return Promise.reject(new Error('Invalid fee amount'));
    var lamportsBI;
    try {
      lamportsBI = BigInt(lamportsRaw);
    } catch (e) {
      return Promise.reject(new Error('Invalid fee amount'));
    }
    if (lamportsBI <= 0n) return Promise.reject(new Error('Invalid fee amount'));
    var Connection = solanaWeb3.Connection;
    var PublicKey = solanaWeb3.PublicKey;
    var Transaction = solanaWeb3.Transaction;
    var SystemProgram = solanaWeb3.SystemProgram;
    var connection = new Connection(SOLANA_RPC, 'confirmed');
    var ownerPk = new PublicKey(wallet);
    var treasuryPk = new PublicKey(String(destination).trim());
    var tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: ownerPk,
        toPubkey: treasuryPk,
        lamports: lamportsBI,
      })
    );
    return connection.getLatestBlockhash('confirmed').then(function (bh) {
      var blockhash = bh && bh.value && bh.value.blockhash ? bh.value.blockhash : bh && bh.blockhash;
      if (!blockhash) return Promise.reject(new Error('Could not get blockhash'));
      tx.recentBlockhash = blockhash;
      tx.feePayer = ownerPk;
      function signThenSendViaServer(unsignedTx) {
        var t = unsignedTx;
        var signPromise =
          typeof provider.signTransaction === 'function'
            ? Promise.resolve(provider.signTransaction(t))
            : Promise.resolve(t).then(function (ut) {
                var ser = ut.serialize({ requireAllSignatures: false });
                var rawArr = ser instanceof Uint8Array ? ser : new Uint8Array(ser);
                var b64 = btoa(String.fromCharCode.apply(null, rawArr));
                return provider.request({ method: 'signTransaction', params: { message: b64 } }).then(function (signedB64) {
                  if (!signedB64) return null;
                  var decoded = atob(signedB64);
                  var arr = new Uint8Array(decoded.length);
                  for (var j = 0; j < decoded.length; j++) arr[j] = decoded.charCodeAt(j);
                  return solanaWeb3.Transaction.from(arr);
                });
              });
        return signPromise.then(function (signedTx) {
          if (!signedTx) return Promise.reject(new Error('Wallet did not return signed transaction'));
          var serialized = signedTx.serialize ? signedTx.serialize() : signedTx;
          var raw = serialized instanceof Uint8Array ? serialized : new Uint8Array(serialized);
          var base64 = btoa(String.fromCharCode.apply(null, raw));
          return fetch(RAFFLES_SEND_RAW, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ signedTransaction: base64 }),
          })
            .then(function (r) {
              return r.json().then(function (data) {
                return { ok: r.ok, data: data };
              });
            })
            .then(function (result) {
              if (result.ok && result.data && result.data.signature) return result.data.signature;
              var errMsg =
                result.data && (result.data.error || result.data.logs)
                  ? result.data.error || (Array.isArray(result.data.logs) ? result.data.logs.join('\n') : '')
                  : 'Send failed';
              return Promise.reject(new Error(errMsg));
            });
        });
      }
      if (typeof provider.signAndSendTransaction === 'function') {
        return Promise.resolve(provider.signAndSendTransaction(tx)).then(function (result) {
          var sig = result && (typeof result === 'string' ? result : result.signature || result.hash);
          return sig ? sig : Promise.reject(new Error('No signature returned'));
        });
      }
      return signThenSendViaServer(tx);
    });
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
  /** Pack tier 1–4 from verify-code API (null if unknown / rules not configured) */
  var pendingMerchTier = null;
  /** Shipping fields snapshot after validation (used for review step + API submit) */
  var pendingReviewPayload = null;
  var eventsBound = false;
  var MERCH_OPT_IMG_V = '1';

  function merchSizeSelectHtml(id, label, extraClass) {
    extraClass = extraClass || '';
    return (
      '<label class="merch-waitlist-modal__label" for="' +
      id +
      '">' +
      escapeHtml(label) +
      '</label>' +
      '<select id="' +
      id +
      '" class="merch-waitlist-modal__input merch-waitlist-modal__select ' +
      extraClass +
      '">' +
      '<option value="">Select size</option>' +
      '<option value="S">S</option>' +
      '<option value="M">M</option>' +
      '<option value="L">L</option>' +
      '<option value="XL">XL</option>' +
      '<option value="XXL">XXL</option>' +
      '</select>'
    );
  }

  function merchColorSelectHtml(id, label) {
    return (
      '<label class="merch-waitlist-modal__label" for="' +
      id +
      '">' +
      escapeHtml(label) +
      '</label>' +
      '<select id="' +
      id +
      '" class="merch-waitlist-modal__input merch-waitlist-modal__select">' +
      '<option value="">Select colour</option>' +
      '<option value="Black">Black</option>' +
      '<option value="White">White</option>' +
      '</select>'
    );
  }

  function onTier2DesignChange() {
    var d = document.getElementById('merch-fld-t2-s2-design');
    var wrap = document.getElementById('merch-fld-t2-s2-color-wrap');
    var colorSel = document.getElementById('merch-fld-t2-s2-color');
    if (!d || !wrap) return;
    var hide = d.value === 'dark_mode';
    wrap.hidden = hide;
    if (colorSel && hide) colorSel.value = '';
  }

  function renderMerchTierShippingFields(tier) {
    var wrap = document.getElementById('merch-shipping-tier-fields');
    if (!wrap) return;
    if (tier == null || tier < 1 || tier > 4) {
      wrap.innerHTML =
        '<p class="merch-shipping-modal__hint">Merch options will appear once your pack tier is confirmed.</p>';
      return;
    }
    var html = '';
    if (tier === 1) {
      html +=
        '<p class="merch-shipping-modal__section-label">T-shirt</p>' +
        merchSizeSelectHtml('merch-fld-t1-shirt-size', 'Size') +
        merchColorSelectHtml('merch-fld-t1-shirt-color', 'Colour');
    } else if (tier === 2) {
      html +=
        '<p class="merch-shipping-modal__section-label">T-shirt 1</p>' +
        merchSizeSelectHtml('merch-fld-t2-s1-size', 'Size') +
        merchColorSelectHtml('merch-fld-t2-s1-color', 'Colour') +
        '<p class="merch-shipping-modal__section-label">T-shirt 2</p>' +
        '<label class="merch-waitlist-modal__label" for="merch-fld-t2-s2-design">Design</label>' +
        '<select id="merch-fld-t2-s2-design" class="merch-waitlist-modal__input merch-waitlist-modal__select">' +
        '<option value="">Select design</option>' +
        '<option value="collective">Collective</option>' +
        '<option value="dark_mode">Dark mode</option>' +
        '</select>' +
        merchSizeSelectHtml('merch-fld-t2-s2-size', 'Size') +
        '<div id="merch-fld-t2-s2-color-wrap">' +
        merchColorSelectHtml('merch-fld-t2-s2-color', 'Colour') +
        '</div>';
    } else if (tier === 3) {
      html +=
        '<p class="merch-shipping-modal__section-label">T-shirt</p>' +
        merchSizeSelectHtml('merch-fld-t3-shirt-size', 'Size') +
        '<p class="merch-shipping-modal__section-label">Customise with your NFT</p>' +
        '<label class="merch-waitlist-modal__label" for="merch-fld-t3-nft-collection">Collection</label>' +
        '<select id="merch-fld-t3-nft-collection" class="merch-waitlist-modal__input merch-waitlist-modal__select">' +
        '<option value="">Select collection</option>' +
        '<option value="Absurd Apes">Absurd Apes</option>' +
        '<option value="Absurd Horizons">Absurd Horizons</option>' +
        '</select>' +
        '<label class="merch-waitlist-modal__label" for="merch-fld-t3-nft-number">NFT #</label>' +
        '<input type="text" id="merch-fld-t3-nft-number" class="merch-waitlist-modal__input" inputmode="numeric" pattern="[0-9]*" placeholder="e.g. 1234" maxlength="12" autocomplete="off" />' +
        '<p class="merch-shipping-modal__section-label">Hoodie</p>' +
        merchSizeSelectHtml('merch-fld-t3-hoodie-size', 'Size');
    } else if (tier === 4) {
      html +=
        '<p class="merch-shipping-modal__section-label">T-shirt 1</p>' +
        merchSizeSelectHtml('merch-fld-t4-t1-size', 'Size') +
        '<p class="merch-shipping-modal__section-label">T-shirt 2</p>' +
        merchSizeSelectHtml('merch-fld-t4-t2-size', 'Size') +
        '<p class="merch-shipping-modal__section-label">Zip up hoodie</p>' +
        merchSizeSelectHtml('merch-fld-t4-zip-size', 'Size');
    }
    wrap.innerHTML = html;
    if (tier === 2) {
      var dEl = document.getElementById('merch-fld-t2-s2-design');
      if (dEl) {
        dEl.addEventListener('change', onTier2DesignChange);
        onTier2DesignChange();
      }
    }
  }

  function setMerchReferenceModal(open) {
    var m = document.getElementById('merch-reference-modal');
    if (!m) return;
    m.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function openMerchPackOptionsReference() {
    var tier = pendingMerchTier;
    if (tier == null || tier < 1 || tier > 4) return;
    var img = document.getElementById('merch-reference-modal-img');
    if (img) {
      img.src = '/assets/merch-options-' + tier + '.png?v=' + MERCH_OPT_IMG_V;
      img.alt = 'Merch pack ' + tier + ' options reference';
    }
    setMerchReferenceModal(true);
  }

  function collectMerchClaimDetails() {
    var t = pendingMerchTier;
    if (t === 1) {
      var zs = document.getElementById('merch-fld-t1-shirt-size');
      var zc = document.getElementById('merch-fld-t1-shirt-color');
      return { shirt: { size: zs ? zs.value : '', color: zc ? zc.value : '' } };
    }
    if (t === 2) {
      var s1s = document.getElementById('merch-fld-t2-s1-size');
      var s1c = document.getElementById('merch-fld-t2-s1-color');
      var des = document.getElementById('merch-fld-t2-s2-design');
      var s2s = document.getElementById('merch-fld-t2-s2-size');
      var s2c = document.getElementById('merch-fld-t2-s2-color');
      var out = {
        shirt1: {
          size: s1s ? s1s.value : '',
          color: s1c ? s1c.value : '',
        },
        shirt2: {
          design: des ? des.value : '',
          size: s2s ? s2s.value : '',
        },
      };
      if (des && des.value === 'collective' && s2c) out.shirt2.color = s2c.value;
      return out;
    }
    if (t === 3) {
      var ss = document.getElementById('merch-fld-t3-shirt-size');
      var coll = document.getElementById('merch-fld-t3-nft-collection');
      var num = document.getElementById('merch-fld-t3-nft-number');
      var hs = document.getElementById('merch-fld-t3-hoodie-size');
      return {
        shirt: { size: ss ? ss.value : '' },
        nft_customization: {
          collection: coll ? coll.value : '',
          nft_number: num ? num.value.trim() : '',
        },
        hoodie: { size: hs ? hs.value : '' },
      };
    }
    if (t === 4) {
      var t1 = document.getElementById('merch-fld-t4-t1-size');
      var t2 = document.getElementById('merch-fld-t4-t2-size');
      var hz = document.getElementById('merch-fld-t4-zip-size');
      return {
        shirt1: { size: t1 ? t1.value : '' },
        shirt2: { size: t2 ? t2.value : '' },
        zip_hoodie: { size: hz ? hz.value : '' },
      };
    }
    return {};
  }

  function validateMerchChoicesForTier() {
    var t = pendingMerchTier;
    if (t == null || t < 1 || t > 4) {
      return { ok: false, message: 'Merch pack tier is missing. Start again from Claim pack.' };
    }
    var d = collectMerchClaimDetails();
    if (t === 1) {
      if (!d.shirt || !d.shirt.size || !d.shirt.color) return { ok: false, message: 'Select T-shirt size and colour.' };
      return { ok: true };
    }
    if (t === 2) {
      if (!d.shirt1 || !d.shirt1.size || !d.shirt1.color) return { ok: false, message: 'Complete T-shirt 1.' };
      if (!d.shirt2 || !d.shirt2.design || !d.shirt2.size) return { ok: false, message: 'Complete T-shirt 2 design and size.' };
      if (d.shirt2.design === 'collective' && !d.shirt2.color) {
        return { ok: false, message: 'Select T-shirt 2 colour (Collective).' };
      }
      return { ok: true };
    }
    if (t === 3) {
      if (!d.shirt || !d.shirt.size) return { ok: false, message: 'Select T-shirt size.' };
      if (!d.nft_customization || !d.nft_customization.collection) return { ok: false, message: 'Select NFT collection.' };
      var num = String(d.nft_customization.nft_number || '').trim();
      if (!/^\d+$/.test(num)) return { ok: false, message: 'Enter a valid NFT #.' };
      if (!d.hoodie || !d.hoodie.size) return { ok: false, message: 'Select hoodie size.' };
      return { ok: true };
    }
    if (t === 4) {
      if (!d.shirt1 || !d.shirt2 || !d.zip_hoodie || !d.shirt1.size || !d.shirt2.size || !d.zip_hoodie.size) {
        return { ok: false, message: 'Select sizes for both T-shirts and the zip hoodie.' };
      }
      return { ok: true };
    }
    return { ok: false, message: 'Invalid pack tier.' };
  }

  function formatTier2DesignLabel(v) {
    if (v === 'collective' || v === '1') return 'Collective';
    if (v === 'dark_mode' || v === '2') return 'Dark mode';
    var s = String(v || '').trim();
    return s || '—';
  }

  function formatMerchClaimDetailsReviewHtml(tier, det) {
    if (!det) return '';
    var rows = '';
    if (tier === 1 && det.shirt) {
      rows +=
        '<dt>T-shirt size</dt><dd>' +
        escapeHtml(det.shirt.size) +
        '</dd><dt>T-shirt colour</dt><dd>' +
        escapeHtml(det.shirt.color) +
        '</dd>';
    } else if (tier === 2 && det.shirt1 && det.shirt2) {
      rows +=
        '<dt>T-shirt 1</dt><dd>' +
        escapeHtml(det.shirt1.size + ', ' + det.shirt1.color) +
        '</dd><dt>T-shirt 2</dt><dd>' +
        escapeHtml(
          formatTier2DesignLabel(det.shirt2.design) +
            ', size ' +
            det.shirt2.size +
            (det.shirt2.color ? ', ' + det.shirt2.color : '')
        ) +
        '</dd>';
    } else if (tier === 3 && det.shirt && det.nft_customization && det.hoodie) {
      rows +=
        '<dt>T-shirt size</dt><dd>' +
        escapeHtml(det.shirt.size) +
        '</dd><dt>NFT collection</dt><dd>' +
        escapeHtml(det.nft_customization.collection) +
        '</dd><dt>NFT #</dt><dd>' +
        escapeHtml(String(det.nft_customization.nft_number)) +
        '</dd><dt>Hoodie size</dt><dd>' +
        escapeHtml(det.hoodie.size) +
        '</dd>';
    } else if (tier === 4 && det.shirt1 && det.shirt2 && det.zip_hoodie) {
      rows +=
        '<dt>T-shirt 1 size</dt><dd>' +
        escapeHtml(det.shirt1.size) +
        '</dd><dt>T-shirt 2 size</dt><dd>' +
        escapeHtml(det.shirt2.size) +
        '</dd><dt>Zip hoodie size</dt><dd>' +
        escapeHtml(det.zip_hoodie.size) +
        '</dd>';
    }
    return rows;
  }

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
    if (!sel || !MERCH_COUNTRY_NAMES || !MERCH_COUNTRY_NAMES.length) return;
    /* Normally once per load; repopulate if only placeholder (init skipped or list never filled). */
    if (sel.getAttribute('data-loaded') === '1' && sel.options && sel.options.length > 1) return;
    while (sel.options.length > 1) {
      sel.remove(1);
    }
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
    var sm = shippingModal || document.getElementById('merch-shipping-modal');
    if (!sm) return;
    shippingModal = sm;
    if (open) {
      populateCountriesSelect();
    }
    sm.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (!open && !opts.keepClaimSession) {
      pendingClaimCode = '';
      pendingMerchTier = null;
      pendingReviewPayload = null;
      resetShippingForm();
    }
    if (!open && shippingErr) {
      shippingErr.hidden = true;
      shippingErr.textContent = '';
    }
  }

  function merchPackTierLabel(tier) {
    var labels = {
      1: 'Merch pack 1',
      2: 'Merch pack 2 (black)',
      3: 'Merch pack 3 (red)',
      4: 'Merch pack 4 (gold)',
    };
    return labels[tier] || 'Your merch pack';
  }

  function populateMerchCongratsModal() {
    var labelEl = document.getElementById('merch-congrats-tier-label');
    var figureEl = document.getElementById('merch-congrats-figure');
    var imgEl = document.getElementById('merch-congrats-pack-img');
    var t = pendingMerchTier;
    if (labelEl) {
      labelEl.textContent =
        t != null && t >= 1 && t <= 4 ? merchPackTierLabel(t) : 'Your pack is ready.';
    }
    if (figureEl && imgEl) {
      if (t != null && t >= 1 && t <= 4) {
        figureEl.hidden = false;
        imgEl.src = '/assets/merch-tier-' + t + '.png?v=1';
        imgEl.alt = merchPackTierLabel(t);
      } else {
        figureEl.hidden = true;
        imgEl.src = '';
        imgEl.alt = '';
      }
    }
  }

  function clearMerchCongratsConfettiCanvas() {
    try {
      var canvas = document.getElementById('merch-congrats-confetti-canvas');
      if (!canvas || !canvas.getContext) return;
      var ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    } catch (e) {
      /* canvas-confetti / worker canvas can throw; must not block opening shipping */
    }
  }

  function fireMerchCongratsConfetti() {
    if (typeof confetti !== 'function') return;
    var modal = document.getElementById('merch-congrats-modal');
    var canvas = document.getElementById('merch-congrats-confetti-canvas');
    if (!modal || !canvas) return;
    var myConfetti = confetti.create(canvas, { resize: true, useWorker: true });
    var box = modal.querySelector('.raffles-modal__box--merch-congrats');
    var rect = box ? box.getBoundingClientRect() : modal.getBoundingClientRect();
    var origin = {
      x: (rect.left + rect.width / 2) / window.innerWidth,
      y: (rect.top + rect.height * 0.42) / window.innerHeight,
    };
    var colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#a855f7', '#ffffff'];
    myConfetti({
      particleCount: 110,
      spread: 76,
      origin: origin,
      startVelocity: 34,
      ticks: 240,
      colors: colors,
      scalar: 0.9,
    });
    setTimeout(function () {
      myConfetti({
        particleCount: 75,
        angle: 58,
        spread: 52,
        origin: { x: Math.max(0.06, origin.x - 0.14), y: origin.y },
        colors: colors,
      });
    }, 200);
    setTimeout(function () {
      myConfetti({
        particleCount: 75,
        angle: 122,
        spread: 52,
        origin: { x: Math.min(0.94, origin.x + 0.14), y: origin.y },
        colors: colors,
      });
    }, 360);
  }

  function setMerchCongratsModal(open) {
    var m = document.getElementById('merch-congrats-modal');
    if (!m) return;
    m.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          fireMerchCongratsConfetti();
        });
      });
    } else {
      clearMerchCongratsConfettiCanvas();
    }
  }

  function abandonMerchCongrats() {
    finishClaimSession();
  }

  function continueMerchCongratsToShipping() {
    try {
      setMerchCongratsModal(false);
    } catch (e) {
      /* congrats close must not block shipping */
    }
    try {
      prefillShippingModal();
    } catch (e) {
      /* still open shipping */
    }
    setShippingModal(true);
    /* Belt-and-suspenders if cached shippingModal ref was stale */
    var shipEl = document.getElementById('merch-shipping-modal');
    if (shipEl && shipEl.getAttribute('aria-hidden') !== 'false') {
      shipEl.setAttribute('aria-hidden', 'false');
      shippingModal = shipEl;
    }
  }

  function finishClaimSession() {
    setMerchCongratsModal(false);
    pendingClaimCode = '';
    pendingMerchTier = null;
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

  function setSuccessModal(open, paymentSignature) {
    var m = document.getElementById('merch-claim-success-modal');
    if (!m) return;
    m.setAttribute('aria-hidden', open ? 'false' : 'true');
    var wrap = document.getElementById('merch-claim-success-tx-wrap');
    var link = document.getElementById('merch-claim-success-tx-link');
    if (wrap && link) {
      if (open && paymentSignature) {
        link.href = 'https://solscan.io/tx/' + encodeURIComponent(paymentSignature);
        wrap.hidden = false;
      } else {
        wrap.hidden = true;
        link.removeAttribute('href');
      }
    }
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
    var tierRow = '';
    var mt = payload.merch_tier;
    if (mt != null && mt >= 1 && mt <= 4) {
      tierRow =
        '<dt>Pack</dt><dd>' +
        escapeHtml(merchPackTierLabel(mt)) +
        '</dd>';
    }
    var merchRows = formatMerchClaimDetailsReviewHtml(mt, payload.merch_claim_details);
    el.innerHTML =
      '<dl>' +
      tierRow +
      merchRows +
      '<dt>X handle</dt><dd>' +
      escapeHtml(payload.x_handle) +
      '</dd>' +
      '<dt>Discord</dt><dd>' +
      escapeHtml(payload.discord_display) +
      '</dd>' +
      addrExtra +
      '</dl>';
  }

  function applyPayloadToShippingForm(p) {
    if (!p) return;
    var xEl = document.getElementById('merch-shipping-x');
    var discEl = document.getElementById('merch-shipping-discord');
    var st1 = document.getElementById('merch-shipping-street1');
    var st2 = document.getElementById('merch-shipping-street2');
    var cityEl = document.getElementById('merch-shipping-city');
    var countryEl = document.getElementById('merch-shipping-country');
    var postEl = document.getElementById('merch-shipping-postal');
    if (xEl) xEl.value = p.x_handle || '';
    if (discEl) discEl.value = p.discord_display || '';
    if (st1) st1.value = p.street1 || '';
    if (st2) st2.value = p.street2 || '';
    if (cityEl) cityEl.value = p.city || '';
    if (postEl) postEl.value = p.postal_code || '';
    if (countryEl && p.country) ensureCountryOption(countryEl, p.country);

    var tier = p.merch_tier != null ? p.merch_tier : pendingMerchTier;
    renderMerchTierShippingFields(tier);
    var det = p.merch_claim_details;
    if (!det || tier == null) return;
    if (tier === 1 && det.shirt) {
      var z1 = document.getElementById('merch-fld-t1-shirt-size');
      var z2 = document.getElementById('merch-fld-t1-shirt-color');
      if (z1) z1.value = det.shirt.size || '';
      if (z2) z2.value = det.shirt.color || '';
    } else if (tier === 2 && det.shirt1 && det.shirt2) {
      var a = document.getElementById('merch-fld-t2-s1-size');
      var b = document.getElementById('merch-fld-t2-s1-color');
      var c = document.getElementById('merch-fld-t2-s2-design');
      var d = document.getElementById('merch-fld-t2-s2-size');
      var e = document.getElementById('merch-fld-t2-s2-color');
      if (a) a.value = det.shirt1.size || '';
      if (b) b.value = det.shirt1.color || '';
      if (c) {
        var dv = det.shirt2.design || '';
        if (dv === '1') dv = 'collective';
        if (dv === '2') dv = 'dark_mode';
        c.value = dv;
      }
      if (d) d.value = det.shirt2.size || '';
      if (e) e.value = det.shirt2.color || '';
      onTier2DesignChange();
    } else if (tier === 3 && det.shirt && det.nft_customization && det.hoodie) {
      var s = document.getElementById('merch-fld-t3-shirt-size');
      var col = document.getElementById('merch-fld-t3-nft-collection');
      var num = document.getElementById('merch-fld-t3-nft-number');
      var h = document.getElementById('merch-fld-t3-hoodie-size');
      if (s) s.value = det.shirt.size || '';
      if (col) col.value = det.nft_customization.collection || '';
      if (num) num.value = det.nft_customization.nft_number != null ? String(det.nft_customization.nft_number) : '';
      if (h) h.value = det.hoodie.size || '';
    } else if (tier === 4 && det.shirt1 && det.shirt2 && det.zip_hoodie) {
      var u = document.getElementById('merch-fld-t4-t1-size');
      var v = document.getElementById('merch-fld-t4-t2-size');
      var w = document.getElementById('merch-fld-t4-zip-size');
      if (u) u.value = det.shirt1.size || '';
      if (v) v.value = det.shirt2.size || '';
      if (w) w.value = det.zip_hoodie.size || '';
    }
  }

  function validateShippingForm() {
    var xEl = document.getElementById('merch-shipping-x');
    var discEl = document.getElementById('merch-shipping-discord');
    var st1 = document.getElementById('merch-shipping-street1');
    var st2 = document.getElementById('merch-shipping-street2');
    var cityEl = document.getElementById('merch-shipping-city');
    var countryEl = document.getElementById('merch-shipping-country');
    var postEl = document.getElementById('merch-shipping-postal');
    var xHandle = xEl && xEl.value.trim();
    var discordDisplay = discEl && discEl.value.trim();
    var street1 = st1 && st1.value.trim();
    var street2 = st2 && st2.value.trim();
    var city = cityEl && cityEl.value.trim();
    var country = countryEl && countryEl.value.trim();
    var postal = postEl && postEl.value.trim();
    if (!xHandle) return { ok: false, message: 'Enter your X handle.' };
    var mv = validateMerchChoicesForTier();
    if (!mv.ok) return mv;
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
    var mt = pendingMerchTier != null && pendingMerchTier >= 1 && pendingMerchTier <= 4 ? pendingMerchTier : null;
    return {
      ok: true,
      payload: {
        x_handle: xHandle,
        discord_display: discordDisplay || '',
        merch_tier: mt,
        merch_claim_details: collectMerchClaimDetails(),
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
    fetchWithCreds(merchApiUrl('pack-fee'), { cache: 'no-store' })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (packRes) {
        if (!packRes.ok || !packRes.data || !packRes.data.lamports || !packRes.data.destination) {
          var em = (packRes.data && packRes.data.error) || 'Could not load packaging fee. Try again.';
          throw new Error(em);
        }
        return buildAndSendMerchPackFeePayment(packRes.data.lamports, packRes.data.destination).then(function (sig) {
          return { signature: sig, lamports: String(packRes.data.lamports) };
        });
      })
      .then(function (payment) {
        return fetchWithCreds(merchApiUrl('submit-claim'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code,
            wallet: pk,
            x_handle: payload.x_handle,
            discord_handle: payload.discord_display || '',
            merch_claim_details: payload.merch_claim_details,
            delivery_address: payload.delivery_address,
            payment_signature: payment.signature,
            payment_lamports: payment.lamports,
          }),
        }).then(function (r) {
          return r.json().then(function (data) {
            return { ok: r.ok, data: data, localSig: payment.signature };
          });
        });
      })
      .then(function (res) {
        if (res.ok && res.data && res.data.ok) {
          setReviewModal(false);
          finishClaimSession();
          var txSig = (res.data && res.data.payment_signature) || res.localSig;
          setSuccessModal(true, txSig);
          return;
        }
        var msg = (res.data && res.data.error) || 'Could not submit. Try again.';
        if (reviewErr) {
          reviewErr.textContent = msg;
          reviewErr.hidden = false;
        }
      })
      .catch(function (err) {
        if (reviewErr) {
          reviewErr.textContent = (err && err.message) || 'Network error. Try again.';
          reviewErr.hidden = false;
        }
      })
      .finally(function () {
        if (confirmBtn) confirmBtn.disabled = false;
      });
  }

  function resetShippingForm() {
    var xEl = document.getElementById('merch-shipping-x');
    var st1 = document.getElementById('merch-shipping-street1');
    var st2 = document.getElementById('merch-shipping-street2');
    var cityEl = document.getElementById('merch-shipping-city');
    var countryEl = document.getElementById('merch-shipping-country');
    var postEl = document.getElementById('merch-shipping-postal');
    if (xEl) xEl.value = '';
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
    renderMerchTierShippingFields(pendingMerchTier);
    syncMerchShippingTierLine();
  }

  function syncMerchShippingTierLine() {
    var row = document.getElementById('merch-shipping-pack-row');
    var line = document.getElementById('merch-shipping-tier-line');
    if (!line) return;
    if (pendingMerchTier != null && pendingMerchTier >= 1 && pendingMerchTier <= 4) {
      line.textContent = merchPackTierLabel(pendingMerchTier);
      if (row) row.hidden = false;
    } else {
      line.textContent = '';
      if (row) row.hidden = true;
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
    syncMerchShippingTierLine();
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
      })
      .finally(function () {
        syncMerchShippingTierLine();
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
          var t = res.data.tier;
          pendingMerchTier =
            t != null && !isNaN(parseInt(t, 10)) ? parseInt(t, 10) : null;
          if (pendingMerchTier != null && (pendingMerchTier < 1 || pendingMerchTier > 4)) {
            pendingMerchTier = null;
          }
          setClaimModal(false);
          populateMerchCongratsModal();
          setMerchCongratsModal(true);
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
    populateCountriesSelect();
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
    document.getElementById('merch-congrats-modal-close')?.addEventListener('click', abandonMerchCongrats);
    document.getElementById('merch-congrats-modal-backdrop')?.addEventListener('click', abandonMerchCongrats);
    document.getElementById('merch-congrats-modal-cancel')?.addEventListener('click', abandonMerchCongrats);
    document.getElementById('merch-congrats-modal-continue')?.addEventListener('click', continueMerchCongratsToShipping);
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
    document.getElementById('merch-shipping-view-options-btn')?.addEventListener('click', openMerchPackOptionsReference);
    document.getElementById('merch-reference-modal-close')?.addEventListener('click', function () {
      setMerchReferenceModal(false);
    });
    document.getElementById('merch-reference-modal-backdrop')?.addEventListener('click', function () {
      setMerchReferenceModal(false);
    });

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
  window.openMerchShippingAfterCongrats = continueMerchCongratsToShipping;
})();
