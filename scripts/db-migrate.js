/**
 * Create database tables if they don't exist.
 * Run: npm run db:migrate
 * Only users + wallets.
 */
require('dotenv').config();
const { Client } = require('pg');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  discord_username TEXT NOT NULL,
  discord_avatar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallets (
  wallet_address TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  connected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_discord ON wallets(discord_id);

CREATE TABLE IF NOT EXISTS raffles (
  id SERIAL PRIMARY KEY,
  prize_nft_mint TEXT NOT NULL,
  prize_nft_name TEXT,
  prize_nft_image TEXT,
  prize_wallet TEXT NOT NULL,
  ticket_count INTEGER NOT NULL,
  ticket_price_token_type TEXT NOT NULL,
  ticket_price_token_mint TEXT,
  ticket_price_raw TEXT NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_discord_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raffle_tickets (
  id SERIAL PRIMARY KEY,
  raffle_id INTEGER NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  ticket_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(raffle_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_raffles_status ON raffles(status);
CREATE INDEX IF NOT EXISTS idx_raffle_tickets_raffle ON raffle_tickets(raffle_id);
`;

const ADD_WINNER_COLUMN = `
ALTER TABLE raffles ADD COLUMN IF NOT EXISTS winner_wallet TEXT;
`;

const RAFFLE_PAYMENT_SIGNATURES = `
CREATE TABLE IF NOT EXISTS raffle_payment_signatures (
  signature TEXT PRIMARY KEY
);
`;

const ADD_TICKET_PRICE_DECIMALS = `
ALTER TABLE raffles ADD COLUMN IF NOT EXISTS ticket_price_decimals INTEGER DEFAULT 6;
`;

const ADD_CLAIM_TX_SIGNATURE = `
ALTER TABLE raffles ADD COLUMN IF NOT EXISTS claim_tx_signature TEXT;
`;

async function run() {
  let url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set. Add it to .env');
    process.exit(1);
  }
  // Use verify-full to avoid pg SSL deprecation warning
  if (url.includes('sslmode=require') || url.includes('sslmode=prefer') || url.includes('sslmode=verify-ca')) {
    url = url.replace(/sslmode=(require|prefer|verify-ca)/i, 'sslmode=verify-full');
  }
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.query(SCHEMA);
    await client.query(ADD_WINNER_COLUMN);
    await client.query(RAFFLE_PAYMENT_SIGNATURES);
    await client.query(ADD_TICKET_PRICE_DECIMALS);
    await client.query(ADD_CLAIM_TX_SIGNATURE);
    console.log('Migration complete.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
