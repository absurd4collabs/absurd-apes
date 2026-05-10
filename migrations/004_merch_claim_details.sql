-- Structured merch choices per pack tier (JSON). Legacy size/shirt_color kept as human summary.
ALTER TABLE merch_pack_claims ADD COLUMN IF NOT EXISTS merch_claim_details JSONB;
ALTER TABLE merch_pack_claims ALTER COLUMN size DROP NOT NULL;
ALTER TABLE merch_pack_claims ALTER COLUMN shirt_color DROP NOT NULL;
