/**
 * Database helpers for users, wallets.
 * Uses Neon PostgreSQL.
 */
const { Pool } = require('pg');
const crypto = require('crypto');

let pool = null;

function getPool() {
  if (!pool) {
    let url = process.env.DATABASE_URL;
    if (!url) return null;
    // Avoid pg SSL warning: prefer verify-full (or leave as-is if already set)
    if (url.includes('sslmode=require') || url.includes('sslmode=prefer') || url.includes('sslmode=verify-ca')) {
      url = url.replace(/sslmode=(require|prefer|verify-ca)/i, 'sslmode=verify-full');
    }
    pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: true } });
  }
  return pool;
}

async function upsertUser(discordId, discordUsername, discordAvatar) {
  const p = getPool();
  if (!p) return null;
  await p.query(
    `INSERT INTO users (discord_id, discord_username, discord_avatar, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (discord_id) DO UPDATE SET
       discord_username = EXCLUDED.discord_username,
       discord_avatar = EXCLUDED.discord_avatar,
       updated_at = NOW()`,
    [discordId, discordUsername || '', discordAvatar || null]
  );
  return { discordId, discordUsername, discordAvatar };
}

async function linkWallet(discordId, discordUsername, walletAddress) {
  const p = getPool();
  if (!p) return null;
  await upsertUser(discordId, discordUsername, null);
  await p.query(
    `INSERT INTO wallets (wallet_address, discord_id)
     VALUES ($1, $2)
     ON CONFLICT (wallet_address) DO UPDATE SET discord_id = EXCLUDED.discord_id`,
    [walletAddress.toLowerCase(), discordId]
  );
  return { discordId, walletAddress };
}

async function getWalletsByDiscord(discordId) {
  const p = getPool();
  if (!p) return [];
  const res = await p.query(
    'SELECT wallet_address FROM wallets WHERE discord_id = $1',
    [discordId]
  );
  return (res.rows || []).map((r) => r.wallet_address);
}

/** Remove one wallet row only if it belongs to this Discord user. Returns number of rows deleted (0 or 1). */
async function unlinkWallet(discordId, walletAddress) {
  const p = getPool();
  if (!p) return 0;
  const addr = String(walletAddress || '').trim();
  if (!addr) return 0;
  const res = await p.query(
    'DELETE FROM wallets WHERE LOWER(wallet_address) = LOWER($1) AND discord_id = $2',
    [addr, discordId]
  );
  return res.rowCount || 0;
}

async function getDiscordByWallet(walletAddress) {
  const p = getPool();
  if (!p) return null;
  const res = await p.query(
    'SELECT discord_id FROM wallets WHERE wallet_address = $1',
    [walletAddress.toLowerCase()]
  );
  return res.rows?.[0]?.discord_id || null;
}

async function getAllWalletToDiscord() {
  const p = getPool();
  if (!p) return new Map();
  const res = await p.query('SELECT wallet_address, discord_id FROM wallets');
  const m = new Map();
  (res.rows || []).forEach((r) => m.set(r.wallet_address.toLowerCase(), r.discord_id));
  return m;
}

async function getDiscordUsernames(discordIds) {
  if (!discordIds || discordIds.length === 0) return new Map();
  const p = getPool();
  if (!p) return new Map();
  const placeholders = discordIds.map((_, i) => '$' + (i + 1)).join(',');
  const res = await p.query(
    `SELECT discord_id, discord_username FROM users WHERE discord_id IN (${placeholders})`,
    discordIds
  );
  const m = new Map();
  (res.rows || []).forEach((r) => m.set(r.discord_id, r.discord_username));
  return m;
}

// ——— Raffles ———
async function createRaffle(data) {
  const p = getPool();
  if (!p) return null;
  const decimals = data.ticketPriceDecimals != null ? parseInt(data.ticketPriceDecimals, 10) : 6;
  const decimalsVal = Number.isInteger(decimals) && decimals >= 0 && decimals <= 9 ? decimals : 6;
  const res = await p.query(
    `INSERT INTO raffles (
      prize_nft_mint, prize_nft_name, prize_nft_image, prize_wallet,
      ticket_count, ticket_price_token_type, ticket_price_token_mint, ticket_price_raw, ticket_price_decimals,
      ends_at, status, created_by_discord_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11)
    RETURNING id, prize_nft_mint, prize_nft_name, prize_nft_image, prize_wallet,
      ticket_count, ticket_price_token_type, ticket_price_token_mint, ticket_price_raw, ticket_price_decimals,
      ends_at, status, created_at`,
    [
      data.prizeNftMint,
      data.prizeNftName || null,
      data.prizeNftImage || null,
      data.prizeWallet,
      data.ticketCount,
      data.ticketPriceTokenType,
      data.ticketPriceTokenMint || null,
      String(data.ticketPriceRaw),
      decimalsVal,
      data.endsAt,
      data.createdByDiscordId || null,
    ]
  );
  return res.rows?.[0] || null;
}

