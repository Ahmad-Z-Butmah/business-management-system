/*
# Consolidated Claims: multi-workshop support

1. Modified Tables
- `claim_lines`: added `workshop_id` and `workshop_name` columns to preserve which workshop each daily row came from
- `claims`: added `billing_period_start` and `billing_period_end` columns for the selected billing period
2. Security
- No new tables, existing RLS policies cover the new columns
3. Notes
- A single claim can now span multiple workshops for one contractor
- Each claim line preserves the workshop it came from
- The claim header is contractor-based, not workshop-based
*/

-- Add workshop info to claim lines
ALTER TABLE claim_lines ADD COLUMN IF NOT EXISTS workshop_id uuid REFERENCES workshops(id) ON DELETE SET NULL;
ALTER TABLE claim_lines ADD COLUMN IF NOT EXISTS workshop_name text DEFAULT '';

-- Add billing period to claims
ALTER TABLE claims ADD COLUMN IF NOT EXISTS billing_period_start date;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS billing_period_end date;

-- Make workshop_id nullable on claims (consolidated claims span multiple workshops)
ALTER TABLE claims ALTER COLUMN workshop_id DROP NOT NULL;

-- Add index for contractor-based claim lookups
CREATE INDEX IF NOT EXISTS idx_claims_contractor ON claims(contractor_id);
CREATE INDEX IF NOT EXISTS idx_claim_lines_workshop ON claim_lines(workshop_id);
