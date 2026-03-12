/**
 * Absurd Apes — Express server with Discord OAuth2 login
 * Serves static site and provides /api/discord/* routes.
 *
 * Required env: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, SESSION_SECRET, BASE_URL
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const cookieSession = require('cookie-session');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const bs58 = require('bs58');

const app = express();
const PORT = process.env.PORT || 3000;

const DEFAULT_SESSION_SECRET = 'absurd-apes-session-secret-change-in-production';
const SESSION_SECRET = process.env.SESSION_SECRET || DEFAULT_SESSION_SECRET;
if (process.env.NODE_ENV === 'production' && SESSION_SECRET === DEFAULT_SESSION_SECRET) {
  console.error('Fatal: Set a strong, unique SESSION_SECRET in production. Do not use the default.');
  process.exit(1);
}

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const BASE_URL = (process.env.BASE_URL || 'http://localhost:' + PORT).replace(/\/$/, '');
const REDIRECT_URI = BASE_URL + '/api/discord/callback';

const DISCORD_AUTH_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_USER_URL = 'https://discord.com/api/users/@me';
const SCOPES = 'identify';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_RPC = 'https://mainnet.helius-rpc.com';
const ME_BASE = 'https://api-mainnet.magiceden.dev/v2';

// Collection slugs on Magic Eden; countKey used in API responses (absurdApesCount, col2Count)
const COLLECTIONS = [
  { slug: 'absurd_art_apes', name: 'Absurd Art Apes', collectionMint: process.env.ABSURD_ART_APES_COLLECTION_MINT || '', countKey: 'absurdApesCount' },
  { slug: 'absurd_horizons', name: 'Absurd Horizons', collectionMint: process.env.ABSURD_HORIZONS_COLLECTION_MINT || '', countKey: 'col2Count' },
];

const LAMPORTS_PER_SOL = 1e9;
const AAA_TOKEN_MINT = process.env.AAA_TOKEN_MINT || process.env.TOKEN_MINT || '';
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || process.env.AAA_DECIMALS || '6', 10);

const ADMIN_DISCORD_IDS = (process.env.ADMIN_DISCORD_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const PRIZE_WALLET = (process.env.PRIZE_WALLET || '').trim();
const RAFFLE_TREASURY_WALLET = (process.env.RAFFLE_TREASURY_WALLET || process.env.PRIZE_WALLET || '').trim();

const MAX_TICKET_COUNT_PER_REQUEST = 1000;
const RAFFLE_CREATE_LIMIT = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many raffle creations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const RAFFLE_BUY_LIMIT = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const RAFFLE_CLAIM_LIMIT = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many requests. Try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function isValidSolanaAddress(s) {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  if (t.length < 32 || t.length > 44) return false;
  const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58.test(t);
}

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
  console.warn('Missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET. Set them in .env to enable Discord login.');
}

app.use(cookieParser());
app.use(
  cookieSession({
    name: 'absurd_apes_session',
    keys: [SESSION_SECRET],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
);

app.use(express.static(path.join(__dirname)));

// Avoid 404 for favicon (browsers request it automatically)
app.get('/favicon.ico', function (req, res) {
  res.status(204).end();
});

// ——— Image proxy (same-origin NFT images to avoid cross-site cookies / CORS) ———
const PROXY_IMAGE_HOSTS = [
  'shdw-drive.genesysgo.net',
  'ipfs.dweb.link',
  'cloudflare-ipfs.com',
  'dweb.link',
  'ipfs.io',
  'gateway.pinata.cloud',
  'mypinata.cloud',
  'pinata.cloud',
  'arweave.net',
  'www.arweave.net',
  'cf-ipfs.com',
  'nftstorage.link',
  'ipfs.nftstorage.link',
  'gateway.pinit.io',
  'pinit.io',
  'we-assets.pinit.io',
  'atomicsnfts.com',
  'storage.googleapis.com',
  'ibb.co',
  'img.hi-hi.vip',
  '888jup.com',
  'hi-hi.vip',
  'mara1837891738.com',
  'gateway.irys.xyz',
  'irys.xyz',
];
const PROXY_IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const PROXY_IMAGE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

app.get('/api/proxy-image', async function (req, res) {
  const raw = (req.query.url && String(req.query.url).trim()) || '';
  if (!raw) return res.status(400).send('Missing url');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (e) {
    return res.status(400).send('Invalid url');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return res.status(400).send('Invalid protocol');
  const host = parsed.hostname.toLowerCase();
  const allowed = PROXY_IMAGE_HOSTS.some(function (h) {
    return host === h || host.endsWith('.' + h);
  });
  if (!allowed) return res.status(403).send('Host not allowed');
  try {
    const imgRes = await axios.get(raw, {
      responseType: 'arraybuffer',
      maxContentLength: PROXY_IMAGE_MAX_SIZE,
      timeout: 15000,
      validateStatus: function (s) { return s === 200; },
      headers: {
        Accept: 'image/*,*/*',
        'User-Agent': PROXY_IMAGE_USER_AGENT,
      },
    });
    let type = (imgRes.headers['content-type'] || '').split(';')[0].trim();
    if (!/^image\//i.test(type)) {
      const pathLower = parsed.pathname.toLowerCase();
      if (/\.(png|jpe?g|gif|webp|svg|ico)(\?|$)/i.test(pathLower)) type = 'image/png';
      else return res.status(415).send('Not an image');
    }
    if (!type) type = 'image/png';
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Type', type);
    res.send(imgRes.data);
  } catch (e) {
    if (e.response?.status) return res.status(e.response.status).send('Upstream error');
    res.status(502).send('Proxy error');
  }
});

// Pairs game: standalone page
app.get('/pairs', function (req, res) {
  res.sendFile(path.join(__dirname, 'pairs.html'));
});

// Raffles: SPA route — serve index so client can show raffles view without reload
app.get('/raffles', function (req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ——— Solana RPC proxy (for NFT transfer in browser; public RPC returns 403 from browser) ———
app.post('/api/solana-rpc', express.json(), async function (req, res) {
  if (!HELIUS_API_KEY) return res.status(503).json({ jsonrpc: '2.0', error: { code: -32603, message: 'RPC not configured' }, id: req.body?.id ?? null });
  const body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid request' }, id: null });
  try {
    const rpcRes = await axios.post(
      `${HELIUS_RPC}/?api-key=${HELIUS_API_KEY}`,
      body,
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000, validateStatus: () => true }
    );
    res.setHeader('Content-Type', 'application/json');
    res.status(rpcRes.status).send(rpcRes.data);
  } catch (e) {
    res.status(502).json({ jsonrpc: '2.0', error: { code: -32603, message: e.message || 'RPC proxy error' }, id: body.id ?? null });
  }
});

// ——— Discord OAuth: start ———
app.get('/api/discord/auth', function (req, res) {
  if (!DISCORD_CLIENT_ID) {
    return res.redirect('/?discord=not_configured');
  }
  const state = Math.random().toString(36).slice(2);
  req.session.discordState = state;
  const qs = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    state: state,
  });
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, DISCORD_AUTH_URL + '?' + qs.toString());
});

// ——— Discord OAuth: callback ———
app.get('/api/discord/callback', async function (req, res) {
  const { code, state } = req.query;
  const savedState = req.session.discordState;

  if (!code || state !== savedState) {
    return res.redirect('/?discord=error');
  }
  delete req.session.discordState;

  if (!DISCORD_CLIENT_SECRET) {
    return res.redirect('/?discord=error');
  }

  try {
    const tokenRes = await axios.post(
      DISCORD_TOKEN_URL,
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        validateStatus: () => true,
      }
    );

    if (tokenRes.status !== 200 || !tokenRes.data.access_token) {
      console.warn('Discord token exchange failed', tokenRes.status, tokenRes.data);
      return res.redirect('/?discord=error');
    }

    const userRes = await axios.get(DISCORD_USER_URL, {
      headers: { Authorization: 'Bearer ' + tokenRes.data.access_token },
      validateStatus: () => true,
    });

    if (userRes.status !== 200 || !userRes.data.id) {
      return res.redirect('/?discord=error');
    }

    const user = userRes.data;
    req.session.discord = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator === '0' ? '' : user.discriminator,
      avatar: user.avatar,
      global_name: user.global_name || user.username,
    };
    if (db.upsertUser) {
      db.upsertUser(user.id, user.global_name || user.username, user.avatar).catch((e) =>
        console.warn('DB upsert user:', e.message)
      );
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, '/?discord=connected');
  } catch (err) {
    console.warn('Discord callback error', err.message);
    return res.redirect('/?discord=error');
  }
});

// ——— Current Discord user ———
app.get('/api/discord/me', function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  if (!req.session || !req.session.discord) {
    return res.json({ connected: false });
  }
  res.json({ connected: true, user: req.session.discord });
});

// ——— Logout ———
app.post('/api/discord/logout', function (req, res) {
  delete req.session.discord;
  res.json({ ok: true });
});

app.get('/api/discord/logout', function (req, res) {
  delete req.session.discord;
  res.redirect('/');
});

