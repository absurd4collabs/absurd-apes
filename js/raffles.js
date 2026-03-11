/**
 * Raffles page: admin panel (create raffle + NFT picker), active raffle cards, entries modal.
 * Depends: app.js (getWalletPublicKey, getSolanaProvider), config (tokenMint), optional solanaWeb3 for NFT transfer.
 */
(function () {
  var TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  var ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
  var SOLANA_RPC = window.location.origin + '/api/solana-rpc';

  function getWalletPublicKey() {
    return typeof window.getWalletPublicKey === 'function' ? window.getWalletPublicKey() : null;
  }
  function getSolanaProvider() {
    return typeof window.getSolanaProvider === 'function' ? window.getSolanaProvider() : null;
  }

  function fetchWithCreds(url, opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    options.credentials = options.credentials || 'include';
    return fetch(url, options);
  }

  var selectedNft = null;
  var tokenInfoCache = {};
  var customTokenDecimals = 6;

  function setMsg(text, isErr) {
    var msgEl = document.getElementById('raffles-admin-msg');
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.hidden = !text;
    msgEl.classList.toggle('raffles-admin__msg--err', !!isErr);
    msgEl.classList.toggle('raffles-admin__msg--ok', !isErr);
  }

  function initRafflesPage() {
    var adminEl = document.getElementById('raffles-admin');
    var listGrid = document.getElementById('raffles-list-grid');
    var listEmpty = document.getElementById('raffles-list-empty');
    if (!adminEl || !listGrid) return;

    fetchWithCreds(window.location.origin + '/api/raffles/admin-check')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        adminEl.hidden = !data.admin;
        if (data.admin) {
          setMinEndTime();
          bindAdminForm();
        }
      })
      .catch(function () { adminEl.hidden = true; });

    fetchWithCreds(window.location.origin + '/api/raffles', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var raffles = data.raffles || [];
        listEmpty.hidden = raffles.length > 0;
        listGrid.innerHTML = '';
        raffles.forEach(function (r) { listGrid.appendChild(renderRaffleCard(r)); });
      })
      .catch(function () {
        listEmpty.hidden = false;
        listGrid.innerHTML = '';
      });
  }

  function setMinEndTime() {
    var input = document.getElementById('raffles-ends-at');
    if (!input) return;
    var now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    input.min = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
  }

  function bindAdminForm() {
    var selectNftBtn = document.getElementById('raffles-select-nft');
    var tokenType = document.getElementById('raffles-token-type');
    var customWrap = document.getElementById('raffles-custom-token-wrap');
    var customMint = document.getElementById('raffles-custom-mint');
    var customInfo = document.getElementById('raffles-custom-token-info');
    var startBtn = document.getElementById('raffles-start-btn');
    var msgEl = document.getElementById('raffles-admin-msg');

    if (selectNftBtn) selectNftBtn.addEventListener('click', openNftPicker);
    if (tokenType) tokenType.addEventListener('change', function () {
      customWrap.hidden = tokenType.value !== 'custom';
      customInfo.textContent = '';
      customTokenDecimals = 6;
    });
    if (customMint) {
      var debounce;
      customMint.addEventListener('input', function () {
        clearTimeout(debounce);
        var mint = customMint.value.trim();
        customInfo.textContent = mint ? 'Loading…' : '';
        customTokenDecimals = 6;
        if (!mint) return;
        debounce = setTimeout(function () {
          fetchWithCreds(window.location.origin + '/api/token-info?mint=' + encodeURIComponent(mint))
            .then(function (r) { return r.json(); })
            .then(function (d) {
              customTokenDecimals = typeof d.decimals === 'number' ? d.decimals : 6;
              customInfo.textContent = (d.symbol || d.name) ? (d.symbol + ' — ' + d.name) : 'Token found';
            })
            .catch(function () { customInfo.textContent = 'Could not load token'; });
        }, 400);
      });
    }
    var nftPreview = document.getElementById('raffles-nft-preview');
    var nftPreviewImg = document.getElementById('raffles-nft-preview-img');
    var nftPreviewName = document.getElementById('raffles-nft-preview-name');
    function updateNftPreview() {
      if (!nftPreview || !nftPreviewImg || !nftPreviewName) return;
      if (selectedNft) {
        nftPreview.hidden = false;
        nftPreviewImg.src = selectedNft.image || '';
        nftPreviewImg.alt = selectedNft.name || '';
        nftPreviewName.textContent = selectedNft.name || selectedNft.id || 'Selected';
      } else {
        nftPreview.hidden = true;
      }
    }
    updateNftPreview();
    setInterval(updateNftPreview, 500);
  }

  function openNftPicker() {
    var modal = document.getElementById('raffles-nft-modal');
    var hint = document.getElementById('raffles-nft-modal-hint');
    var grid = document.getElementById('raffles-nft-modal-grid');
    var wallet = getWalletPublicKey();
    if (!wallet) {
      hint.textContent = 'Connect your wallet first, then try again.';
      grid.innerHTML = '';
      if (modal) { modal.setAttribute('aria-hidden', 'false'); }
      return;
    }
    hint.textContent = 'Loading NFTs…';
    grid.innerHTML = '';
    if (modal) modal.setAttribute('aria-hidden', 'false');

    fetchWithCreds(window.location.origin + '/api/nfts?wallet=' + encodeURIComponent(wallet))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var nfts = data.nfts || [];
        hint.textContent = nfts.length === 0 ? 'No NFTs found in this wallet.' : 'Click an NFT to select as prize.';
        nfts.forEach(function (nft) {
          var item = document.createElement('button');
          item.type = 'button';
          item.className = 'raffles-modal__nft-item';
          item.innerHTML = '<img src="' + (nft.image ? escapeHtml(proxyImageUrl(nft.image)) : '') + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" /><span>' + escapeHtml(nft.name || nft.id) + '</span>';
          item.addEventListener('click', function () {
            selectedNft = { id: nft.id, name: nft.name, image: nft.image };
            var preview = document.getElementById('raffles-nft-preview');
            var previewImg = document.getElementById('raffles-nft-preview-img');
            var previewName = document.getElementById('raffles-nft-preview-name');
            if (preview) preview.hidden = false;
            if (previewImg) previewImg.src = nft.image ? proxyImageUrl(nft.image) : '';
            if (previewName) previewName.textContent = nft.name || nft.id || 'Selected';
            closeNftModal();
          });
          grid.appendChild(item);
        });
      })
      .catch(function () {
        hint.textContent = 'Failed to load NFTs. Try again.';
      });
  }

  function closeNftModal() {
    var modal = document.getElementById('raffles-nft-modal');
    if (modal) modal.setAttribute('aria-hidden', 'true');
  }
  function closeEntriesModal() {
    var modal = document.getElementById('raffles-entries-modal');
    if (modal) modal.setAttribute('aria-hidden', 'true');
  }

  document.getElementById('raffles-nft-modal-close')?.addEventListener('click', closeNftModal);
  document.getElementById('raffles-nft-modal-backdrop')?.addEventListener('click', closeNftModal);
  document.getElementById('raffles-entries-modal-close')?.addEventListener('click', closeEntriesModal);
  document.getElementById('raffles-entries-modal-backdrop')?.addEventListener('click', closeEntriesModal);

  function escapeHtml(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  /** Use same-origin proxy for external image URLs to avoid cross-site cookies and CORS. */
  function proxyImageUrl(url) {
    if (!url || !url.trim()) return '';
    var u = url.trim();
    if (u.startsWith('/') && !u.startsWith('//')) return u;
    try {
      var origin = window.location.origin;
      var parsed = new URL(u, origin);
      if (parsed.origin === origin) return u;
    } catch (e) { /* ignore */ }
    return window.location.origin + '/api/proxy-image?url=' + encodeURIComponent(u);
  }

  function getTicketPriceTokenType() {
    var tokenType = document.getElementById('raffles-token-type');
    return tokenType ? tokenType.value : 'sol';
  }
  /** Get ticket price as whole units (e.g. 1.5 SOL) and convert to raw string for the API. */
  function getTicketPriceRawFromWholeUnits() {
    var input = document.getElementById('raffles-ticket-price');
    var val = input ? input.value : '';
    var num = parseFloat(String(val).replace(/,/g, '').trim());
    if (isNaN(num) || num < 0) return null;
    var type = getTicketPriceTokenType();
    var decimals = 9;
    if (type === 'sol') decimals = 9;
    else if (type === 'aaa') decimals = 6;
    else decimals = customTokenDecimals;
    var raw = Math.round(num * Math.pow(10, decimals));
    return String(raw);
  }
  function getTicketPriceTokenMint() {
    var type = getTicketPriceTokenType();
    if (type === 'aaa' && window.ABSURD_APES_CONFIG && window.ABSURD_APES_CONFIG.tokenMint) return window.ABSURD_APES_CONFIG.tokenMint;
    if (type === 'custom') return document.getElementById('raffles-custom-mint')?.value?.trim() || null;
    return null;
  }
  function getTicketPriceDecimals() {
    var type = getTicketPriceTokenType();
    if (type === 'sol') return 9;
    if (type === 'aaa') return 6;
    return customTokenDecimals;
  }

  function startRaffle() {
    console.log('[Raffles] Start raffle clicked');
    var msgEl = document.getElementById('raffles-admin-msg');
    var startBtn = document.getElementById('raffles-start-btn');
    if (msgEl) { msgEl.hidden = true; msgEl.className = 'raffles-admin__msg'; msgEl.textContent = ''; }

    if (!selectedNft || !selectedNft.id) {
      setMsg('Select a prize NFT first.', true);
      return;
    }
    var ticketCountEl = document.getElementById('raffles-ticket-count');
    var ticketCount = ticketCountEl ? parseInt(ticketCountEl.value, 10) : 0;
    if (isNaN(ticketCount) || ticketCount < 1) {
      setMsg('Set a valid number of tickets.', true);
      return;
    }
    var priceRaw = getTicketPriceRawFromWholeUnits();
    if (priceRaw === null || priceRaw === '0') {
      setMsg('Set the ticket price (e.g. 1 for 1 SOL, 100 for 100 AAA).', true);
      return;
    }
    var endsAtEl = document.getElementById('raffles-ends-at');
    var endsAt = endsAtEl ? endsAtEl.value : '';
    if (!endsAt) {
      setMsg('Set the raffle end date and time.', true);
      return;
    }
    var endsAtDate = new Date(endsAt);
    if (isNaN(endsAtDate.getTime()) || endsAtDate <= new Date()) {
      setMsg('End time must be in the future.', true);
      return;
    }

    var tokenType = getTicketPriceTokenType();
    var tokenMint = getTicketPriceTokenMint();
    if (tokenType === 'custom' && !tokenMint) {
      setMsg('Enter the custom token mint address.', true);
      return;
    }

    if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Creating…'; }

    var body = {
      prizeNftMint: selectedNft.id,
      prizeNftName: selectedNft.name || null,
      prizeNftImage: selectedNft.image || null,
      ticketCount: ticketCount,
      ticketPriceTokenType: tokenType,
      ticketPriceTokenMint: tokenMint || undefined,
      ticketPriceRaw: String(priceRaw),
      ticketPriceDecimals: getTicketPriceDecimals(),
      endsAt: endsAtDate.toISOString(),
    };

    var createUrl = window.location.origin + '/api/raffles?t=' + Date.now();
    console.log('[Raffles] POST', createUrl, '— creating raffle (look for this URL in Network tab)');
    fetchWithCreds(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'manual',
    })
      .then(function (r) {
        return r.text().then(function (text) {
          if (r.type === 'opaqueredirect' || r.status === 302 || r.status === 301) {
            throw new Error('Server redirected (session may have expired). Please refresh and connect Discord again, then try Start raffle.');
          }
          if (!r.ok) {
            var j;
            try { j = text ? JSON.parse(text) : {}; } catch (e) { j = {}; }
            throw new Error(j.error || r.statusText || 'Request failed');
          }
          var raffle = null;
          try { raffle = text ? JSON.parse(text) : null; } catch (e) { raffle = null; }
          return { status: r.status, text: text, raffle: raffle };
        });
      })
      .then(function (result) {
        var raffle = result.raffle;
        var hasId = raffle != null && typeof raffle === 'object' && ('id' in raffle) && (raffle.id === 0 || raffle.id === '0' || (raffle.id !== undefined && raffle.id !== null && raffle.id !== ''));
        if (!hasId) {
          console.warn('[Raffles] Create raffle response: status=' + result.status + ', bodyLength=' + (result.text ? result.text.length : 0) + ', bodyPreview=' + (result.text ? result.text.slice(0, 300) : 'empty'));
          console.warn('[Raffles] So the POST did run; in Network tab filter by "raffles" or "api/raffles" to find it.');
          setMsg('Server error: invalid response after creating raffle. Restart the server and try again. (Check console for response details.)', true);
          if (startBtn) { startBtn.disabled = false; startBtn.textContent = 'Start raffle'; }
          return;
        }
        var prizeWallet = (raffle.prizeWallet || raffle.prize_wallet || '').trim();
        if (!prizeWallet) {
          setMsg('Raffle created but prize wallet missing from server. Add PRIZE_WALLET to .env (Solana address), restart the server, then create again. You can send the NFT to your prize wallet manually.', true);
          initRafflesPage();
          if (startBtn) { startBtn.disabled = false; startBtn.textContent = 'Start raffle'; }
          return;
        }
        initRafflesPage();
        setMsg('Raffle created. Sending NFT to prize wallet — confirm in your wallet…', false);
        if (startBtn) startBtn.textContent = 'Confirm in wallet…';
        return transferNftToPrizeWallet(selectedNft.id, prizeWallet).then(function (sig) {
          setMsg('Raffle started. NFT sent. Tx: ' + (sig || '').slice(0, 16) + '…', false);
          selectedNft = null;
          var nftPreview = document.getElementById('raffles-nft-preview');
          if (nftPreview) nftPreview.hidden = true;
          initRafflesPage();
        }).catch(function (err) {
          var msg = err && err.message ? err.message : String(err);
          if (/user rejected|4001|denied/i.test(msg)) {
            setMsg('Transfer cancelled. Raffle was created — you can send the NFT to the prize wallet manually.', true);
          } else {
            setMsg('Raffle created but NFT transfer failed: ' + msg, true);
          }
          initRafflesPage();
        });
      })
      .catch(function (err) {
        setMsg(err && err.message ? err.message : 'Failed to create raffle.', true);
      })
      .finally(function () {
        if (startBtn) { startBtn.disabled = false; startBtn.textContent = 'Start raffle'; }
      });
  }

  function transferNftToPrizeWallet(nftMint, prizeWallet) {
    var provider = getSolanaProvider();
    var wallet = getWalletPublicKey();
    if (!provider || !wallet) return Promise.reject(new Error('Wallet not connected'));

    var solanaWeb3 = window.solanaWeb3;
    if (!solanaWeb3 || !solanaWeb3.Connection || !solanaWeb3.PublicKey || !solanaWeb3.Transaction || !solanaWeb3.TransactionInstruction) {
      return Promise.reject(new Error('Solana web3 not loaded. Refresh the page.'));
    }

    var Connection = solanaWeb3.Connection;
    var PublicKey = solanaWeb3.PublicKey;
    var Transaction = solanaWeb3.Transaction;
    var TransactionInstruction = solanaWeb3.TransactionInstruction;

    var connection = new Connection(SOLANA_RPC, 'confirmed');
    var mintPk = new PublicKey(nftMint);
    var ownerPk = new PublicKey(wallet);
    var destPk = new PublicKey(prizeWallet);
    var tokenProgramId = new PublicKey(TOKEN_PROGRAM_ID);
    var ataProgramId = new PublicKey(ATA_PROGRAM_ID);

    function findAta(owner, mint, tokenProgram) {
      var tp = tokenProgram || tokenProgramId;
      var seeds = [owner.toBuffer(), tp.toBuffer(), mint.toBuffer()];
      var out = PublicKey.findProgramAddressSync(seeds, ataProgramId);
      return out[0];
    }

    function buildAndSendTx() {
      var instructions = [];
      var sysProgramId = new PublicKey('11111111111111111111111111111111');
      var rentId = new PublicKey('SysvarRent111111111111111111111111111111111');

      return connection.getAccountInfo(mintPk).then(function (mintInfo) {
        if (!mintInfo || !mintInfo.owner || !mintInfo.data) return Promise.reject(new Error('Could not load NFT mint.'));
        var actualTokenProgram = new PublicKey(mintInfo.owner);
        var mintData = mintInfo.data;
        var decimals = mintData.length > 44 ? mintData[44] : 0;
        var sourceAta = findAta(ownerPk, mintPk, actualTokenProgram);
        var destAta = findAta(destPk, mintPk, actualTokenProgram);
        return connection.getAccountInfo(sourceAta).then(function (sourceInfo) {
          if (!sourceInfo || !sourceInfo.data) return Promise.reject(new Error('You don’t own this NFT in the connected wallet.'));
          var data = sourceInfo.data;
          if (data.length < 72) return Promise.reject(new Error('Invalid token account data.'));
          var amountView = new DataView(data.buffer || data, data.byteOffset + 64, 8);
          var amount = amountView.getBigUint64(0, true);
          if (amount < 1) return Promise.reject(new Error('You don’t own this NFT in the connected wallet.'));
          return { actualTokenProgram: actualTokenProgram, sourceAta: sourceAta, destAta: destAta, decimals: decimals };
        });
      }).then(function (opts) {
        var actualTokenProgram = opts.actualTokenProgram;
        var sourceAta = opts.sourceAta;
        var destAta = opts.destAta;
        var decimals = opts.decimals != null ? opts.decimals : 0;
        return connection.getAccountInfo(destAta).then(function (info) {
          if (!info) {
            var createIx = new TransactionInstruction({
              keys: [
                { pubkey: ownerPk, isSigner: true, isWritable: true },
                { pubkey: destAta, isSigner: false, isWritable: true },
                { pubkey: destPk, isSigner: false, isWritable: false },
                { pubkey: mintPk, isSigner: false, isWritable: false },
                { pubkey: sysProgramId, isSigner: false, isWritable: false },
                { pubkey: actualTokenProgram, isSigner: false, isWritable: false },
                { pubkey: ataProgramId, isSigner: false, isWritable: false },
                { pubkey: rentId, isSigner: false, isWritable: false },
              ],
              programId: ataProgramId,
              data: new Uint8Array([1]),
            });
            instructions.push(createIx);
          }

          var transferData = new Uint8Array(10);
          transferData[0] = 12;
          new DataView(transferData.buffer, transferData.byteOffset, transferData.byteLength).setBigUint64(1, BigInt(1), true);
          transferData[9] = decimals;
          var transferIx = new TransactionInstruction({
            keys: [
              { pubkey: sourceAta, isSigner: false, isWritable: true },
              { pubkey: mintPk, isSigner: false, isWritable: false },
              { pubkey: destAta, isSigner: false, isWritable: true },
              { pubkey: ownerPk, isSigner: true, isWritable: false },
            ],
            programId: actualTokenProgram,
            data: transferData,
          });
          instructions.push(transferIx);

        var tx = new Transaction();
        instructions.forEach(function (ix) { tx.add(ix); });

        return connection.getLatestBlockhash('confirmed').then(function (bh) {
          var blockhash = (bh && bh.value && bh.value.blockhash) ? bh.value.blockhash : (bh && bh.blockhash) ? bh.blockhash : null;
          if (!blockhash) return Promise.reject(new Error('Could not get blockhash'));
          tx.recentBlockhash = blockhash;
          tx.feePayer = ownerPk;

          function sendTx() {
            if (typeof provider.signAndSendTransaction === 'function') {
              return Promise.resolve(provider.signAndSendTransaction(tx)).then(normalizeSig);
            }
            var serialized = tx.serialize({ requireAllSignatures: false });
            var raw = serialized && serialized instanceof Uint8Array ? serialized : new Uint8Array(serialized);
            var base64 = typeof raw.toString === 'function' && raw.toString('base64') ? raw.toString('base64') : btoa(String.fromCharCode.apply(null, raw));
            return provider.request({ method: 'signAndSendTransaction', params: { transaction: base64 } }).then(normalizeSig);
          }

          function normalizeSig(result) {
            if (!result) return null;
            if (typeof result === 'string') return result;
            if (result.signature) return result.signature;
            if (result.hash) return result.hash;
            return null;
          }

          if (typeof connection.simulateTransaction === 'function') {
            return connection.simulateTransaction(tx).then(function (sim) {
              var err = sim && sim.value && sim.value.err;
              if (err) {
                var msg = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
                return Promise.reject(new Error('Simulation failed: ' + msg));
              }
              return sendTx();
            });
          }
          return sendTx();
        });
        });
      });
    }

    return buildAndSendTx();
  }

  /** Build, sign and send payment for raffle tickets. Returns { signature, paymentDestination }. */
  function buildAndSendRafflePayment(raffle, count) {
    var provider = getSolanaProvider();
    var wallet = getWalletPublicKey();
    if (!provider || !wallet) return Promise.reject(new Error('Wallet not connected'));
    var treasury = (raffle.treasury || '').trim();
    if (!treasury) return Promise.reject(new Error('Raffle treasury not configured. Cannot pay for tickets.'));
    var raw = String(raffle.ticketPriceRaw || '0').trim();
    var type = (raffle.ticketPriceTokenType || 'sol').toLowerCase();
    var solanaWeb3 = window.solanaWeb3;
    if (!solanaWeb3 || !solanaWeb3.Connection || !solanaWeb3.PublicKey || !solanaWeb3.Transaction || !solanaWeb3.TransactionInstruction) {
      return Promise.reject(new Error('Solana web3 not loaded. Refresh the page.'));
    }
    var Connection = solanaWeb3.Connection;
    var PublicKey = solanaWeb3.PublicKey;
    var Transaction = solanaWeb3.Transaction;
    var TransactionInstruction = solanaWeb3.TransactionInstruction;
    var SystemProgram = solanaWeb3.SystemProgram;
    var connection = new Connection(SOLANA_RPC, 'confirmed');
    var ownerPk = new PublicKey(wallet);
    var treasuryPk = new PublicKey(treasury);

    if (type === 'sol') {
      var lamports = parseInt(raw, 10) * count;
      if (isNaN(lamports) || lamports < 1) return Promise.reject(new Error('Invalid ticket price'));
      var tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: ownerPk,
          toPubkey: treasuryPk,
          lamports: lamports,
        })
      );
      return connection.getLatestBlockhash('confirmed').then(function (bh) {
        var blockhash = (bh && bh.value && bh.value.blockhash) ? bh.value.blockhash : (bh && bh.blockhash) || null;
        if (!blockhash) return Promise.reject(new Error('Could not get blockhash'));
        tx.recentBlockhash = blockhash;
        tx.feePayer = ownerPk;
        if (typeof provider.signAndSendTransaction === 'function') {
          return Promise.resolve(provider.signAndSendTransaction(tx)).then(function (result) {
            var sig = (result && (typeof result === 'string' ? result : result.signature || result.hash)) || null;
            return sig ? { signature: sig, paymentDestination: treasury } : Promise.reject(new Error('No signature returned'));
          });
        }
        var serialized = tx.serialize({ requireAllSignatures: false });
        var rawBuf = serialized && serialized instanceof Uint8Array ? serialized : new Uint8Array(serialized);
        var base64 = typeof rawBuf.toString === 'function' && rawBuf.toString('base64') ? rawBuf.toString('base64') : btoa(String.fromCharCode.apply(null, rawBuf));
        return provider.request({ method: 'signAndSendTransaction', params: { transaction: base64 } }).then(function (result) {
          var sig = (result && (typeof result === 'string' ? result : result.signature || result.hash)) || null;
          return sig ? { signature: sig, paymentDestination: treasury } : Promise.reject(new Error('No signature returned'));
        });
      });
    }

    var mintStr = (type === 'aaa' && window.ABSURD_APES_CONFIG && window.ABSURD_APES_CONFIG.tokenMint) ? window.ABSURD_APES_CONFIG.tokenMint : (raffle.ticketPriceTokenMint || '').trim();
    if (!mintStr) return Promise.reject(new Error('Token mint not configured for this raffle'));
    var mintPk = new PublicKey(mintStr);
    var tokenProgramId = new PublicKey(TOKEN_PROGRAM_ID);
    var ataProgramId = new PublicKey(ATA_PROGRAM_ID);
    function findAta(owner, mint, tokenProgram) {
      var tp = tokenProgram || tokenProgramId;
      var seeds = [owner.toBuffer(), tp.toBuffer(), mint.toBuffer()];
      var out = PublicKey.findProgramAddressSync(seeds, ataProgramId);
      return out[0];
    }
    var storedDecimals = raffle.ticketPriceDecimals != null ? Number(raffle.ticketPriceDecimals) : 6;
    var decimals = type === 'aaa' ? 6 : customTokenDecimals;
    return connection.getAccountInfo(mintPk).then(function (mintInfo) {
      if (mintInfo && mintInfo.owner) {
        var actualTokenProgram = new PublicKey(mintInfo.owner);
        if (mintInfo.data && mintInfo.data.length > 44) decimals = mintInfo.data[44];
        return { actualTokenProgram: actualTokenProgram, decimals: decimals };
      }
      return { actualTokenProgram: tokenProgramId, decimals: decimals };
    }).then(function (opts) {
      var actualTokenProgram = opts.actualTokenProgram;
      var actualDecimals = opts.decimals != null ? opts.decimals : 6;
      var humanPrice = Number(raw) / Math.pow(10, storedDecimals);
      var amountRaw = BigInt(Math.round(humanPrice * Math.pow(10, actualDecimals) * count));
      if (amountRaw < 1) return Promise.reject(new Error('Invalid ticket price or count'));
      var decimals = actualDecimals;
      var sourceAta = findAta(ownerPk, mintPk, actualTokenProgram);
      var destAta = findAta(treasuryPk, mintPk, actualTokenProgram);
      var sysProgramId = new PublicKey('11111111111111111111111111111111');
      var rentId = new PublicKey('SysvarRent111111111111111111111111111111111');
      var instructions = [];
      return connection.getAccountInfo(destAta).then(function (info) {
        if (!info) {
          instructions.push(new TransactionInstruction({
            keys: [
              { pubkey: ownerPk, isSigner: true, isWritable: true },
              { pubkey: destAta, isSigner: false, isWritable: true },
              { pubkey: treasuryPk, isSigner: false, isWritable: false },
              { pubkey: mintPk, isSigner: false, isWritable: false },
              { pubkey: sysProgramId, isSigner: false, isWritable: false },
              { pubkey: actualTokenProgram, isSigner: false, isWritable: false },
              { pubkey: ataProgramId, isSigner: false, isWritable: false },
              { pubkey: rentId, isSigner: false, isWritable: false },
            ],
            programId: ataProgramId,
            data: new Uint8Array([1]),
          }));
        }
        return null;
      }).then(function () {
        var transferData = new Uint8Array(10);
        transferData[0] = 12;
        var dv = new DataView(transferData.buffer, transferData.byteOffset, transferData.byteLength);
        var amt = amountRaw > BigInt('0xffffffffffffffff') ? BigInt('0xffffffffffffffff') : amountRaw;
        dv.setBigUint64(1, amt, true);
        transferData[9] = decimals;
        instructions.push(new TransactionInstruction({
          keys: [
            { pubkey: sourceAta, isSigner: false, isWritable: true },
            { pubkey: mintPk, isSigner: false, isWritable: false },
            { pubkey: destAta, isSigner: false, isWritable: true },
            { pubkey: ownerPk, isSigner: true, isWritable: false },
          ],
          programId: actualTokenProgram,
          data: transferData,
        }));
        var tx = new Transaction();
        instructions.forEach(function (ix) { tx.add(ix); });
        return connection.getLatestBlockhash('confirmed').then(function (bh) {
          var blockhash = (bh && bh.value && bh.value.blockhash) ? bh.value.blockhash : (bh && bh.blockhash) || null;
          if (!blockhash) return Promise.reject(new Error('Could not get blockhash'));
          tx.recentBlockhash = blockhash;
          tx.feePayer = ownerPk;
          if (typeof provider.signAndSendTransaction === 'function') {
            return Promise.resolve(provider.signAndSendTransaction(tx)).then(function (result) {
              var sig = (result && (typeof result === 'string' ? result : result.signature || result.hash)) || null;
              return sig ? { signature: sig, paymentDestination: destAta.toString() } : Promise.reject(new Error('No signature returned'));
            });
          }
          var serialized = tx.serialize({ requireAllSignatures: false });
          var rawBuf = serialized && serialized instanceof Uint8Array ? serialized : new Uint8Array(serialized);
          var base64 = typeof rawBuf.toString === 'function' && rawBuf.toString('base64') ? rawBuf.toString('base64') : btoa(String.fromCharCode.apply(null, rawBuf));
          return provider.request({ method: 'signAndSendTransaction', params: { transaction: base64 } }).then(function (result) {
            var sig = (result && (typeof result === 'string' ? result : result.signature || result.hash)) || null;
            return sig ? { signature: sig, paymentDestination: destAta.toString() } : Promise.reject(new Error('No signature returned'));
          });
        });
      });
    });
  }

  function renderRaffleCard(r) {
    var card = document.createElement('article');
    card.className = 'raffle-card';
    var sold = r.ticketsSold != null ? r.ticketsSold : 0;
    var total = r.ticketCount || 0;
    var price = formatPrice(r);
    var priceHtml = (price.imageUrl ? '<img class="raffle-card__token-icon" src="' + escapeHtml(price.imageUrl) + '" alt="" aria-hidden="true" />' : '') +
      '<span class="raffle-card__price-amount">' + escapeHtml(price.amountStr) + '</span> <span class="raffle-card__price-symbol">' + escapeHtml(price.symbol) + '</span>';
    var endsAt = r.endsAt ? new Date(r.endsAt) : null;
    var isEnded = endsAt && endsAt <= new Date();
    var maxPerWallet = Math.max(0, Math.floor(total * 0.2));
    var remaining = Math.max(0, total - sold);
    var winnerWallet = (r.winnerWallet || '').toLowerCase();
    var myWallet = (getWalletPublicKey() || '').toLowerCase();
    var showClaim = isEnded && winnerWallet && myWallet && winnerWallet === myWallet;
    var showBuy = !isEnded && remaining >= 1;
    card.innerHTML =
      '<div class="raffle-card__image-wrap">' +
        '<img class="raffle-card__image" src="' + escapeHtml(r.prizeNftImage ? proxyImageUrl(r.prizeNftImage) : '') + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" />' +
      '</div>' +
      '<div class="raffle-card__body">' +
        '<h3 class="raffle-card__name">' + escapeHtml(r.prizeNftName || 'Prize NFT') + '</h3>' +
        '<p class="raffle-card__meta">Ticket: <span class="raffle-card__price" data-token-mint="' + (price.mint ? escapeHtml(price.mint) : '') + '">' + priceHtml + '</span></p>' +
        '<div class="raffle-card__row">' +
          '<span class="raffle-card__meta">Tickets</span>' +
          '<span class="raffle-card__meta">' + sold + ' / ' + total + '</span>' +
        '</div>' +
        '<div class="raffle-card__row">' +
          '<span class="raffle-card__meta">Ends</span>' +
          '<span class="raffle-card__meta raffle-card__time" data-ends="' + (r.endsAt || '') + '">' + (endsAt ? formatTimeLeft(endsAt) : '—') + '</span>' +
        '</div>' +
        (showBuy
          ? '<div class="raffle-card__buy">' +
              '<label class="raffle-card__buy-label"><span class="raffle-card__meta">Number of tickets</span></label>' +
              '<input type="number" class="raffle-card__buy-input" min="1" max="' + Math.min(maxPerWallet, remaining) + '" value="1" data-raffle-id="' + r.id + '" data-max="' + maxPerWallet + '" data-remaining="' + remaining + '" />' +
              '<button type="button" class="btn btn--primary raffle-card__btn raffle-buy-btn" data-id="' + r.id + '">Buy tickets</button>' +
            '</div>'
          : '') +
        '<div class="raffle-card__actions">' +
          '<button type="button" class="btn btn--outline raffle-card__btn raffle-entries-btn" data-id="' + r.id + '">Entries</button>' +
          (showClaim ? '<button type="button" class="btn btn--primary raffle-card__btn raffle-claim-btn" data-id="' + r.id + '">Claim</button>' : '') +
        '</div>' +
      '</div>';
    var entriesBtn = card.querySelector('.raffle-entries-btn');
    if (entriesBtn) entriesBtn.addEventListener('click', function () { openEntriesModal(r.id); });
    var claimBtn = card.querySelector('.raffle-claim-btn');
    if (claimBtn) claimBtn.addEventListener('click', function () {
      var wallet = getWalletPublicKey();
      if (!wallet) {
        setMsg('Connect your wallet to claim.', true);
        return;
      }
      claimBtn.disabled = true;
      claimBtn.textContent = 'Claiming…';
      fetchWithCreds(window.location.origin + '/api/raffles/' + r.id + '/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet }),
      })
        .then(function (res) { return res.json().then(function (body) { return { status: res.status, body: body }; }); })
        .then(function (x) {
          if (x.status === 200 && x.body.signature) {
            setMsg('Prize sent to your wallet. Tx: ' + x.body.signature.slice(0, 16) + '…', false);
            claimBtn.textContent = 'Claimed';
            claimBtn.disabled = true;
            initRafflesPage();
          } else {
            setMsg(x.body.error || 'Claim failed.', true);
            claimBtn.disabled = false;
            claimBtn.textContent = 'Claim';
          }
        })
        .catch(function (err) {
          setMsg(err && err.message ? err.message : 'Claim failed.', true);
          claimBtn.disabled = false;
          claimBtn.textContent = 'Claim';
        });
    });
    var buyBtn = card.querySelector('.raffle-buy-btn');
    var buyInput = card.querySelector('.raffle-card__buy-input');
    if (buyBtn && buyInput) {
      buyBtn.addEventListener('click', function () {
        var count = parseInt(buyInput.value, 10);
        var wallet = getWalletPublicKey();
        if (!wallet) {
          setMsg('Connect your wallet to buy tickets.', true);
          return;
        }
        if (!Number.isInteger(count) || count < 1) {
          setMsg('Enter a valid number of tickets.', true);
          return;
        }
        if (count > maxPerWallet) {
          setMsg('Maximum ' + maxPerWallet + ' tickets per wallet for this raffle.', true);
          return;
        }
        if (remaining < 1 || count > remaining) {
          setMsg('Not enough tickets left.', true);
          return;
        }
        buyBtn.disabled = true;
        buyBtn.textContent = 'Buying…';
        fetchWithCreds(window.location.origin + '/api/raffles/' + r.id + '/my-tickets?wallet=' + encodeURIComponent(wallet))
          .then(function (res) { return res.json(); })
          .then(function (data) {
            var current = (data && typeof data.ticketCount === 'number') ? data.ticketCount : 0;
            if (current >= maxPerWallet) {
              buyBtn.disabled = false;
              buyBtn.textContent = 'Buy tickets';
              setMsg('Maximum ' + maxPerWallet + ' tickets per wallet for this raffle. You already have ' + current + '.', true);
              return null;
            }
            if (current + count > maxPerWallet) {
              buyBtn.disabled = false;
              buyBtn.textContent = 'Buy tickets';
              setMsg('You have ' + current + ' tickets. Maximum ' + maxPerWallet + ' per wallet — you can buy up to ' + (maxPerWallet - current) + ' more.', true);
              return null;
            }
            return buildAndSendRafflePayment(r, count);
          })
          .then(function (pay) {
            if (!pay) return;
            return fetchWithCreds(window.location.origin + '/api/raffles/' + r.id + '/buy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                wallet: wallet,
                count: count,
                signature: pay.signature,
                paymentDestination: pay.paymentDestination,
              }),
            }).then(function (res) { return res.json().then(function (j) { return { status: res.status, body: j }; }); });
          })
          .then(function (x) {
            if (x.status !== 200) throw new Error(x.body && x.body.error ? x.body.error : 'Purchase failed');
            setMsg('Purchased ' + count + ' ticket(s).', false);
            initRafflesPage();
          })
          .catch(function (err) {
            setMsg(err && err.message ? err.message : 'Purchase failed.', true);
          })
          .finally(function () {
            buyBtn.disabled = false;
            buyBtn.textContent = 'Buy tickets';
          });
      });
    }
    if (price.mint) {
      fetchWithCreds(window.location.origin + '/api/token-info?mint=' + encodeURIComponent(price.mint))
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (info) {
          if (!info || !card.parentNode) return;
          var raw = r.ticketPriceRaw || '0';
          var dec = typeof info.decimals === 'number' ? info.decimals : 6;
          var num = parseInt(raw, 10);
          var amountStr = isNaN(num) ? raw : trimTrailingZeros((num / Math.pow(10, dec)).toFixed(dec));
          var symbol = info.symbol || info.name || 'tokens';
          var wrap = card.querySelector('.raffle-card__price');
          if (wrap) {
            wrap.innerHTML = (info.imageUrl ? '<img class="raffle-card__token-icon" src="' + escapeHtml(info.imageUrl) + '" alt="" aria-hidden="true" />' : '') +
              '<span class="raffle-card__price-amount">' + escapeHtml(amountStr) + '</span> <span class="raffle-card__price-symbol">' + escapeHtml(symbol) + '</span>';
          }
        })
        .catch(function () {});
    }
    return card;
  }

  function trimTrailingZeros(s) {
    if (typeof s !== 'string') s = String(s);
    return s.replace(/\.?0+$/, '') || '0';
  }

  function formatPrice(r) {
    var type = (r.ticketPriceTokenType || 'sol').toLowerCase();
    var raw = r.ticketPriceRaw || '0';
    var solLogoUrl = (window.ABSURD_APES_CONFIG && window.ABSURD_APES_CONFIG.hero && window.ABSURD_APES_CONFIG.hero.solanaLogoUrl) || 'https://cryptologos.cc/logos/solana-sol-logo.svg?v=040';
    if (type === 'sol') {
      var lamports = parseInt(raw, 10);
      if (isNaN(lamports)) return { amountStr: raw, symbol: 'SOL', imageUrl: solLogoUrl };
      var solAmount = lamports / 1e9;
      var amountStr = trimTrailingZeros(solAmount.toFixed(Math.min(9, 4)));
      return { amountStr: amountStr, symbol: 'SOL', imageUrl: solLogoUrl };
    }
    if (type === 'aaa') {
      var aaaRaw = parseInt(raw, 10);
      var aaaDecimals = 6;
      var aaaAmount = isNaN(aaaRaw) ? raw : (aaaRaw / Math.pow(10, aaaDecimals));
      return { amountStr: trimTrailingZeros(Number(aaaAmount).toFixed(aaaDecimals)), symbol: 'AAA', imageUrl: '' };
    }
    if (type === 'custom' && r.ticketPriceTokenMint) {
      return { amountStr: raw, symbol: 'tokens', imageUrl: '', mint: r.ticketPriceTokenMint };
    }
    return { amountStr: raw, symbol: 'tokens', imageUrl: '' };
  }

  function formatTimeLeft(endsAt) {
    var now = new Date();
    if (endsAt <= now) return 'Ended';
    var s = Math.floor((endsAt - now) / 1000);
    var m = Math.floor(s / 60);
    var h = Math.floor(m / 60);
    var d = Math.floor(h / 24);
    if (d > 0) return d + 'd ' + (h % 24) + 'h left';
    if (h > 0) return h + 'h ' + (m % 60) + 'm left';
    if (m > 0) return m + 'm left';
    return s + 's left';
  }

  function openEntriesModal(raffleId) {
    var modal = document.getElementById('raffles-entries-modal');
    var list = document.getElementById('raffles-entries-list');
    if (!modal || !list) return;
    list.innerHTML = '<p class="raffles-modal__hint">Loading…</p>';
    modal.setAttribute('aria-hidden', 'false');

    fetchWithCreds(window.location.origin + '/api/raffles/' + raffleId + '/entries')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var entries = data.entries || [];
        list.innerHTML = '';
        if (entries.length === 0) {
          list.innerHTML = '<p class="raffles-modal__hint">No entries yet.</p>';
          return;
        }
        entries.forEach(function (e) {
          var row = document.createElement('div');
          row.className = 'raffles-entries-list__row';
          row.innerHTML = '<span class="raffles-entries-list__wallet">' + escapeHtml(e.walletAddress) + '</span><span class="raffles-entries-list__count">' + e.ticketCount + '</span>';
          list.appendChild(row);
        });
      })
      .catch(function () {
        list.innerHTML = '<p class="raffles-modal__hint">Failed to load entries.</p>';
      });
  }

  setInterval(function () {
    var main = document.getElementById('main-raffles');
    if (!main || main.hidden) return;
    document.querySelectorAll('.raffle-card__time[data-ends]').forEach(function (el) {
      var ends = el.getAttribute('data-ends');
      if (!ends) return;
      var endsAt = new Date(ends);
      el.textContent = formatTimeLeft(endsAt);
    });
  }, 5000);

  document.addEventListener('click', function (e) {
    var btn = e.target && (e.target.id === 'raffles-start-btn' ? e.target : e.target.closest && e.target.closest('#raffles-start-btn'));
    if (btn && !btn.disabled) startRaffle();
  });

  window.initRafflesPage = initRafflesPage;

  // Load raffles list on initial page load when URL is /raffles (app.js runs before this, so showView('raffles') may have run before initRafflesPage existed)
  var path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
  if (path === '/raffles') initRafflesPage();
})();
