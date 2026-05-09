-- Merch mint codes: one row per wallet ↔ claim_code (run once in Neon SQL editor or `psql`)
CREATE TABLE IF NOT EXISTS merch_pack_codes (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(64) NOT NULL UNIQUE,
  claim_code VARCHAR(128) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO merch_pack_codes (wallet_address, claim_code)
VALUES
  ('dwtestmerchpack01absurdapesaaa11111111111111', 'DUMMY-MERCH-001'),
  ('dwtestmerchpack02absurdapesbbb11111111111111', 'DUMMY-MERCH-002'),
  ('dwtestmerchpack03absurdapesccc11111111111111', 'DUMMY-MERCH-003'),
  ('dwtestmerchpack04absurdapesddd11111111111111', 'DUMMY-MERCH-004')
ON CONFLICT (wallet_address) DO NOTHING;