// ——— Wallets: link / list ———
async function handleWalletsLink(req, res) {
  if (!req.session?.discord) return res.status(401).json({ error: 'Not logged in' });
  let wallet = req.method === 'GET' ? (req.query && req.query.wallet) : (req.body && req.body.wallet);
  if (wallet && typeof wallet !== 'string') wallet = null;
  if (!wallet || !wallet.trim()) return res.status(400).json({ error: 'wallet required' });
  const addr = String(wallet).trim();
  if (addr.length < 32 || addr.length > 64) return res.status(400).json({ error: 'Invalid wallet address' });
  if (!db.linkWallet) return res.status(503).json({ error: 'Database not configured' });
  try {
    await db.linkWallet(req.session.discord.id, req.session.discord.global_name || req.session.discord.username, addr);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true });
}
app.get('/api/wallets/link', handleWalletsLink);
app.post('/api/wallets/link', express.json(), handleWalletsLink);

app.get('/api/wallets', async function (req, res) {
  if (!req.session?.discord) return res.status(401).json({ error: 'Not logged in' });
  if (!db.getWalletsByDiscord) return res.json({ wallets: [] });
  const wallets = await db.getWalletsByDiscord(req.session.discord.id);
  res.json({ wallets });
});

// ——— Pairs: state / buy / play ———
app.get('/api/pairs/state', async function (req, res) {
  if (!req.session?.discord) return res.status(401).json({ error: 'Not logged in' });
  if (!db.getPairsState) return res.json({ state: null });
  const state = await db.getPairsState(req.session.discord.id);
  res.json({ state });
});

app.post('/api/pairs/buy', express.json(), async function (req, res) {
  if (!req.session?.discord) return res.status(401).json({ error: 'Not logged in' });
  const { turns } = req.body || {};
  const n = parseInt(turns, 10);
  if (isNaN(n) || n < 1 || n > 100) return res.status(400).json({ error: 'turns must be 1–100' });
  if (!db.getPairsState || !db.savePairsState) return res.status(503).json({ error: 'Database not configured' });
  try {
    let state = await db.getPairsState(req.session.discord.id);
    if (!state) state = { turnsRemaining: 0, deck: [], flipped: [], matched: {}, prizesWon: [] };
    state.turnsRemaining = (state.turnsRemaining || 0) + n;
    await db.savePairsState(req.session.discord.id, state);
    res.json({ ok: true, turnsRemaining: state.turnsRemaining });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/pairs/play', express.json(), async function (req, res) {
  if (!req.session?.discord) return res.status(401).json({ error: 'Not logged in' });
  const { deck, flipped, matched, turnsRemaining, prizesWon } = req.body || {};
  if (!db.savePairsState) return res.status(503).json({ error: 'Database not configured' });
  if (!Array.isArray(deck) || !Array.isArray(flipped) || typeof matched !== 'object') {
    return res.status(400).json({ error: 'deck, flipped, matched required' });
  }
  try {
    const state = {
      deck,
      flipped: Array.isArray(flipped) ? flipped : [],
      matched: matched || {},
      turnsRemaining: parseInt(turnsRemaining, 10) || 0,
      prizesWon: Array.isArray(prizesWon) ? prizesWon : [],
    };
    await db.savePairsState(req.session.discord.id, state);
    res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ——— Raffles: admin check (only admins can create raffles) ———
function isRaffleAdmin(discordId) {
  return discordId && ADMIN_DISCORD_IDS.includes(String(discordId));
}

app.get('/api/raffles/admin-check', function (req, res) {
  if (!req.session?.discord) return res.json({ admin: false });
  const admin = isRaffleAdmin(req.session.discord.id);
  const prizeWallet = admin && PRIZE_WALLET ? (PRIZE_WALLET || '').trim() : undefined;
  res.json({ admin, prizeWallet: prizeWallet || undefined });
});

// ——— Raffles: list active ———
app.get('/api/raffles', async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!db.getActiveRaffles) return res.json({ raffles: [] });
  const raffles = await db.getActiveRaffles();
  const withSold = await Promise.all(
    raffles.map(async (r) => {
      const sold = await db.getRaffleSoldCount(r.id);
      const total = r.ticketCount || 0;
      let winnerWallet = r.winnerWallet;
      const endsAt = r.endsAt ? new Date(r.endsAt) : null;
      const isEndedByTime = endsAt && endsAt <= new Date();
      const isSoldOut = total > 0 && sold >= total;
      const shouldDraw = !winnerWallet && db.drawRaffleWinner && (isEndedByTime || isSoldOut);
      if (shouldDraw) {
        const drawResult = await db.drawRaffleWinner(r.id);
        const draw = drawResult && typeof drawResult === 'object' ? drawResult : { winner: drawResult, justDrawn: false };
        winnerWallet = draw.winner || r.winnerWallet;
        if (draw.justDrawn && draw.winner) {
          const siteUrl = (process.env.SITE_URL || process.env.BASE_URL || BASE_URL).replace(/\/$/, '');
          const winnerDisplay = await getWinnerDisplayName(draw.winner);
          postRaffleWinnerToDiscord({ prizeNftName: r.prizeNftName, winnerWallet: draw.winner, winnerDisplay, siteUrl });
        }
      }
      const out = { ...r, ticketsSold: sold, winnerWallet: winnerWallet || r.winnerWallet, treasury: RAFFLE_TREASURY_WALLET || null };
      if (out.winnerWallet) out.winnerDisplay = await getWinnerDisplayName(out.winnerWallet);
      return out;
    })
  );
  res.json({ raffles: withSold });
});

// ——— Raffles: single + entries ———
app.get('/api/raffles/:id', async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid raffle id' });
  let raffle = await db.getRaffleById(id);
  if (!raffle) return res.status(404).json({ error: 'Raffle not found' });
  const endsAt = raffle.endsAt ? new Date(raffle.endsAt) : null;
  const sold = await db.getRaffleSoldCount(id);
  const total = raffle.ticketCount || 0;
  const isEndedByTime = endsAt && endsAt <= new Date();
  const isSoldOut = total > 0 && sold >= total;
  if (!raffle.winnerWallet && db.drawRaffleWinner && (isEndedByTime || isSoldOut)) {
    const drawResult = await db.drawRaffleWinner(id);
    const draw = drawResult && typeof drawResult === 'object' ? drawResult : { winner: drawResult, justDrawn: false };
    raffle = await db.getRaffleById(id) || raffle;
    if (draw.winner) raffle.winnerWallet = draw.winner;
    if (draw.justDrawn && draw.winner) {
      const siteUrl = (process.env.SITE_URL || process.env.BASE_URL || BASE_URL).replace(/\/$/, '');
      const winnerDisplay = await getWinnerDisplayName(draw.winner);
      postRaffleWinnerToDiscord({ prizeNftName: raffle.prizeNftName, winnerWallet: draw.winner, winnerDisplay, siteUrl });
    }
  }
  const ticketsSold = await db.getRaffleSoldCount(id);
  const payload = { ...raffle, ticketsSold, treasury: RAFFLE_TREASURY_WALLET || null };
  if (payload.winnerWallet) payload.winnerDisplay = await getWinnerDisplayName(payload.winnerWallet);
  res.json(payload);
});

app.get('/api/raffles/:id/entries', async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid raffle id' });
  const raffle = await db.getRaffleById(id);
  if (!raffle) return res.status(404).json({ error: 'Raffle not found' });
  const entries = await db.getRaffleEntries(id);
  res.json({ entries });
});

app.get('/api/raffles/:id/my-tickets', async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const wallet = (req.query.wallet && String(req.query.wallet).trim()) || '';
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid raffle id' });
  if (!wallet) return res.status(400).json({ error: 'wallet query required' });
  const raffle = await db.getRaffleById(id);
  if (!raffle) return res.status(404).json({ error: 'Raffle not found' });
  const ticketCount = await db.getRaffleTicketCountByWallet(id, wallet);
  const total = raffle.ticketCount || raffle.ticket_count || 0;
  const maxPerWallet = Math.floor(total * 0.2);
  res.json({ ticketCount, maxPerWallet, total });
});

/** Derive Associated Token Account address for owner + mint + tokenProgram. */
function deriveAta(ownerB58, mintB58, tokenProgramId) {
  const { PublicKey } = require('@solana/web3.js');
  const owner = new PublicKey(ownerB58);
  const mint = new PublicKey(mintB58);
  const tokenProgram = new PublicKey(tokenProgramId);
  const ataProgram = new PublicKey(ATA_PROGRAM_ID);
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ataProgram
  );
  return ata.toBase58();
}

