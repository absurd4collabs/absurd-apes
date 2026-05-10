-- All apparel options live in merch_claim_details (JSONB) only.
ALTER TABLE merch_pack_claims DROP COLUMN IF EXISTS size;
ALTER TABLE merch_pack_claims DROP COLUMN IF EXISTS shirt_color;
