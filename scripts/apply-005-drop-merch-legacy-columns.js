/**
 * Drop legacy size / shirt_color from merch_pack_claims (data is in merch_claim_details).
 * Run: npm run db:migrate:merch-drop-legacy-columns
 */
require('dotenv').config();
const { Client } = require('pg');

const STATEMENTS = [
  'ALTER TABLE merch_pack_claims DROP COLUMN IF EXISTS size',
  'ALTER TABLE merch_pack_claims DROP COLUMN IF EXISTS shirt_color',
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
    await client.query(STATEMENTS[i]);
  }
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'merch_pack_claims'
     ORDER BY 1`
  );
  const names = cols.rows.map(function (r) {
    return r.column_name;
  });
  if (names.indexOf('size') >= 0 || names.indexOf('shirt_color') >= 0) {
    console.error('Columns size/shirt_color still present.');
    process.exit(1);
  }
  console.log('Dropped size & shirt_color. Remaining:', names.join(', '));
  await client.end();
}

main().catch(function (e) {
  console.error(e.message);
  process.exit(1);
});