/** Verify an NFT transfer tx: the given mint was transferred to prizeWallet. Returns { ok, error }. */
async function verifyNftTransferToPrizeWallet(signature, prizeNftMint, prizeWallet) {
  if (!HELIUS_API_KEY) return { ok: false, error: 'RPC not configured' };
  const sig = String(signature).trim();
  if (!sig) return { ok: false, error: 'Invalid signature' };
  const destWallet = String(prizeWallet || '').trim();
  const mint = String(prizeNftMint || '').trim();
  if (!destWallet || !mint) return { ok: false, error: 'Invalid prize wallet or mint' };
  const expectedAtaToken = deriveAta(destWallet, mint, TOKEN_PROGRAM_ID);
  const expectedAtaToken2022 = deriveAta(destWallet, mint, TOKEN_2022_PROGRAM_ID);
  const maxAttempts = 10;
  const delayMs = 4000;
  try {
    let result = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const rpcRes = await axios.post(
        `${HELIUS_RPC}/?api-key=${HELIUS_API_KEY}`,
        {
          jsonrpc: '2.0',
          id: '1',
          method: 'getTransaction',
          params: [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }],
        },
        { timeout: 15000, validateStatus: () => true }
      );
      result = rpcRes.data?.result;
      if (result) {
        if (result.meta?.err) return { ok: false, error: 'Transaction failed on-chain' };
        break;
      }
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delayMs));
    }
    if (!result) return { ok: false, error: 'Transaction not found. Please try again.' };
    const msg = result.transaction?.message;
    if (!msg) return { ok: false, error: 'Invalid transaction' };
    const instructions = msg.instructions || [];
    const inner = (result.meta?.innerInstructions || []).flatMap((ii) => ii.instructions || []);
    const all = [...instructions, ...inner];
    for (const ix of all) {
      const p = ix.parsed;
      if (!p || !p.info) continue;
      if (p.type === 'transferChecked' || p.type === 'transfer') {
        const info = p.info;
        const destTokenAccount = (info.destination && String(info.destination).trim()) || '';
        const isPrizeAta = destTokenAccount === expectedAtaToken || destTokenAccount === expectedAtaToken2022;
        if (!isPrizeAta) continue;
        if (p.type === 'transferChecked' && info.mint && String(info.mint).trim() !== mint) continue;
        return { ok: true };
      }
    }
    const accountKeys = (msg.accountKeys || msg.staticAccountKeys || []).map((k) => (typeof k === 'string' ? k : k.pubkey || k.toString()));
    const postByIndex = Object.fromEntries((result.meta?.postTokenBalances || []).map((b) => [b.accountIndex, b]));
    const expectedAtas = [expectedAtaToken, expectedAtaToken2022];
    for (const [idxStr, post] of Object.entries(postByIndex)) {
      if (!post || post.mint !== mint) continue;
      const key = accountKeys[parseInt(idxStr, 10)];
      if (key && expectedAtas.includes(key)) {
        const postRaw = post?.uiTokenAmount?.amount ?? post?.tokenAmount?.amount;
        if (postRaw != null && BigInt(String(postRaw)) >= 1n) return { ok: true };
      }
    }
    return { ok: false, error: 'NFT transfer to prize wallet not found in transaction' };
  } catch (e) {
    return { ok: false, error: e.message || 'Verification failed' };
  }
}

/** Verify a Solana payment tx: signed by expectedPayerWallet, transfer to paymentDestination (or its token ATA when tokenMint given) of expectedAmount. Returns { ok, error }. */
async function verifyRafflePaymentTx(signature, paymentDestination, expectedAmountLamportsOrRaw, isSol, tokenMint, expectedPayerWallet) {
  if (!HELIUS_API_KEY) return { ok: false, error: 'RPC not configured' };
  const sig = String(signature).trim();
  if (!sig) return { ok: false, error: 'Invalid signature' };
  const destWallet = String(paymentDestination || '').trim();
  if (!destWallet) return { ok: false, error: 'Invalid payment destination' };
  const payerNorm = expectedPayerWallet ? String(expectedPayerWallet).trim().toLowerCase() : '';
  let expectedTokenDest = null;
  if (!isSol && tokenMint) {
    const expectedAtaToken = deriveAta(destWallet, String(tokenMint).trim(), TOKEN_PROGRAM_ID);
    const expectedAtaToken2022 = deriveAta(destWallet, String(tokenMint).trim(), TOKEN_2022_PROGRAM_ID);
    expectedTokenDest = [expectedAtaToken, expectedAtaToken2022, destWallet].filter((a, i, arr) => arr.indexOf(a) === i);
  }
  const maxAttempts = 8;
  const delayMs = 3000;
  let result = null;
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const rpcRes = await axios.post(
        `${HELIUS_RPC}/?api-key=${HELIUS_API_KEY}`,
        {
          jsonrpc: '2.0',
          id: '1',
          method: 'getTransaction',
          params: [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }],
        },
        { timeout: 15000, validateStatus: () => true }
      );
      result = rpcRes.data?.result;
      if (result) {
        if (result.meta?.err) return { ok: false, error: 'Transaction failed on-chain' };
        break;
      }
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delayMs));
    }
    if (!result) {
      return { ok: false, error: 'Transaction not found. Wait a few seconds and try again (do not send another payment).' };
    }
    const msg = result.transaction?.message;
    if (!msg) return { ok: false, error: 'Invalid transaction' };
    if (payerNorm) {
      const rawKeys = msg.accountKeys || msg.staticAccountKeys || [];
      const accountKeys = rawKeys.map((k) => String(typeof k === 'string' ? k : (k && k.pubkey) || '').toLowerCase()).filter(Boolean);
      const numRequired = (msg.header && msg.header.numRequiredSignatures != null) ? msg.header.numRequiredSignatures : 1;
      const signers = accountKeys.slice(0, numRequired);
      if (!signers.length || !signers.includes(payerNorm)) {
        return { ok: false, error: 'Payment transaction was not signed by the wallet claiming the tickets.' };
      }
    }
    const instructions = msg.instructions || [];
    const inner = (result.meta?.innerInstructions || []).flatMap((ii) => ii.instructions || []);
    const all = [...instructions, ...inner];
    const expected = String(expectedAmountLamportsOrRaw).replace(/^0+/, '') || '0';
    let expectedBig = BigInt(0);
    try { expectedBig = BigInt(expected); } catch (_) {}

    for (const ix of all) {
      const p = ix.parsed;
      if (!p || !p.info) continue;
      if (isSol && p.type === 'transfer') {
        const info = p.info;
        if (info.destination === destWallet && String(info.lamports) === expected) return { ok: true };
      }
      if (!isSol && (p.type === 'transferChecked' || p.type === 'transfer')) {
        const info = p.info;
        const destTokenAccount = (info.destination && String(info.destination).trim()) || '';
        const isTreasuryDest = expectedTokenDest
          ? expectedTokenDest.includes(destTokenAccount)
          : destTokenAccount === destWallet;
        if (!isTreasuryDest) continue;
        const amount = info.tokenAmount?.amount ?? info.amount;
        const amountStr = amount != null ? String(amount).replace(/^0+/, '') || '0' : '';
        if (amountStr === expected) return { ok: true };
        try {
          const amountBig = BigInt(amountStr);
          if (expectedBig > 0n && amountBig >= expectedBig) return { ok: true };
        } catch (_) {}
      }
    }
    if (!isSol && expectedTokenDest && expectedTokenDest.length && expectedBig > 0n) {
      const accountKeys = (msg.accountKeys || msg.staticAccountKeys || []).map((k) => (typeof k === 'string' ? k : k.pubkey || k.toString()));
      const preByIndex = Object.fromEntries((result.meta?.preTokenBalances || []).map((b) => [b.accountIndex, b]));
      const postByIndex = Object.fromEntries((result.meta?.postTokenBalances || []).map((b) => [b.accountIndex, b]));
      const mintStr = String(tokenMint).trim();
      for (const [idxStr, post] of Object.entries(postByIndex)) {
        if (post.mint !== mintStr) continue;
        const i = parseInt(idxStr, 10);
        const key = accountKeys[i];
        if (!key || !expectedTokenDest.includes(key)) continue;
        const pre = preByIndex[i];
        const preRaw = pre?.uiTokenAmount?.amount ?? pre?.tokenAmount?.amount;
        const postRaw = post?.uiTokenAmount?.amount ?? post?.tokenAmount?.amount;
        if (postRaw == null) continue;
        const postBig = BigInt(String(postRaw));
        const preBig = preRaw != null ? BigInt(String(preRaw)) : 0n;
        const delta = postBig - preBig;
        if (delta >= expectedBig) return { ok: true };
      }
    }
    return { ok: false, error: 'Payment transfer to treasury not found or amount mismatch' };
  } catch (e) {
    return { ok: false, error: e.message || 'Verification failed' };
  }
}