async function getActiveRaffles() {
  const p = getPool();
  if (!p) return [];
  let res;
  try {
    res = await p.query(
      `SELECT * FROM raffles WHERE status = 'active' ORDER BY created_at DESC`
    );
  } catch (e) {
    if (e.message && /winner_wallet|column.*does not exist/i.test(e.message)) {
      res = await p.query(
        `SELECT id, prize_nft_mint, prize_nft_name, prize_nft_image, prize_wallet,
                ticket_count, ticket_price_token_type, ticket_price_token_mint, ticket_price_raw,
                ends_at, status, created_at
         FROM raffles WHERE status = 'active' ORDER BY created_at DESC`
      );
    } else throw e;
  }
  return (res.rows || []).map((r) => ({
    id: r.id,
    prizeNftMint: r.prize_nft_mint,
    prizeNftName: r.prize_nft_name,
    prizeNftImage: r.prize_nft_image,
    prizeWallet: r.prize_wallet,
    ticketCount: r.ticket_count,
    ticketPriceTokenType: r.ticket_price_token_type,
    ticketPriceTokenMint: r.ticket_price_token_mint,
    ticketPriceRaw: r.ticket_price_raw,
    ticketPriceDecimals: r.ticket_price_decimals != null ? r.ticket_price_decimals : 6,
    endsAt: r.ends_at,
    status: r.status,
    createdAt: r.created_at,
    winnerWallet: r.winner_wallet,
    claimTxSignature: r.claim_tx_signature || null,
  }));
}

async function getRaffleById(id) {
  const p = getPool();
  if (!p) return null;
  let res;
  try {
    res = await p.query(
      `SELECT id, prize_nft_mint, prize_nft_name, prize_nft_image, prize_wallet,
              ticket_count, ticket_price_token_type, ticket_price_token_mint, ticket_price_raw, ticket_price_decimals,
              ends_at, status, created_at, winner_wallet, claim_tx_signature
       FROM raffles WHERE id = $1`,
      [id]
    );
  } catch (e) {
    if (e.message && /ticket_price_decimals|claim_tx_signature|column.*does not exist/i.test(e.message)) {
      res = await p.query(
        `SELECT id, prize_nft_mint, prize_nft_name, prize_nft_image, prize_wallet,
                ticket_count, ticket_price_token_type, ticket_price_token_mint, ticket_price_raw,
                ends_at, status, created_at, winner_wallet
         FROM raffles WHERE id = $1`,
        [id]
      );
    } else throw e;
  }
  const r = res.rows?.[0];
  if (!r) return null;
  return {
    id: r.id,
    prizeNftMint: r.prize_nft_mint,
    prizeNftName: r.prize_nft_name,
    prizeNftImage: r.prize_nft_image,
    prizeWallet: r.prize_wallet,
    ticketCount: r.ticket_count,
    ticketPriceTokenType: r.ticket_price_token_type,
    ticketPriceTokenMint: r.ticket_price_token_mint,
    ticketPriceRaw: r.ticket_price_raw,
    ticketPriceDecimals: r.ticket_price_decimals != null ? r.ticket_price_decimals : 6,
    endsAt: r.ends_at,
    status: r.status,
    createdAt: r.created_at,
    winnerWallet: r.winner_wallet,
    claimTxSignature: r.claim_tx_signature || null,
  };
}

async function setRaffleClaimed(raffleId, claimTxSignature) {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query('UPDATE raffles SET claim_tx_signature = $1 WHERE id = $2', [claimTxSignature, raffleId]);
    return true;
  } catch (e) {
    if (e.message && /claim_tx_signature|column.*does not exist/i.test(e.message)) return false;
    throw e;
  }
}

async function getRaffleEntries(raffleId) {
  const p = getPool();
  if (!p) return [];
  const res = await p.query(
    `SELECT wallet_address, ticket_count FROM raffle_tickets
     WHERE raffle_id = $1 ORDER BY ticket_count ASC, wallet_address ASC`,
    [raffleId]
  );
  return (res.rows || []).map((r) => ({ walletAddress: r.wallet_address, ticketCount: r.ticket_count }));
}

