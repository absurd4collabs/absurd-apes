/**
 * Apply migrations/004_merch_claim_details.sql
 * Run: npm run db:migrate:merch-claim-details
 */
require('dotenv').config();
const { Client } = require('pg');

const STATEMENTS = [
  'ALTER TABLE merch_pack_claims ADD COLUMN IF NOT EXISTS merch_claim_details JSONB',
  'ALTER TABLE merch_pack_claims ALTER COLUMN size DROP NOT NULL',
  'ALTER TABLE merch_pack_claims ALTER COLUMN shirt_color DROP NOT NULL',
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
      /* 42701 = duplicate_column on ADD IF NOT EXISTS edge cases */
      if (e.code === '42701') continue;
      throw e;
    }
  }
  try {
    await client.query('ALTER TABLE merch_pack_claims ALTER COLUMN size TYPE VARCHAR(512)');
  } catch (e) {
    if (e.code !== '42804' && e.code !== '0A000') console.warn('[004]', e.message);
  }

  const cols = await client.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'merch_pack_claims'
     ORDER BY ordinal_position`
  );
  console.log('');
  console.log('Table: public.merch_pack_claims (not merch_pack_codes)');
  console.log(
    'Columns:',
    cols.rows.map(function (r) {
      return r.column_name + '(' + r.data_type + ')';
    }).join(', ')
  );
  var hasJson = cols.rows.some(function (r) {
    return r.column_name === 'merch_claim_details';
  });
  if (!hasJson) {
    console.error('');
    console.error('WARNING: merch_claim_details is missing. Wrong DATABASE_URL or DB user lacks ALTER?');
    process.exit(1);
  }
  console.log('');
  console.log('merch_claim_details migration OK.');
  await client.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