app.post('/api/raffles/:id/buy', RAFFLE_BUY_LIMIT, express.json(), async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid raffle id' });
  if (!db.getRaffleById) return res.status(503).json({ error: 'Database not configured' });
  const raffle = await db.getRaffleById(id);
  if (!raffle) return res.status(404).json({ error: 'Raffle not found. Refresh the page and try again.' });
  const endsAt = (raffle.endsAt || raffle.ends_at) ? new Date(raffle.endsAt || raffle.ends_at) : null;
  if (endsAt && endsAt <= new Date()) return res.status(400).json({ error: 'Raffle has ended' });
  const wallet = (req.body && req.body.wallet && String(req.body.wallet).trim()) || '';
  const count = parseInt(req.body && req.body.count, 10);
  const signature = (req.body && req.body.signature && String(req.body.signature).trim()) || '';
  const paymentDestination = (req.body && req.body.paymentDestination && String(req.body.paymentDestination).trim()) || '';
  if (!wallet) return res.status(400).json({ error: 'wallet required' });
  if (!isValidSolanaAddress(wallet)) return res.status(400).json({ error: 'Invalid wallet address format' });
  if (!Number.isInteger(count) || count < 1) return res.status(400).json({ error: 'count must be a positive integer' });
  if (count > MAX_TICKET_COUNT_PER_REQUEST) return res.status(400).json({ error: 'count too high per request' });
  if (!signature) return res.status(400).json({ error: 'Sign the payment transaction in your wallet first.' });
  if (!paymentDestination) return res.status(400).json({ error: 'paymentDestination required' });
  if (!isValidSolanaAddress(paymentDestination)) return res.status(400).json({ error: 'Invalid paymentDestination address format' });
  const treasury = RAFFLE_TREASURY_WALLET;
  if (!treasury) return res.status(503).json({ error: 'Raffle treasury not configured. Set RAFFLE_TREASURY_WALLET or PRIZE_WALLET in .env' });
  const total = raffle.ticketCount || raffle.ticket_count || 0;
  const maxPerWallet = Math.floor(total * 0.2);
  if (maxPerWallet < 1) return res.status(400).json({ error: 'Raffle has no tickets available per wallet' });
  const current = await db.getRaffleTicketCountByWallet(id, wallet);
  if (current + count > maxPerWallet) {
    return res.status(400).json({ error: 'Maximum ' + maxPerWallet + ' tickets per wallet (you have ' + current + ').' });
  }
  const sold = await db.getRaffleSoldCount(id);
  if (sold + count > total) return res.status(400).json({ error: 'Not enough tickets left' });
  const raw = String(raffle.ticketPriceRaw || '0').trim();
  const type = (raffle.ticketPriceTokenType || 'sol').toLowerCase();
  const isSol = type === 'sol';
  let expectedAmount;
  if (isSol) {
    expectedAmount = String(parseInt(raw, 10) * count);
  } else {
    const storedDecimals = raffle.ticketPriceDecimals != null ? raffle.ticketPriceDecimals : 6;
    const mintForDecimals = type === 'aaa' && AAA_TOKEN_MINT ? AAA_TOKEN_MINT : (raffle.ticketPriceTokenMint || '');
    let actualDecimals = 6;
    if (HELIUS_API_KEY && mintForDecimals) {
      try {
        const rpcRes = await axios.post(
          `${HELIUS_RPC}/?api-key=${HELIUS_API_KEY}`,
          { jsonrpc: '2.0', id: '1', method: 'getAccountInfo', params: [mintForDecimals, { encoding: 'base64' }] },
          { timeout: 5000, validateStatus: () => true }
        );
        const acc = rpcRes.data?.result?.value;
        if (acc?.data && Array.isArray(acc.data)) {
          const buf = Buffer.from(acc.data[0], 'base64');
          if (buf.length > 44) actualDecimals = buf[44];
        } else if (acc?.data && typeof acc.data === 'string') {
          const buf = Buffer.from(acc.data, 'base64');
          if (buf.length > 44) actualDecimals = buf[44];
        }
      } catch (_) {}
    }
    const humanPrice = Number(raw) / Math.pow(10, storedDecimals);
    expectedAmount = String(BigInt(Math.round(humanPrice * Math.pow(10, actualDecimals) * count)));
  }
  const tokenMintForVerify = isSol ? null : (raffle.ticketPriceTokenMint || '').trim() || null;
  if (!isSol && !tokenMintForVerify) {
    return res.status(400).json({ error: 'Raffle ticket price token mint not set; cannot verify payment.' });
  }
  let verification = await verifyRafflePaymentTx(signature, paymentDestination, expectedAmount, isSol, tokenMintForVerify, wallet);
  for (const delayMs of [2000, 4000]) {
    if (!verification.ok && /not found|invalid transaction/i.test(verification.error || '')) {
      await new Promise((r) => setTimeout(r, delayMs));
      verification = await verifyRafflePaymentTx(signature, paymentDestination, expectedAmount, isSol, tokenMintForVerify, wallet);
    } else break;
  }
  if (!verification.ok) {
    return res.status(400).json({ error: verification.error || 'Payment verification failed' });
  }
  const used = await db.useRafflePaymentSignature(signature);
  if (!used) return res.status(400).json({ error: 'This payment was already used. Each transaction can only buy tickets once.' });
  try {
    await db.addRaffleTickets(id, wallet, count);
    res.json({ ok: true, ticketCount: current + count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Raffles: claim (winner only; transfers NFT from prize wallet to winner) ———
const PRIZE_WALLET_PRIVATE_KEY = (process.env.PRIZE_WALLET_PRIVATE_KEY || '').trim();

app.post('/api/raffles/:id/claim', RAFFLE_CLAIM_LIMIT, express.json(), async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid raffle id' });
  const wallet = (req.body && req.body.wallet && String(req.body.wallet).trim()) || '';
  if (!wallet) return res.status(400).json({ error: 'wallet required' });
  if (!isValidSolanaAddress(wallet)) return res.status(400).json({ error: 'Invalid wallet address format' });
  if (!db.getRaffleById) return res.status(503).json({ error: 'Database not configured' });
  const raffle = await db.getRaffleById(id);
  if (!raffle) return res.status(404).json({ error: 'Raffle not found' });
  const winnerWallet = (raffle.winnerWallet || '').toLowerCase();
  if (!winnerWallet) return res.status(400).json({ error: 'No winner drawn yet' });
  if (wallet.toLowerCase() !== winnerWallet) return res.status(403).json({ error: 'Only the winner can claim' });
  if (!PRIZE_WALLET_PRIVATE_KEY || !HELIUS_API_KEY) {
    return res.status(503).json({ error: 'Claim is not configured. Contact the team to receive your prize.' });
  }
  let Keypair, Connection, PublicKey, Transaction, TransactionInstruction;
  try {
    const solana = require('@solana/web3.js');
    Keypair = solana.Keypair;
    Connection = solana.Connection;
    PublicKey = solana.PublicKey;
    Transaction = solana.Transaction;
    TransactionInstruction = solana.TransactionInstruction;
  } catch (e) {
    return res.status(503).json({ error: 'Claim service unavailable. Contact the team.' });
  }
  const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
  let signerKeypair;
  try {
    const secret = bs58.decode(PRIZE_WALLET_PRIVATE_KEY);
    if (secret.length !== 64) throw new Error('Invalid key length');
    signerKeypair = Keypair.fromSecretKey(new Uint8Array(secret));
  } catch (e) {
    console.warn('[Raffles] Invalid PRIZE_WALLET_PRIVATE_KEY:', e.message);
    return res.status(503).json({ error: 'Claim signer not configured. Contact the team.' });
  }
  const connection = new Connection(`${HELIUS_RPC}/?api-key=${HELIUS_API_KEY}`, 'confirmed');
  const mintPk = new PublicKey(raffle.prizeNftMint);
  const prizePk = new PublicKey(raffle.prizeWallet || PRIZE_WALLET);
  const winnerPk = new PublicKey(wallet);

  function findAta(owner, mint, tokenProgramId) {
    const [ata] = PublicKey.findProgramAddressSync(
      [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
      new PublicKey(ATA_PROGRAM_ID)
    );
    return ata;
  }

  const tokenProgramId = new PublicKey(TOKEN_PROGRAM_ID);
  const ataProgramId = new PublicKey(ATA_PROGRAM_ID);
  const sysProgramId = new PublicKey('11111111111111111111111111111111');
  const rentId = new PublicKey('SysvarRent111111111111111111111111111111111');

  try {
    const mintInfo = await connection.getAccountInfo(mintPk);
    if (!mintInfo || !mintInfo.data) return res.status(400).json({ error: 'Prize NFT mint not found' });
    const actualTokenProgram = new PublicKey(mintInfo.owner);
    const decimals = mintInfo.data.length > 44 ? mintInfo.data[44] : 0;
    const sourceAta = findAta(prizePk, mintPk, actualTokenProgram);
    const destAta = findAta(winnerPk, mintPk, actualTokenProgram);

    const sourceInfo = await connection.getAccountInfo(sourceAta);
    if (!sourceInfo || !sourceInfo.data) return res.status(400).json({ error: 'Prize NFT not in prize wallet' });
    const data = sourceInfo.data;
    if (data.length < 72) return res.status(400).json({ error: 'Invalid token account' });
    const amountView = new DataView(data.buffer, data.byteOffset + 64, 8);
    if (amountView.getBigUint64(0, true) < 1) return res.status(400).json({ error: 'Prize NFT not in prize wallet' });

    const instructions = [];
    const destInfo = await connection.getAccountInfo(destAta);
    if (!destInfo) {
      instructions.push(
        new TransactionInstruction({
          keys: [
            { pubkey: signerKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: destAta, isSigner: false, isWritable: true },
            { pubkey: winnerPk, isSigner: false, isWritable: false },
            { pubkey: mintPk, isSigner: false, isWritable: false },
            { pubkey: sysProgramId, isSigner: false, isWritable: false },
            { pubkey: actualTokenProgram, isSigner: false, isWritable: false },
            { pubkey: ataProgramId, isSigner: false, isWritable: false },
            { pubkey: rentId, isSigner: false, isWritable: false },
          ],
          programId: ataProgramId,
          data: Buffer.from([1]),
        })
      );
    }

    const transferData = Buffer.alloc(10);
    transferData[0] = 12;
    transferData.writeBigUInt64LE(BigInt(1), 1);
    transferData[9] = decimals;
    instructions.push(
      new TransactionInstruction({
        keys: [
          { pubkey: sourceAta, isSigner: false, isWritable: true },
          { pubkey: mintPk, isSigner: false, isWritable: false },
          { pubkey: destAta, isSigner: false, isWritable: true },
          { pubkey: signerKeypair.publicKey, isSigner: true, isWritable: false },
        ],
        programId: actualTokenProgram,
        data: transferData,
      })
    );

    const tx = new Transaction().add(...instructions);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = signerKeypair.publicKey;
    tx.sign(signerKeypair);

    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    if (db.setRaffleClaimed) await db.setRaffleClaimed(id, sig);
    res.json({ ok: true, signature: sig });
  } catch (e) {
    console.warn('[Raffles] Claim transfer failed:', e.message);
    res.status(500).json({ error: e.message || 'Transfer failed' });
  }
});

// ——— Raffles: create (admin only) ———
app.post('/api/raffles', RAFFLE_CREATE_LIMIT, express.json(), async function (req, res) {
  if (!req.session?.discord) return res.status(401).json({ error: 'Not logged in' });
  if (!isRaffleAdmin(req.session.discord.id)) return res.status(403).json({ error: 'Admin only' });
  const prizeWalletAddr = (PRIZE_WALLET || '').trim();
  if (!prizeWalletAddr || prizeWalletAddr.length < 32) {
    return res.status(503).json({ error: 'PRIZE_WALLET not configured. Add a Solana address to PRIZE_WALLET in .env and restart the server.' });
  }
  const body = req.body || {};
  const prizeNftMint = body.prizeNftMint && String(body.prizeNftMint).trim();
  const ticketCount = parseInt(body.ticketCount, 10);
  const ticketPriceTokenType = body.ticketPriceTokenType && String(body.ticketPriceTokenType).trim();
  const ticketPriceRaw = body.ticketPriceRaw != null ? String(body.ticketPriceRaw) : null;
  const endsAt = body.endsAt && String(body.endsAt).trim();
  if (!prizeNftMint || ticketCount < 1 || !ticketPriceTokenType || ticketPriceRaw == null || !endsAt) {
    return res.status(400).json({ error: 'Missing or invalid: prizeNftMint, ticketCount, ticketPriceTokenType, ticketPriceRaw, endsAt' });
  }
  if (!isValidSolanaAddress(prizeNftMint)) return res.status(400).json({ error: 'Invalid prizeNftMint address format' });
  if (ticketCount > 100000) return res.status(400).json({ error: 'ticketCount too high' });
  const endsAtDate = new Date(endsAt);
  if (isNaN(endsAtDate.getTime()) || endsAtDate <= new Date()) {
    return res.status(400).json({ error: 'endsAt must be a future ISO date/time' });
  }
  const ticketPriceTokenMint = (body.ticketPriceTokenMint && String(body.ticketPriceTokenMint).trim()) || null;
  const ticketPriceDecimals = body.ticketPriceDecimals != null ? parseInt(body.ticketPriceDecimals, 10) : 6;
  const prizeNftName = (body.prizeNftName && String(body.prizeNftName)) || null;
  const prizeNftImage = (body.prizeNftImage && String(body.prizeNftImage)) || null;
  const nftTransferSignature = (body.nftTransferSignature && String(body.nftTransferSignature).trim()) || '';
  if (!nftTransferSignature) {
    return res.status(400).json({
      error: 'Send the prize NFT to the prize wallet first, then call create with nftTransferSignature. The raffle is only created after the transfer is verified.',
    });
  }
  const nftVerify = await verifyNftTransferToPrizeWallet(nftTransferSignature, prizeNftMint, prizeWalletAddr);
  if (!nftVerify.ok) {
    console.warn('[Raffles] Create raffle: NFT verification failed:', nftVerify.error);
    return res.status(400).json({ error: nftVerify.error || 'NFT transfer verification failed' });
  }
  if (!db.createRaffle) return res.status(503).json({ error: 'Database not configured' });
  try {
    const row = await db.createRaffle({
      prizeNftMint,
      prizeNftName,
      prizeNftImage,
      prizeWallet: prizeWalletAddr,
      ticketCount,
      ticketPriceTokenType,
      ticketPriceTokenMint,
      ticketPriceRaw,
      ticketPriceDecimals: Number.isInteger(ticketPriceDecimals) && ticketPriceDecimals >= 0 && ticketPriceDecimals <= 9 ? ticketPriceDecimals : 6,
      endsAt: endsAtDate.toISOString(),
      createdByDiscordId: req.session.discord.id,
    });
    if (!row || (row.id === undefined || row.id === null)) {
      return res.status(500).json({ error: 'Create failed: no id returned from database' });
    }
    const raffle = {
      id: row.id,
      prizeNftMint: row.prize_nft_mint,
      prizeNftName: row.prize_nft_name,
      prizeNftImage: row.prize_nft_image,
      prizeWallet: row.prize_wallet || prizeWalletAddr,
      ticketCount: row.ticket_count,
      ticketPriceTokenType: row.ticket_price_token_type,
      ticketPriceTokenMint: row.ticket_price_token_mint,
      ticketPriceRaw: row.ticket_price_raw,
      ticketPriceDecimals: row.ticket_price_decimals,
      endsAt: row.ends_at,
      status: row.status,
      createdAt: row.created_at,
    };
    const siteUrl = (process.env.SITE_URL || process.env.BASE_URL || BASE_URL).replace(/\/$/, '');
    postRaffleNewToDiscord(raffle, siteUrl);
    res.status(201).json(raffle);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ——— NFTs by wallet (for raffle admin: pick prize NFT); session required ———
app.get('/api/nfts', async function (req, res) {
  if (!req.session?.discord) return res.status(401).json({ error: 'Not logged in' });
  const wallet = (req.query.wallet && String(req.query.wallet).trim()) || '';
  if (!wallet || wallet.length < 32) return res.status(400).json({ error: 'wallet query required' });
  if (!HELIUS_API_KEY) return res.status(503).json({ error: 'NFT fetch not configured' });
  const nfts = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const rpcRes = await axios.post(
      `${HELIUS_RPC}/?api-key=${HELIUS_API_KEY}`,
      {
        jsonrpc: '2.0',
        id: '1',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: wallet,
          page,
          limit: 100,
          options: { showUnverifiedCollections: true },
        },
      },
      { timeout: 15000, validateStatus: () => true }
    );
    const items = rpcRes.data?.result?.items || [];
    for (const item of items) {
      const isFungible = item.interface === 'FungibleToken' || item.interface === 'FungibleAsset';
      if (isFungible) continue;
      if (item.compression?.compressed) continue;
      const id = item.id || item.content?.metadata?.mint;
      const name = item.content?.metadata?.name || item.id || 'Unknown';
      const img = item.content?.links?.image || item.content?.metadata?.uri || null;
      if (id) nfts.push({ id, name, image: img });
    }
    hasMore = items.length === 100;
    page++;
    if (page > 30) break;
  }
  res.json({ nfts });
});

// ——— Token info by mint (for raffle admin custom token display) ———
app.get('/api/token-info', async function (req, res) {
  const mint = (req.query.mint && String(req.query.mint).trim()) || '';
  if (!mint || mint.length < 32) return res.status(400).json({ error: 'mint query required' });
  if (!HELIUS_API_KEY) return res.status(503).json({ error: 'Not configured' });
  try {
    const rpcRes = await axios.post(
      `${HELIUS_RPC}/?api-key=${HELIUS_API_KEY}`,
      { jsonrpc: '2.0', id: '1', method: 'getAsset', params: { id: mint } },
      { timeout: 8000, validateStatus: () => true }
    );
    const item = rpcRes.data?.result;
    if (!item) return res.status(404).json({ error: 'Token not found' });
    const meta = item.content?.metadata || {};
    const name = meta.name || item.id || 'Unknown';
    const symbol = meta.symbol || '—';
    const decimals = meta.token_standard === 'Fungible' ? (meta.decimals ?? 6) : 0;
    res.json({ name, symbol, decimals, mint: item.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Discord bot: team avatars + raffle channel announcements ———
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_RAFFLE_CHANNEL_ID = (process.env.DISCORD_RAFFLE_CHANNEL_ID || '').trim();
if (!DISCORD_BOT_TOKEN) {
  console.warn('DISCORD_BOT_TOKEN not set — Team section will show placeholder avatars. Add a Bot token from Discord Developer Portal to fetch Discord usernames and avatars.');
}

/** Post a message to the raffle Discord channel. No-op if channel or token not set. */
function postRaffleToDiscord(content) {
  if (!DISCORD_BOT_TOKEN || !DISCORD_RAFFLE_CHANNEL_ID) return Promise.resolve();
  return axios
    .post(
      'https://discord.com/api/v10/channels/' + encodeURIComponent(DISCORD_RAFFLE_CHANNEL_ID) + '/messages',
      { content: String(content).slice(0, 2000) },
      { headers: { Authorization: 'Bot ' + DISCORD_BOT_TOKEN, 'Content-Type': 'application/json' }, timeout: 5000, validateStatus: () => true }
    )
    .catch((e) => console.warn('[Raffles] Discord post failed:', e.message));
}

/** Post JSON body (e.g. embeds) to the raffle channel. */
function postRaffleMessageToDiscord(body) {
  if (!DISCORD_BOT_TOKEN || !DISCORD_RAFFLE_CHANNEL_ID) return Promise.resolve();
  return axios
    .post(
      'https://discord.com/api/v10/channels/' + encodeURIComponent(DISCORD_RAFFLE_CHANNEL_ID) + '/messages',
      body,
      { headers: { Authorization: 'Bot ' + DISCORD_BOT_TOKEN, 'Content-Type': 'application/json' }, timeout: 5000, validateStatus: () => true }
    )
    .catch((e) => console.warn('[Raffles] Discord post failed:', e.message));
}

/** Get display name for winner: Discord username if wallet linked, else truncated wallet. */
async function getWinnerDisplayName(walletAddress) {
  if (!walletAddress || !db.getDiscordByWallet) return null;
  const discordId = await db.getDiscordByWallet(walletAddress);
  if (!discordId) return null;
  const names = await db.getDiscordUsernames([discordId]);
  return names.get(discordId) || null;
}

/** Post new-raffle embed to Discord (prize image, name, tickets, price, link). */
function postRaffleNewToDiscord(raffle, siteUrl) {
  const baseUrl = (siteUrl || BASE_URL).replace(/\/$/, '');
  const prizeName = (raffle.prizeNftName || 'Prize NFT').replace(/\*/g, '');
  const ticketCount = raffle.ticketCount || raffle.ticket_count || 0;
  const type = (raffle.ticketPriceTokenType || 'sol').toLowerCase();
  const raw = String(raffle.ticketPriceRaw || '0').trim();
  const decimals = raffle.ticketPriceDecimals != null ? Number(raffle.ticketPriceDecimals) : type === 'sol' ? 9 : 6;
  const humanPrice = Number(raw) / Math.pow(10, decimals);
  const symbol = type === 'sol' ? 'SOL' : type === 'aaa' ? 'AAA' : 'tokens';
  const priceStr = (humanPrice === Math.floor(humanPrice) ? humanPrice : humanPrice.toFixed(4)) + ' ' + symbol;
  const endsAt = raffle.endsAt || raffle.ends_at;
  const endsStr = endsAt ? new Date(endsAt).toLocaleString() : '—';
  const raffleUrl = baseUrl + '/raffles';
  const rawImage = raffle.prizeNftImage && String(raffle.prizeNftImage).trim();
  const thumbnailUrl = rawImage && (rawImage.startsWith('http') || rawImage.startsWith('//'))
    ? baseUrl + '/api/proxy-image?url=' + encodeURIComponent(rawImage.startsWith('//') ? 'https:' + rawImage : rawImage)
    : null;
  const embed = {
    title: '🎟️ New raffle',
    description: prizeName,
    url: raffleUrl,
    color: 0x5865f2,
    thumbnail: thumbnailUrl ? { url: thumbnailUrl } : undefined,
    fields: [
      { name: 'Tickets', value: String(ticketCount), inline: true },
      { name: 'Cost per ticket', value: priceStr, inline: true },
      { name: 'Ends', value: endsStr, inline: false },
    ],
  };
  return postRaffleMessageToDiscord({ embeds: [embed] });
}

/** Post winner announcement to Discord (winner wallet or Discord username if known). */
function postRaffleWinnerToDiscord(opts) {
  const { prizeNftName, winnerWallet, winnerDisplay, siteUrl } = opts || {};
  const baseUrl = (siteUrl || BASE_URL).replace(/\/$/, '');
  const prizeName = (prizeNftName || 'Prize').replace(/\*/g, '');
  const display = winnerDisplay ? `**${winnerDisplay}** (\`${winnerWallet}\`)` : `\`${winnerWallet}\``;
  const embed = {
    title: '🎉 Raffle ended',
    description: `**${prizeName}**\nWinner: ${display}`,
    url: baseUrl + '/raffles',
    color: 0x57f287,
  };
  return postRaffleMessageToDiscord({ embeds: [embed] });
}
app.get('/api/discord/user/:id', async function (req, res) {
  const id = req.params.id;
  if (!id || !DISCORD_BOT_TOKEN) {
    return res.status(503).json({ error: 'Discord bot not configured' });
  }
  try {
    const userRes = await axios.get('https://discord.com/api/v10/users/' + encodeURIComponent(id), {
      headers: { Authorization: 'Bot ' + DISCORD_BOT_TOKEN },
      validateStatus: () => true,
    });
    if (userRes.status !== 200 || !userRes.data.id) {
      if (userRes.status === 401) {
        console.warn('Discord API 401 for user ' + id + ' — check DISCORD_BOT_TOKEN is correct and has no extra spaces/quotes.');
      } else if (userRes.status === 404) {
        console.warn('Discord API 404 for user ' + id + ' — user ID may be wrong or bot cannot see this user.');
      } else {
        console.warn('Discord API returned ' + userRes.status + ' for user ' + id);
      }
      return res.status(404).json({ error: 'User not found' });
    }
    const u = userRes.data;
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      id: u.id,
      username: u.username,
      global_name: u.global_name || u.username,
      avatar: u.avatar,
      discriminator: u.discriminator,
    });
  } catch (err) {
    console.warn('Discord user fetch error', err.message);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

// ——— Live prices (Jupiter): SOL + AAA token USD; cache 60s ———
const SOL_MINT = 'So11111111111111111111111111111111111111112';
let pricesCache = { data: null, ts: 0 };
const PRICES_CACHE_MS = 60 * 1000;

function parseJupiterPrices(data) {
  const out = { solUsd: null, tokenUsd: null, tokenPerSol: null };
  if (!data || typeof data !== 'object') return out;
  const d = typeof data.data === 'object' && data.data !== null ? data.data : data;
  const sol = d[SOL_MINT];
  const tokenData = d[AAA_TOKEN_MINT];
  const solP = sol?.price ?? sol?.usdPrice;
  const tokenP = tokenData?.price ?? tokenData?.usdPrice;
  if (solP != null) out.solUsd = Number(solP);
  if (tokenP != null) {
    out.tokenUsd = Number(tokenP);
    if (out.solUsd && out.solUsd > 0) out.tokenPerSol = out.tokenUsd / out.solUsd;
  }
  return out;
}

app.get('/api/prices', async function (req, res) {
  const now = Date.now();
  if (pricesCache.data && now - pricesCache.ts < PRICES_CACHE_MS) {
    return res.json(pricesCache.data);
  }
  const out = { solUsd: null, tokenUsd: null, tokenPerSol: null };
  if (!AAA_TOKEN_MINT) {
    pricesCache = { data: out, ts: now };
    return res.json(out);
  }
  const ids = [SOL_MINT, AAA_TOKEN_MINT].join(',');
  const urls = [
    'https://api.jup.ag/price/v3?ids=' + encodeURIComponent(ids),
    'https://lite-api.jup.ag/price/v3?ids=' + encodeURIComponent(ids),
  ];
  for (const url of urls) {
    try {
      const r = await axios.get(url, {
        timeout: 8000,
        validateStatus: () => true,
        headers: { Accept: 'application/json' },
      });
      if (r.status === 200 && r.data) {
        const parsed = parseJupiterPrices(r.data);
        if (parsed.solUsd != null) out.solUsd = parsed.solUsd;
        if (parsed.tokenUsd != null) out.tokenUsd = parsed.tokenUsd;
        if (parsed.tokenPerSol != null) out.tokenPerSol = parsed.tokenPerSol;
        if (out.tokenUsd != null) break;
      }
    } catch (e) {
      console.warn('Prices fetch failed', url, e.message);
    }
  }
  // Fallback: DexScreener token-pairs if Jupiter didn't return token price
  if (AAA_TOKEN_MINT && out.tokenUsd == null) {
    try {
      const dsRes = await axios.get(
        'https://api.dexscreener.com/token-pairs/v1/solana/' + encodeURIComponent(AAA_TOKEN_MINT),
        { timeout: 6000, validateStatus: () => true, headers: { Accept: 'application/json' } }
      );
      if (dsRes.status === 200 && Array.isArray(dsRes.data) && dsRes.data.length > 0) {
        const priceUsd = dsRes.data[0].priceUsd;
        if (priceUsd != null && priceUsd !== '') {
          out.tokenUsd = Number(priceUsd);
          if (out.solUsd != null && out.solUsd > 0) out.tokenPerSol = out.tokenUsd / out.solUsd;
        }
      }
    } catch (e) {
      console.warn('DexScreener fallback failed', e.message);
    }
  }
  if (out.solUsd != null && out.tokenUsd != null && out.tokenPerSol == null && out.solUsd > 0) {
    out.tokenPerSol = out.tokenUsd / out.solUsd;
  }
  // Enrich with DexScreener: 24h change, liquidity, volume, market cap (DEXTools-style)
  if (AAA_TOKEN_MINT) {
  try {
    const dsRes = await axios.get(
      'https://api.dexscreener.com/token-pairs/v1/solana/' + encodeURIComponent(AAA_TOKEN_MINT),
      { timeout: 6000, validateStatus: () => true, headers: { Accept: 'application/json' } }
    );
    if (dsRes.status === 200 && Array.isArray(dsRes.data) && dsRes.data.length > 0) {
      const pairs = dsRes.data.filter(function (p) {
        return p.priceUsd != null && p.priceUsd !== '' && (p.liquidity?.usd ?? 0) > 0;
      });
      const best = pairs.sort(function (a, b) { return (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0); })[0];
      if (best) {
        if (out.tokenUsd == null && best.priceUsd != null) {
          out.tokenUsd = Number(best.priceUsd);
          if (out.solUsd != null && out.solUsd > 0) out.tokenPerSol = out.tokenUsd / out.solUsd;
        }
        const pc = best.priceChange;
        if (pc != null && typeof pc.h24 === 'number') out.priceChange24h = pc.h24;
        if (best.liquidity?.usd != null) out.liquidityUsd = Number(best.liquidity.usd);
        if (best.volume?.h24 != null) out.volume24hUsd = Number(best.volume.h24);
        if (best.marketCap != null) out.marketCapUsd = Number(best.marketCap);
        if (best.fdv != null) out.fdvUsd = Number(best.fdv);
      }
    }
  } catch (e) {
    console.warn('DexScreener enrichment failed', e.message);
  }
  }
  pricesCache = { data: out, ts: now };
  res.json(out);
});

// ——— 15m OHLC for AAA token (Birdeye); optional BIRDEYE_API_KEY ———
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const OHLC_CACHE_MS = 2 * 60 * 1000;
let ohlcCache = { data: null, ts: 0 };

app.get('/api/token-ohlc', async function (req, res) {
  const type = (req.query.type || '15m').toLowerCase().replace(/\s/g, '');
  const validType = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d'].includes(type) ? type : '15m';
  if (!BIRDEYE_API_KEY || !AAA_TOKEN_MINT) {
    return res.json({ success: false, data: { items: [] }, message: 'Chart requires BIRDEYE_API_KEY and AAA_TOKEN_MINT in server .env' });
  }
  const now = Math.floor(Date.now() / 1000);
  const cacheKey = validType;
  if (ohlcCache.data && ohlcCache.type === cacheKey && now * 1000 - ohlcCache.ts < OHLC_CACHE_MS) {
    return res.json(ohlcCache.data);
  }
  const timeTo = now;
  const timeFrom = now - 7 * 24 * 60 * 60;
  try {
    const r = await axios.get(
      'https://public-api.birdeye.so/defi/v3/ohlcv',
      {
        params: {
          address: AAA_TOKEN_MINT,
          type: validType,
          time_from: timeFrom,
          time_to: timeTo,
          currency: 'usd',
        },
        timeout: 10000,
        validateStatus: () => true,
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY,
          'Accept': 'application/json',
        },
      }
    );
    if (r.status !== 200 || !r.data?.data?.items) {
      ohlcCache = { data: { success: false, data: { items: [] } }, ts: Date.now(), type: cacheKey };
      return res.json(ohlcCache.data);
    }
    const payload = { success: true, data: { items: r.data.data.items } };
    ohlcCache = { data: payload, ts: Date.now(), type: cacheKey };
    res.json(payload);
  } catch (e) {
    console.warn('Birdeye OHLC failed', e.message);
    res.json({ success: false, data: { items: [] }, message: e.message || 'OHLC fetch failed' });
  }
});

// ——— Verify: wallet's AAA token balance + NFT count per collection ———
app.get('/api/verify', async function (req, res) {
  const wallet = (req.query.wallet || '').trim();
  if (!wallet) {
    return res.status(400).json({ error: 'Missing wallet' });
  }

  const out = {
    token: 0,
    tokenFormatted: '0',
    absurdApesCount: 0,
    col2Count: 0,
    totalNfts: 0,
  };

  if (!HELIUS_API_KEY) {
    return res.json(out);
  }

  try {
    // 1) AAA token balance — Helius getTokenAccounts(owner, mint)
    if (AAA_TOKEN_MINT) {
      const tokenRes = await axios.post(
        `${HELIUS_RPC}/?api-key=${HELIUS_API_KEY}`,
        {
          jsonrpc: '2.0',
          id: '1',
          method: 'getTokenAccounts',
          params: {
            owner: wallet,
            mint: AAA_TOKEN_MINT,
            limit: 10,
          },
        },
        { timeout: 10000, validateStatus: () => true }
      );
      const tokenAccounts = tokenRes.data?.result?.token_accounts || [];
      let totalRaw = 0;
      for (const acc of tokenAccounts) {
        totalRaw += Number(acc.amount || 0);
      }
      out.token = totalRaw / Math.pow(10, TOKEN_DECIMALS);
      out.tokenFormatted = formatTokenAmount(out.token);
    }

    // 2) NFT counts per collection — getAssetsByOwner, filter by grouping.collection
    const collectionMints = COLLECTIONS.filter((c) => c.collectionMint).map((c) => ({ mint: c.collectionMint, countKey: c.countKey }));
    if (collectionMints.length) {
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const assetsRes = await axios.post(
          `${HELIUS_RPC}/?api-key=${HELIUS_API_KEY}`,
          {
            jsonrpc: '2.0',
            id: '1',
            method: 'getAssetsByOwner',
            params: {
              ownerAddress: wallet,
              page,
              limit: 1000,
              options: { showUnverifiedCollections: true },
            },
          },
          { timeout: 15000, validateStatus: () => true }
        );
        const items = assetsRes.data?.result?.items || [];
        for (const item of items) {
          const group = item.grouping?.find((g) => g.group_key === 'collection');
          const colVal = group?.group_value;
          for (const { mint, countKey } of collectionMints) {
            if (colVal === mint) out[countKey]++;
          }
        }
        hasMore = items.length === 1000;
        page++;
        if (page > 20) break;
      }
      out.totalNfts = COLLECTIONS.reduce((sum, c) => sum + (out[c.countKey] || 0), 0);
    }
  } catch (e) {
    console.warn('Verify failed', e.message);
  }

  res.json(out);
});

// ——— Collections (Magic Eden stats + optional Helius DAS) ———
app.get('/api/collections', async function (req, res) {
  const results = [];
  for (const col of COLLECTIONS) {
    const out = {
      symbol: col.slug,
      name: col.name,
      description: null,
      image: null,
      animationUrl: null,
      supply: null,
      listedCount: null,
      floorPrice: null,
      floorPriceSol: null,
      volumeAll: null,
      volumeAllSol: null,
      avgPrice24hr: null,
      avgPrice24hrSol: null,
      marketplaceUrl: `https://magiceden.io/marketplace/${col.slug}`,
    };

    try {
      const statsRes = await axios.get(`${ME_BASE}/collections/${col.slug}/stats`, {
        timeout: 8000,
        validateStatus: () => true,
      });
      if (statsRes.status === 200 && statsRes.data) {
        const s = statsRes.data;
        out.listedCount = s.listedCount != null ? s.listedCount : null;
        out.floorPrice = s.floorPrice != null ? s.floorPrice : null;
        // ME returns floor in lamports (large integer). If we get a small number, it may already be in SOL.
        const fp = out.floorPrice;
        const floorSol = fp != null
          ? (fp >= 1000 ? fp / LAMPORTS_PER_SOL : Number(fp))
          : null;
        out.floorPriceSol = floorSol != null && !isNaN(floorSol) ? floorSol.toFixed(4) : null;
        out.volumeAll = s.volumeAll != null ? s.volumeAll : null;
        out.volumeAllSol = out.volumeAll != null ? (out.volumeAll / LAMPORTS_PER_SOL).toFixed(2) : null;
        out.avgPrice24hr = s.avgPrice24hr != null ? s.avgPrice24hr : null;
        out.avgPrice24hrSol = out.avgPrice24hr != null ? (out.avgPrice24hr / LAMPORTS_PER_SOL).toFixed(4) : null;
      }
    } catch (e) {
      console.warn('ME stats failed for', col.slug, e.message);
    }

    // Magic Eden: collection metadata (name, description, image) if available
    try {
      const metaRes = await axios.get(`${ME_BASE}/collections/${col.slug}`, {
        timeout: 5000,
        validateStatus: () => true,
      });
      if (metaRes.status === 200 && metaRes.data) {
        const m = metaRes.data;
        if (m.name) out.name = m.name;
        if (m.description) out.description = m.description;
        if (m.image || m.imageURI) out.image = m.image || m.imageURI;
        if (m.animation_url || m.animationUrl) out.animationUrl = m.animation_url || m.animationUrl;
        if (m.totalSupply != null) out.supply = m.totalSupply;
      }
    } catch (e) {
      // ignore
    }

    // Helius DAS: derive supply by counting all NFTs in the collection when we have collection mint
    if (HELIUS_API_KEY && col.collectionMint) {
      try {
        let page = 1;
        let totalItems = 0;
        let hasMore = true;
        while (hasMore) {
          const heliusRes = await axios.post(
            `${HELIUS_RPC}/?api-key=${HELIUS_API_KEY}`,
            {
              jsonrpc: '2.0',
              id: '1',
              method: 'getAssetsByGroup',
              params: {
                groupKey: 'collection',
                groupValue: col.collectionMint,
                page,
                limit: 1000,
                options: {
                  showCollectionMetadata: page === 1,
                },
              },
            },
            { timeout: 10000, validateStatus: () => true }
          );
          const data = heliusRes.data?.result;
          const items = data?.items || [];
          totalItems += items.length;
          if (page === 1) {
            const meta = items[0]?.grouping?.find((g) => g.group_key === 'collection')?.collection_metadata;
            if (meta) {
              if (meta.name) out.name = meta.name;
              if (meta.description) out.description = meta.description;
              if (meta.image) out.image = meta.image;
            }
          }
          hasMore = items.length === 1000;
          page += 1;
          if (page > 50) break;
        }
        if (totalItems > 0) out.supply = totalItems;
      } catch (e) {
        console.warn('Helius DAS failed for', col.slug, e.message);
      }
    }

    results.push(out);
  }
  res.json({ collections: results });
});

// ——— Holders table (token + NFT by collection), filter/sort by total | token | absurdApes | col2 | nfts ———
// Decode owner (32 bytes) + amount (8 bytes LE) from getProgramAccounts dataSlice(32, 40)
function decodeTokenAccountOwnerAndAmount(dataBase64) {
  if (!dataBase64) return null;
  try {
    const buf = Buffer.from(dataBase64, 'base64');
    if (buf.length < 40) return null;
    const owner = bs58.encode(buf.slice(0, 32));
    const amount = buf.readBigUInt64LE(32);
    return { owner, amount: Number(amount) };
  } catch (e) {
    return null;
  }
}

app.get('/api/holders', async function (req, res) {
  const sortBy = (req.query.sort || 'total').toLowerCase();
  const validSort = ['total', 'token', 'absurdApes', 'col2', 'nfts'].includes(sortBy) ? sortBy : 'total';

  const holderMap = new Map(); // wallet -> { tokenBalance, tokenBalanceFormatted, absurdApesCount, col2Count }

  function getOrCreate(wallet) {
    if (!holderMap.has(wallet)) {
      const base = { wallet, tokenBalance: 0, tokenBalanceFormatted: '0' };
      COLLECTIONS.forEach((c) => { base[c.countKey] = 0; });
      holderMap.set(wallet, base);
    }
    return holderMap.get(wallet);
  }

  // 1) Token holders (AAA) via getProgramAccounts — all SPL token accounts for this mint
  if (HELIUS_API_KEY && AAA_TOKEN_MINT) {
    try {
      const gpaRes = await axios.post(
        `${HELIUS_RPC}/?api-key=${HELIUS_API_KEY}`,
        {
          jsonrpc: '2.0',
          id: '1',
          method: 'getProgramAccounts',
          params: [
            TOKEN_PROGRAM_ID,
            {
              encoding: 'base64',
              commitment: 'confirmed',
              filters: [
                { dataSize: 165 },
                { memcmp: { offset: 0, bytes: AAA_TOKEN_MINT } },
              ],
              dataSlice: { offset: 32, length: 40 },
            },
          ],
        },
        { timeout: 30000, validateStatus: () => true }
      );
      const accounts = gpaRes.data?.result || [];
      const decimals = TOKEN_DECIMALS;
      for (const item of accounts) {
        const data = item.account?.data;
        if (!data) continue;
        const decoded = decodeTokenAccountOwnerAndAmount(Array.isArray(data) ? data[0] : data);
        if (!decoded || decoded.amount === 0) continue;
        const raw = decoded.amount / Math.pow(10, decimals);
        const h = getOrCreate(decoded.owner);
        h.tokenBalance += raw;
        h.tokenBalanceFormatted = formatTokenAmount(h.tokenBalance);
      }
    } catch (e) {
      console.warn('Holders token fetch failed', e.message);
    }

    // 2) NFT owner counts per collection (getAssetsByGroup paginate, aggregate by owner)
    for (let c = 0; c < COLLECTIONS.length; c++) {
      const col = COLLECTIONS[c];
      const key = col.countKey;
      if (!key || !col.collectionMint) {
        if (col.slug === 'absurd_horizons' && !col.collectionMint) {
          console.warn('Holders: ABSURD_HORIZONS_COLLECTION_MINT not set in .env — Horizons counts will be 0. Get the collection address from Solscan (any minted NFT → Collection) or LaunchMyNFT.');
        }
        continue;
      }
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        try {
          const dasRes = await axios.post(
            `${HELIUS_RPC}/?api-key=${HELIUS_API_KEY}`,
            {
              jsonrpc: '2.0',
              id: '1',
              method: 'getAssetsByGroup',
              params: {
                groupKey: 'collection',
                groupValue: col.collectionMint,
                page,
                limit: 1000,
              },
            },
            { timeout: 15000, validateStatus: () => true }
          );
          const items = dasRes.data?.result?.items || [];
          for (const item of items) {
            const owner = item.ownership?.owner;
            if (owner) {
              const h = getOrCreate(owner);
              h[key] = (h[key] || 0) + 1;
            }
          }
          hasMore = items.length === 1000;
          page++;
          if (page > 50) break;
        } catch (e) {
          console.warn('Holders NFT fetch failed for', col.slug, e.message);
          hasMore = false;
        }
      }
    }
  }

  function totalNftsFromHolder(h) {
    return COLLECTIONS.reduce((sum, c) => sum + (h[c.countKey] || 0), 0);
  }

  let list = Array.from(holderMap.values()).map(function (h) {
    const totalNfts = totalNftsFromHolder(h);
    return {
      wallet: h.wallet,
      tokenBalance: h.tokenBalance,
      tokenBalanceFormatted: h.tokenBalanceFormatted,
      ...COLLECTIONS.reduce((o, c) => { o[c.countKey] = h[c.countKey] || 0; return o; }, {}),
      totalNfts,
      totalScore: (h.tokenBalance || 0) / 1e6 + totalNfts * 10,
    };
  });

  // Aggregate by Discord when DB is available: one row per Discord user, show Discord name
  if (db.getAllWalletToDiscord && db.getDiscordUsernames) {
    const walletToDiscord = await db.getAllWalletToDiscord();
    const discordIds = [...new Set(walletToDiscord.values())];
    const discordNames = await db.getDiscordUsernames(discordIds);
    const byDiscord = new Map(); // key (discordId or wallet) -> merged holder
    for (const h of list) {
      const dId = walletToDiscord.get(h.wallet.toLowerCase());
      const key = dId || h.wallet;
      const existing = byDiscord.get(key);
      if (existing) {
        existing.tokenBalance += h.tokenBalance;
        existing.tokenBalanceFormatted = formatTokenAmount(existing.tokenBalance);
        COLLECTIONS.forEach((c) => { existing[c.countKey] = (existing[c.countKey] || 0) + (h[c.countKey] || 0); });
        existing.totalNfts = totalNftsFromHolder(existing);
        existing.totalScore = existing.tokenBalance / 1e6 + existing.totalNfts * 10;
        existing.walletCount = (existing.walletCount || 1) + 1;
      } else {
        const totalNfts = totalNftsFromHolder(h);
        byDiscord.set(key, {
          displayName: dId ? (discordNames.get(dId) || 'Discord user') : h.wallet.slice(0, 4) + '…' + h.wallet.slice(-4),
          wallet: dId ? null : h.wallet,
          discordId: dId || null,
          walletCount: 1,
          tokenBalance: h.tokenBalance,
          tokenBalanceFormatted: h.tokenBalanceFormatted,
          ...COLLECTIONS.reduce((o, c) => { o[c.countKey] = h[c.countKey] || 0; return o; }, {}),
          totalNfts,
          totalScore: (h.tokenBalance || 0) / 1e6 + totalNfts * 10,
        });
      }
    }
    list = Array.from(byDiscord.values()).map(function (o) {
      const { displayName, wallet, discordId, walletCount, ...rest } = o;
      return { displayName, wallet, discordId, walletCount: walletCount || 1, ...rest };
    });
  } else {
    list = list.map(function (h) {
      return {
        displayName: h.wallet.slice(0, 4) + '…' + h.wallet.slice(-4),
        wallet: h.wallet,
        discordId: null,
        walletCount: 1,
        ...h,
      };
    });
  }

  // Filter out wallets with no holdings for the selected view
  if (validSort === 'token') {
    list = list.filter((h) => (h.tokenBalance || 0) > 0);
  } else if (validSort === 'absurdApes') {
    list = list.filter((h) => (h.absurdApesCount || 0) > 0);
  } else if (validSort === 'col2') {
    list = list.filter((h) => (h.col2Count || 0) > 0);
  } else {
    list = list.filter((h) => (h.tokenBalance || 0) > 0 || (h.totalNfts || 0) > 0);
  }

  if (validSort === 'token') list.sort((a, b) => b.tokenBalance - a.tokenBalance);
  else if (validSort === 'absurdApes') list.sort((a, b) => (b.absurdApesCount || 0) - (a.absurdApesCount || 0));
  else if (validSort === 'col2') list.sort((a, b) => (b.col2Count || 0) - (a.col2Count || 0));
  else if (validSort === 'nfts') list.sort((a, b) => b.totalNfts - a.totalNfts);
  else list.sort((a, b) => b.totalScore - a.totalScore);

  res.json({ holders: list, sort: validSort });
});

function formatTokenAmount(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

// On Vercel, do not listen; the app is used by api/[[...path]].js
if (process.env.VERCEL !== '1') {
  app.listen(PORT, function () {
    console.log('Absurd Apes server at http://localhost:' + PORT);
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
      console.log('Discord login disabled: set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in .env');
    } else {
      console.log('Discord redirect URI for Dev Portal:', REDIRECT_URI);
    }
  });
}

module.exports = app;