async function getRaffleSoldCount(raffleId) {
  const p = getPool();
  if (!p) return 0;
  const res = await p.query(
    'SELECT COALESCE(SUM(ticket_count), 0)::int AS total FROM raffle_tickets WHERE raffle_id = $1',
    [raffleId]
  );
  return parseInt(res.rows?.[0]?.total, 10) || 0;
}

async function addRaffleTickets(raffleId, walletAddress, ticketCount) {
  const p = getPool();
  if (!p) return null;
  await p.query(
    `INSERT INTO raffle_tickets (raffle_id, wallet_address, ticket_count)
     VALUES ($1, $2, $3)
     ON CONFLICT (raffle_id, wallet_address) DO UPDATE SET
       ticket_count = raffle_tickets.ticket_count + EXCLUDED.ticket_count`,
    [raffleId, walletAddress.toLowerCase(), ticketCount]
  );
  return { raffleId, walletAddress, ticketCount };
}

async function getRaffleTicketCountByWallet(raffleId, walletAddress) {
  const p = getPool();
  if (!p) return 0;
  const res = await p.query(
    'SELECT ticket_count FROM raffle_tickets WHERE raffle_id = $1 AND wallet_address = $2',
    [raffleId, (walletAddress || '').toLowerCase()]
  );
  return parseInt(res.rows?.[0]?.ticket_count, 10) || 0;
}

/** Record a payment signature to prevent replay. Returns true if inserted, false if already used. */
async function useRafflePaymentSignature(signature) {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query('INSERT INTO raffle_payment_signatures (signature) VALUES ($1)', [String(signature).trim()]);
    return true;
  } catch (e) {
    if (e.code === '23505') return false; // unique violation
    throw e;
  }
}

async function drawRaffleWinner(raffleId) {
  const p = getPool();
  if (!p) return null;
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      'SELECT winner_wallet, ends_at, ticket_count FROM raffles WHERE id = $1 FOR UPDATE',
      [raffleId]
    );
    const row = r.rows?.[0];
    if (!row) return null;
    if (row.winner_wallet) {
      await client.query('COMMIT');
      return { winner: row.winner_wallet, justDrawn: false };
    }
    const endsAt = row.ends_at ? new Date(row.ends_at) : null;
    const soldRes = await client.query(
      'SELECT COALESCE(SUM(ticket_count), 0)::int AS total FROM raffle_tickets WHERE raffle_id = $1',
      [raffleId]
    );
    const sold = parseInt(soldRes.rows?.[0]?.total, 10) || 0;
    const total = parseInt(row.ticket_count, 10) || 0;
    const isEndedByTime = endsAt && endsAt <= new Date();
    const isSoldOut = total > 0 && sold >= total;
    if (!isEndedByTime && !isSoldOut) {
      await client.query('COMMIT');
      return { winner: null, justDrawn: false };
    }
    const entries = await client.query(
      'SELECT wallet_address, ticket_count FROM raffle_tickets WHERE raffle_id = $1',
      [raffleId]
    );
    const rows = entries.rows || [];
    let entriesTotal = 0;
    for (const e of rows) entriesTotal += parseInt(e.ticket_count, 10) || 0;
    if (entriesTotal < 1) {
      await client.query('COMMIT');
      return { winner: null, justDrawn: false };
    }
    const rand = typeof crypto.randomInt === 'function'
      ? crypto.randomInt(0, entriesTotal)
      : Math.floor((crypto.randomBytes(4).readUInt32BE(0) / 0x100000000) * entriesTotal);
    let acc = 0;
    let winner = null;
    for (const e of rows) {
      acc += parseInt(e.ticket_count, 10) || 0;
      if (rand < acc) {
        winner = e.wallet_address;
        break;
      }
    }
    if (!winner) winner = rows[rows.length - 1]?.wallet_address || null;
    if (winner) {
      await client.query('UPDATE raffles SET winner_wallet = $1 WHERE id = $2', [winner, raffleId]);
    }
    await client.query('COMMIT');
    return { winner, justDrawn: !!winner };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ——— Merch wait list (Discord + email) ———
