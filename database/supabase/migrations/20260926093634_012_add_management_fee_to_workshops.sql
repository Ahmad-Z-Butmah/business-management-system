/*
# Add management fee percentage to workshops

1. Changes
- Add `management_fee_percent` column to `workshops` table (numeric, nullable, default NULL).
  When set (e.g. 5.0), the contractor's management fee is calculated as this percentage
  of the total claims issued for that workshop.
  When NULL, the system falls back to the Worker Daily Margin model (workshop price per head
  minus actual worker wage) to compute profit.
- No security changes — workshops table already has RLS enabled with owner-scoped policies.

2. Notes
- The column is nullable so existing workshops default to the margin-based model.
- No data is lost; this is an additive ALTER only.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workshops' AND column_name = 'management_fee_percent'
  ) THEN
    ALTER TABLE workshops ADD COLUMN management_fee_percent numeric(5,2);
  END IF;
END $$;