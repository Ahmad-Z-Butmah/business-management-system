/*
# Official Tax Data: versioning, source URLs, verification, traceability

1. Modified Tables
- `tax_rules`: added source_url, last_verified, end_date, version, is_verified columns
2. New Tables
- `tax_calculations`: stores traceable tax calculation results with rules/versions used
3. Security
- RLS enabled on tax_calculations, scoped to authenticated users via user_id
4. Notes
- Tax rules now have full versioning with effective/end dates and verification status
- Tax calculations store the exact rules and inputs used for traceability
- Source URLs point to official Israeli government sources
*/

-- Add versioning and source tracking to tax_rules
ALTER TABLE tax_rules ADD COLUMN IF NOT EXISTS source_url text DEFAULT '';
ALTER TABLE tax_rules ADD COLUMN IF NOT EXISTS last_verified timestamptz;
ALTER TABLE tax_rules ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE tax_rules ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE tax_rules ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- Tax calculations traceability table
CREATE TABLE IF NOT EXISTS tax_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  calculation_type text NOT NULL CHECK (calculation_type IN ('vat', 'income_tax', 'bituach_leumi', 'health', 'combined')),
  reporting_period text NOT NULL DEFAULT '',
  period_start date,
  period_end date,
  gross_income numeric(14,2) DEFAULT 0,
  total_expenses numeric(14,2) DEFAULT 0,
  taxable_income numeric(14,2) DEFAULT 0,
  rules_used jsonb DEFAULT '[]',
  rule_versions jsonb DEFAULT '{}',
  vat_amount numeric(14,2) DEFAULT 0,
  income_tax_amount numeric(14,2) DEFAULT 0,
  bituach_leumi_amount numeric(14,2) DEFAULT 0,
  health_amount numeric(14,2) DEFAULT 0,
  total_tax numeric(14,2) DEFAULT 0,
  net_after_tax numeric(14,2) DEFAULT 0,
  calculation_date timestamptz DEFAULT now(),
  notes text DEFAULT ''
);

ALTER TABLE tax_calculations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_tax_calc" ON tax_calculations;
CREATE POLICY "select_own_tax_calc" ON tax_calculations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_tax_calc" ON tax_calculations;
CREATE POLICY "insert_own_tax_calc" ON tax_calculations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_tax_calc" ON tax_calculations;
CREATE POLICY "update_own_tax_calc" ON tax_calculations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_tax_calc" ON tax_calculations;
CREATE POLICY "delete_own_tax_calc" ON tax_calculations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Index for tax calculations
CREATE INDEX IF NOT EXISTS idx_tax_calc_user ON tax_calculations(user_id, calculation_date);