async function ensureWaitListTable() {
  const p = getPool();
  if (!p) return false;
  await p.query(`
    CREATE TABLE IF NOT EXISTS wait_list (
      discord_id VARCHAR(32) PRIMARY KEY,
      email VARCHAR(320) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  return true;
}

function normalizeWaitListEmail(email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em || em.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return null;
  return em;
}

async function addWaitListEntry(discordId, email) {
  const em = normalizeWaitListEmail(email);
  if (!em) return { ok: false, error: 'Invalid email' };
  const ready = await ensureWaitListTable();
  if (!ready) return { ok: false, error: 'Database unavailable' };
  const p = getPool();
  await p.query(
    `INSERT INTO wait_list (discord_id, email, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (discord_id) DO UPDATE SET
       email = EXCLUDED.email,
       updated_at = NOW()`,
    [String(discordId), em]
  );
  return { ok: true };
}

async function getWaitListByDiscordId(discordId) {
  const ready = await ensureWaitListTable();
  if (!ready) return null;
  const p = getPool();
  const res = await p.query(
    'SELECT discord_id, email, created_at, updated_at FROM wait_list WHERE discord_id = $1',
    [String(discordId)]
  );
  return res.rows?.[0] || null;
}

async function getAllWaitList() {
  const ready = await ensureWaitListTable();
  if (!ready) return [];
  const p = getPool();
  const res = await p.query(
    `SELECT w.discord_id, w.email, w.created_at, w.updated_at, u.discord_username
     FROM wait_list w
     LEFT JOIN users u ON u.discord_id = w.discord_id
     ORDER BY w.created_at ASC`
  );
  return res.rows || [];
}

// ——— Merch pack mint codes (wallet ↔ code; GraveMint integration later) ———
async function seedMerchPackCodesDummy() {
  const p = getPool();
  if (!p) return;
  try {
    const c = await p.query('SELECT COUNT(*)::int AS n FROM merch_pack_codes');
    if ((c.rows[0]?.n || 0) > 0) return;
    const pairs = [
      ['dwtestmerchpack01absurdapesaaa11111111111111', 'DUMMY-MERCH-001'],
      ['dwtestmerchpack02absurdapesbbb11111111111111', 'DUMMY-MERCH-002'],
      ['dwtestmerchpack03absurdapesccc11111111111111', 'DUMMY-MERCH-003'],
      ['dwtestmerchpack04absurdapesddd11111111111111', 'DUMMY-MERCH-004'],
    ];
    for (const [w, code] of pairs) {
      await p.query(
        'INSERT INTO merch_pack_codes (wallet_address, claim_code) VALUES ($1, $2)',
        [String(w).toLowerCase(), code]
      );
    }
  } catch (e) {
    console.warn('[merch_pack_codes seed]', e.message);
  }
}

async function ensureMerchPackCodesTable() {
  const p = getPool();
  if (!p) return false;
  await p.query(`
    CREATE TABLE IF NOT EXISTS merch_pack_codes (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(64) NOT NULL UNIQUE,
      claim_code VARCHAR(128) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await seedMerchPackCodesDummy();
  return true;
}

/** Adds used_at / expires_at on codes + merch_pack_claims table. */
async function ensureMerchPackClaimsSchema() {
  const p = getPool();
  if (!p) return false;
  await ensureMerchPackCodesTable();
  await p.query('ALTER TABLE merch_pack_codes ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ');
  await p.query('ALTER TABLE merch_pack_codes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ');
  await p.query(`
    CREATE TABLE IF NOT EXISTS merch_pack_claims (
      id SERIAL PRIMARY KEY,
      merch_pack_code_id INTEGER NOT NULL UNIQUE REFERENCES merch_pack_codes(id) ON DELETE RESTRICT,
      discord_id VARCHAR(32) NOT NULL,
      wallet_address VARCHAR(64) NOT NULL,
      x_handle VARCHAR(256) NOT NULL DEFAULT '',
      discord_handle VARCHAR(256) NOT NULL,
      size VARCHAR(16) NOT NULL,
      shirt_color VARCHAR(64) NOT NULL,
      delivery_address TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await p.query(
    'CREATE INDEX IF NOT EXISTS merch_pack_claims_discord_id ON merch_pack_claims (discord_id)'
  );
  return true;
}

const MERCH_SIZES = new Set(['S', 'M', 'L', 'XL', 'XXL']);
const MERCH_COLORS = new Set(['Black', 'White', 'Navy', 'Charcoal', 'Red']);

function merchCodeRowChecks(row, normWallet) {
  if (!row) return { ok: false, error: 'Invalid code' };
  if (row.used_at) return { ok: false, error: 'This code has already been used.' };
  if (row.expires_at && new Date(row.expires_at) <= new Date()) {
    return { ok: false, error: 'This code has expired.' };
  }
  if (String(row.wallet_address).trim().toLowerCase() !== normWallet.toLowerCase()) {
    return {
      ok: false,
      error: 'That code belongs to a different wallet. Connect the wallet that received this code.',
    };
  }
  return { ok: true, codeId: row.id };
}


/**
 * Discord session must have linked `walletAddress`; submitted code must match that wallet's row.
 */
async function verifyMerchPackCode(discordId, walletAddress, submittedCode) {
  const ready = await ensureMerchPackClaimsSchema();
  if (!ready) return { ok: false, error: 'Database unavailable' };
  const p = getPool();
  const normWallet = String(walletAddress || '').trim();
  const normCode = String(submittedCode || '').trim();
  if (!normWallet || !normCode) return { ok: false, error: 'Wallet and code are required' };
  if (normWallet.length < 32 || normWallet.length > 64) return { ok: false, error: 'Invalid wallet address' };

  const linked = await getWalletsByDiscord(discordId);
  const linkedLower = new Set((linked || []).map((w) => String(w).trim().toLowerCase()));
  if (!linkedLower.has(normWallet.toLowerCase())) {
    return { ok: false, error: 'Link this wallet to Discord in the sidebar first.' };
  }

  const res = await p.query(
    `SELECT id, wallet_address, used_at, expires_at FROM merch_pack_codes
     WHERE LOWER(TRIM(claim_code)) = LOWER(TRIM($1))`,
    [normCode]
  );
  const row = res.rows?.[0];
  const chk = merchCodeRowChecks(row, normWallet);
  if (!chk.ok) return chk;
  return { ok: true };
}

/**
 * Atomic: insert claim + mark code used. Discord display name from session applied server-side in route.
 */
async function submitMerchPackClaim(discordId, walletAddress, submittedCode, body, discordDisplay) {
  const ready = await ensureMerchPackClaimsSchema();
  if (!ready) return { ok: false, error: 'Database unavailable' };
  const normWallet = String(walletAddress || '').trim();
  const normCode = String(submittedCode || '').trim();
  const xHandle = String((body && body.x_handle) || '').trim().slice(0, 256);
  const size = String((body && body.size) || '').trim();
  const shirtColor = String((body && body.shirt_color) || '').trim();
  const delivery = String((body && body.delivery_address) || '').trim();

  if (!normWallet || !normCode) return { ok: false, error: 'Wallet and code are required' };
  if (!xHandle) return { ok: false, error: 'X handle is required' };
  if (!delivery || delivery.length < 8) return { ok: false, error: 'Enter a full delivery address' };
  if (delivery.length > 4000) return { ok: false, error: 'Address too long' };
  if (!MERCH_SIZES.has(size)) return { ok: false, error: 'Invalid size' };
  if (!MERCH_COLORS.has(shirtColor)) return { ok: false, error: 'Invalid colour' };

  const linked = await getWalletsByDiscord(discordId);
  const linkedLower = new Set((linked || []).map((w) => String(w).trim().toLowerCase()));
  if (!linkedLower.has(normWallet.toLowerCase())) {
    return { ok: false, error: 'Link this wallet to Discord in the sidebar first.' };
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query(
      `SELECT id, wallet_address, used_at, expires_at FROM merch_pack_codes
       WHERE LOWER(TRIM(claim_code)) = LOWER(TRIM($1))
       FOR UPDATE`,
      [normCode]
    );
    const row = res.rows?.[0];
    const chk = merchCodeRowChecks(row, normWallet);
    if (!chk.ok || !chk.codeId) {
      await client.query('ROLLBACK');
      return chk;
    }

    const disp = String(discordDisplay || '').trim().slice(0, 256) || 'Discord user';

    await client.query(
      `INSERT INTO merch_pack_claims (
        merch_pack_code_id, discord_id, wallet_address, x_handle, discord_handle, size, shirt_color, delivery_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [chk.codeId, String(discordId), normWallet.toLowerCase(), xHandle, disp, size, shirtColor, delivery]
    );

    const upd = await client.query(
      'UPDATE merch_pack_codes SET used_at = NOW() WHERE id = $1 AND used_at IS NULL',
      [chk.codeId]
    );
    if ((upd.rowCount || 0) < 1) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'This code has already been used.' };
    }

    await client.query('COMMIT');
    return { ok: true };
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return { ok: false, error: 'This code has already been claimed.' };
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  getPool,
  upsertUser,
  linkWallet,
  unlinkWallet,
  getWalletsByDiscord,
  getDiscordByWallet,
  getAllWalletToDiscord,
  getDiscordUsernames,
  createRaffle,
  getActiveRaffles,
  getRaffleById,
  getRaffleEntries,
  getRaffleSoldCount,
  addRaffleTickets,
  getRaffleTicketCountByWallet,
  drawRaffleWinner,
  useRafflePaymentSignature,
  setRaffleClaimed,
  ensureWaitListTable,
  addWaitListEntry,
  getWaitListByDiscordId,
  getAllWaitList,
  ensureMerchPackCodesTable,
  ensureMerchPackClaimsSchema,
  verifyMerchPackCode,
  submitMerchPackClaim,
};
