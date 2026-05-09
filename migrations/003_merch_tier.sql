-- Merch pack tier (1–4) from claim code pattern / Gravemint ingest.
ALTER TABLE merch_pack_codes ADD COLUMN IF NOT EXISTS merch_tier SMALLINT;
ALTER TABLE merch_pack_claims ADD COLUMN IF NOT EXISTS merch_tier SMALLINT;

ALTER TABLE merch_pack_codes DROP CONSTRAINT IF EXISTS merch_pack_codes_merch_tier_check;
ALTER TABLE merch_pack_codes ADD CONSTRAINT merch_pack_codes_merch_tier_check
  CHECK (merch_tier IS NULL OR (merch_tier BETWEEN 1 AND 4));

ALTER TABLE merch_pack_claims DROP CONSTRAINT IF EXISTS merch_pack_claims_merch_tier_check;
ALTER TABLE merch_pack_claims ADD CONSTRAINT merch_pack_claims_merch_tier_check
  CHECK (merch_tier IS NULL OR (merch_tier BETWEEN 1 AND 4));
