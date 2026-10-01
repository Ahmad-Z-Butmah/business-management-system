/*
# Extra Work, Document Vault, Tax Submissions, Team Leader Headcount

1. New Tables
- `extra_work`: structured or free-text extra work items
- `documents`: invoice/document vault with OCR data
- `tax_submissions`: tax/submission calendar
2. Modified Tables
- `daily_registrations`: added `headcount` column for team leader daily headcount
3. Security
- RLS enabled on all new tables, scoped to authenticated users via user_id
*/

-- Add headcount column to daily_registrations
ALTER TABLE daily_registrations ADD COLUMN IF NOT EXISTS headcount integer NOT NULL DEFAULT 1;

-- Extra work table
CREATE TABLE IF NOT EXISTS extra_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  mode text NOT NULL DEFAULT 'free_text' CHECK (mode IN ('structured', 'free_text')),
  company text DEFAULT '',
  contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL,
  workshop_id uuid REFERENCES workshops(id) ON DELETE SET NULL,
  subject text NOT NULL DEFAULT '',
  work_description text DEFAULT '',
  quantity numeric(12,2),
  unit_price numeric(12,2),
  total_price numeric(14,2) NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'claimed', 'invoiced', 'archived')),
  related_claim_id uuid REFERENCES claims(id) ON DELETE SET NULL,
  from_time text DEFAULT '',
  to_time text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE extra_work ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_extra_work" ON extra_work;
CREATE POLICY "select_own_extra_work" ON extra_work FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_extra_work" ON extra_work;
CREATE POLICY "insert_own_extra_work" ON extra_work FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_extra_work" ON extra_work;
CREATE POLICY "update_own_extra_work" ON extra_work FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_extra_work" ON extra_work;
CREATE POLICY "delete_own_extra_work" ON extra_work FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Documents vault table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'business_expense' CHECK (category IN ('customer_billing', 'business_expense')),
  image_url text DEFAULT '',
  document_date date,
  due_date date,
  invoice_number text DEFAULT '',
  supplier_name text DEFAULT '',
  amount numeric(14,2) DEFAULT 0,
  vat_amount numeric(14,2) DEFAULT 0,
  total numeric(14,2) DEFAULT 0,
  description text DEFAULT '',
  ocr_data jsonb DEFAULT '{}',
  ocr_reviewed boolean NOT NULL DEFAULT false,
  contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL,
  workshop_id uuid REFERENCES workshops(id) ON DELETE SET NULL,
  related_claim_id uuid REFERENCES claims(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'sent', 'archived')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_documents" ON documents;
CREATE POLICY "select_own_documents" ON documents FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_documents" ON documents;
CREATE POLICY "insert_own_documents" ON documents FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_documents" ON documents;
CREATE POLICY "update_own_documents" ON documents FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_documents" ON documents;
CREATE POLICY "delete_own_documents" ON documents FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Tax submissions calendar table
CREATE TABLE IF NOT EXISTS tax_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  obligation_type text NOT NULL CHECK (obligation_type IN ('vat', 'income_tax', 'bituach_leumi', 'annual', 'other')),
  reporting_period text NOT NULL DEFAULT '',
  period_start date,
  period_end date,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'prepared', 'submitted', 'paid', 'cancelled')),
  amount numeric(14,2),
  source text DEFAULT '',
  notes text DEFAULT '',
  reminder_enabled boolean NOT NULL DEFAULT true,
  last_rules_update timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tax_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_tax_sub" ON tax_submissions;
CREATE POLICY "select_own_tax_sub" ON tax_submissions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_tax_sub" ON tax_submissions;
CREATE POLICY "insert_own_tax_sub" ON tax_submissions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_tax_sub" ON tax_submissions;
CREATE POLICY "update_own_tax_sub" ON tax_submissions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_tax_sub" ON tax_submissions;
CREATE POLICY "delete_own_tax_sub" ON tax_submissions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_extra_work_user ON extra_work(user_id);
CREATE INDEX IF NOT EXISTS idx_extra_work_date ON extra_work(work_date);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_submissions_user ON tax_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_submissions_due ON tax_submissions(due_date);
