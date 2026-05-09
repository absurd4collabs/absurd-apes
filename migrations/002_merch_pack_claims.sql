-- One-time use + shipping details for merch codes (run in Neon if not using app ensure*)
ALTER TABLE merch_pack_codes ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
ALTER TABLE merch_pack_codes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

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
);

CREATE INDEX IF NOT EXISTS merch_pack_claims_discord_id ON merch_pack_claims (discord_id);
