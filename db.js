/**
 * Database helpers for users, wallets, pairs state.
 * Uses Neon PostgreSQL.
 */
const { Pool } = require('pg');

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

// ——— Pairs game state ———
async function getPairsState(discordId) {
  const p = getPool();
  if (!p) return null;
  const res = await p.query(
    'SELECT turns_remaining, deck_json, flipped_json, matched_json, prizes_won_json FROM pairs_state WHERE discord_id = $1',
    [discordId]
  );
  const row = res.rows?.[0];
  if (!row) return null;
  return {
    turnsRemaining: row.turns_remaining || 0,
    deck: row.deck_json || [],
    flipped: row.flipped_json || [],
    matched: row.matched_json || {},
    prizesWon: row.prizes_won_json || [],
  };
}

async function savePairsState(discordId, state) {
  const p = getPool();
  if (!p) return null;
  await p.query(
    `INSERT INTO pairs_state (discord_id, turns_remaining, deck_json, flipped_json, matched_json, prizes_won_json, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, NOW())
     ON CONFLICT (discord_id) DO UPDATE SET
       turns_remaining = EXCLUDED.turns_remaining,
       deck_json = EXCLUDED.deck_json,
       flipped_json = EXCLUDED.flipped_json,
       matched_json = EXCLUDED.matched_json,
       prizes_won_json = EXCLUDED.prizes_won_json,
       updated_at = NOW()`,
    [
      discordId,
      state.turnsRemaining ?? 0,
      JSON.stringify(state.deck || []),
      JSON.stringify(state.flipped || []),
      JSON.stringify(state.matched || {}),
      JSON.stringify(state.prizesWon || []),
    ]
  );
  return state;
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
    const rand = Math.random() * entriesTotal;
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

module.exports = {
  getPool,
  upsertUser,
  linkWallet,
  getWalletsByDiscord,
  getDiscordByWallet,
  getAllWalletToDiscord,
  getDiscordUsernames,
  getPairsState,
  savePairsState,
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
};
