/**
 * Apply migrations/003_merch_tier.sql (merch_tier columns).
 * Run: node scripts/apply-003-merch-tier.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const STATEMENTS = [
  'ALTER TABLE merch_pack_codes ADD COLUMN IF NOT EXISTS merch_tier SMALLINT',
  'ALTER TABLE merch_pack_claims ADD COLUMN IF NOT EXISTS merch_tier SMALLINT',
  'ALTER TABLE merch_pack_codes DROP CONSTRAINT IF EXISTS merch_pack_codes_merch_tier_check',
  `ALTER TABLE merch_pack_codes ADD CONSTRAINT merch_pack_codes_merch_tier_check CHECK (merch_tier IS NULL OR (merch_tier BETWEEN 1 AND 4))`,
  'ALTER TABLE merch_pack_claims DROP CONSTRAINT IF EXISTS merch_pack_claims_merch_tier_check',
  `ALTER TABLE merch_pack_claims ADD CONSTRAINT merch_pack_claims_merch_tier_check CHECK (merch_tier IS NULL OR (merch_tier BETWEEN 1 AND 4))`,
];

async function main() {
  let url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set in .env');
    process.exit(1);
  }
  if (url.includes('sslmode=require') || url.includes('sslmode=prefer') || url.includes('sslmode=verify-ca')) {
    url = url.replace(/sslmode=(require|prefer|verify-ca)/i, 'sslmode=verify-full');
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15000 });
  await client.connect();
  for (let i = 0; i < STATEMENTS.length; i++) {
    try {
      await client.query(STATEMENTS[i]);
    } catch (e) {
      if (e.code === '42710' || e.code === '42P16') continue; /* duplicate constraint / invalid object state */
      throw e;
    }
  }
  console.log('Merch_tier migration applied (idempotent; safe if already present).');
  await client.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
