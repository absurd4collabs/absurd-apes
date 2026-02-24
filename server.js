/**
 * Absurd Apes — Express server with Discord OAuth2 login
 * Serves static site and provides /api/discord/* routes.
 *
 * Required env: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, SESSION_SECRET, BASE_URL
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const db = require('./db');
const cookieSession = require('cookie-session');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const bs58 = require('bs58');

const app = express();
const PORT = process.env.PORT || 3000;

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || 'absurd-apes-session-secret-change-in-production';
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
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || process.env.AAA_DECIMALS || '6', 10);

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
    secure: false,
    sameSite: 'lax',
    path: '/',
  })
);

app.use(express.static(path.join(__dirname)));

// Avoid 404 for favicon (browsers request it automatically)
app.get('/favicon.ico', function (req, res) {
  res.status(204).end();
});

// Pairs game: standalone page
app.get('/pairs', function (req, res) {
  res.sendFile(path.join(__dirname, 'pairs.html'));
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

// ——— Discord user by ID (for team section; requires bot token) ———
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!DISCORD_BOT_TOKEN) {
  console.warn('DISCORD_BOT_TOKEN not set — Team section will show placeholder avatars. Add a Bot token from Discord Developer Portal to fetch Discord usernames and avatars.');
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
      if (!key || !col.collectionMint) continue;
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
