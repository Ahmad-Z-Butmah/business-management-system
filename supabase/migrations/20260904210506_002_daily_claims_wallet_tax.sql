/*
# Daily Registration, Claims, Wallet, Tax Tables

1. New Tables
- `daily_registrations`: one record per worker per workshop per date. Stores historical snapshot of wage, overtime, driving.
- `claims`: claim headers with auto-generated claim number, status, VAT snapshot
- `claim_lines`: individual rows in a claim (date, worker_count, price_per_head, daily_total)
- `wallet_accounts`: 3 accounts (Bank Leumi, Bank Hapoalim, Cash) with opening balances
- `wallet_transactions`: all money movements (income, expense, transfer, opening_balance, worker_payment, claim_receipt)
- `worker_payments`: actual payments to workers (affects wallet)
- `tax_rules`: data-driven tax rules with effective dates (VAT, income_tax brackets, bituach_leumi)
- `app_settings`: per-user settings (language, backup time, etc.)
- `audit_logs`: track important business events

2. Security
- RLS enabled on all tables, scoped to authenticated users via user_id

3. Notes
- Daily registrations store actual historical values (wage, overtime rate, driving amount) as snapshots
- Claims store VAT rate snapshot at creation time
- Wallet transactions store type (income/expense/transfer/opening/worker_payment/claim_receipt)
- Tax rules are immutable historical records with effective dates
*/

-- Daily registrations (one per worker per workshop per date)
CREATE TABLE IF NOT EXISTS daily_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  workshop_id uuid NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  daily_wage numeric(12,2) NOT NULL DEFAULT 0,
  has_overtime boolean NOT NULL DEFAULT false,
  overtime_hours numeric(5,2) DEFAULT 0,
  overtime_rate numeric(12,2) DEFAULT 0,
  has_driving_outbound boolean NOT NULL DEFAULT false,
  has_driving_return boolean NOT NULL DEFAULT false,
  driving_amount numeric(12,2) DEFAULT 0,
  notes text DEFAULT '',
  is_claimed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE daily_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_daily_reg" ON daily_registrations;
CREATE POLICY "select_own_daily_reg" ON daily_registrations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_daily_reg" ON daily_registrations;
CREATE POLICY "insert_own_daily_reg" ON daily_registrations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_daily_reg" ON daily_registrations;
CREATE POLICY "update_own_daily_reg" ON daily_registrations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_daily_reg" ON daily_registrations;
CREATE POLICY "delete_own_daily_reg" ON daily_registrations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Claims
CREATE TABLE IF NOT EXISTS claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_number text NOT NULL,
  workshop_id uuid NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL,
  claim_date date NOT NULL DEFAULT CURRENT_DATE,
  price_per_head numeric(12,2) NOT NULL DEFAULT 0,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'prepared', 'sent', 'partially_received', 'fully_received', 'closed')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_claims" ON claims;
CREATE POLICY "select_own_claims" ON claims FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_claims" ON claims;
CREATE POLICY "insert_own_claims" ON claims FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_claims" ON claims;
CREATE POLICY "update_own_claims" ON claims FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_claims" ON claims;
CREATE POLICY "delete_own_claims" ON claims FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Claim lines
CREATE TABLE IF NOT EXISTS claim_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  worker_count integer NOT NULL,
  price_per_head numeric(12,2) NOT NULL,
  daily_total numeric(14,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE claim_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_claim_lines" ON claim_lines;
CREATE POLICY "select_own_claim_lines" ON claim_lines FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_claim_lines" ON claim_lines;
CREATE POLICY "insert_own_claim_lines" ON claim_lines FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_claim_lines" ON claim_lines;
CREATE POLICY "delete_own_claim_lines" ON claim_lines FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Wallet accounts
CREATE TABLE IF NOT EXISTS wallet_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  account_type text NOT NULL DEFAULT 'bank' CHECK (account_type IN ('bank', 'cash')),
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE wallet_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_wallet" ON wallet_accounts;
CREATE POLICY "select_own_wallet" ON wallet_accounts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_wallet" ON wallet_accounts;
CREATE POLICY "insert_own_wallet" ON wallet_accounts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_wallet" ON wallet_accounts;
CREATE POLICY "update_own_wallet" ON wallet_accounts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_wallet" ON wallet_accounts;
CREATE POLICY "delete_own_wallet" ON wallet_accounts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Wallet transactions
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_account_id uuid NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  type text NOT NULL CHECK (type IN ('income', 'expense', 'transfer_in', 'transfer_out', 'opening_balance', 'worker_payment', 'claim_receipt')),
  amount numeric(14,2) NOT NULL,
  description text DEFAULT '',
  related_worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  related_contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL,
  related_claim_id uuid REFERENCES claims(id) ON DELETE SET NULL,
  transfer_pair_id uuid REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_wt" ON wallet_transactions;
CREATE POLICY "select_own_wt" ON wallet_transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_wt" ON wallet_transactions;
CREATE POLICY "insert_own_wt" ON wallet_transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_wt" ON wallet_transactions;
CREATE POLICY "update_own_wt" ON wallet_transactions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_wt" ON wallet_transactions;
CREATE POLICY "delete_own_wt" ON wallet_transactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Worker payments (actual payments, affect wallet)
CREATE TABLE IF NOT EXISTS worker_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(12,2) NOT NULL,
  wallet_account_id uuid REFERENCES wallet_accounts(id) ON DELETE SET NULL,
  description text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE worker_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_payments" ON worker_payments;
CREATE POLICY "select_own_payments" ON worker_payments FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_payments" ON worker_payments;
CREATE POLICY "insert_own_payments" ON worker_payments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_payments" ON worker_payments;
CREATE POLICY "update_own_payments" ON worker_payments FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_payments" ON worker_payments;
CREATE POLICY "delete_own_payments" ON worker_payments FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Tax rules (immutable historical records)
CREATE TABLE IF NOT EXISTS tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_type text NOT NULL CHECK (tax_type IN ('vat', 'income_tax', 'bituach_leumi')),
  tax_year text NOT NULL,
  effective_date date NOT NULL,
  rate numeric(6,4) DEFAULT 0,
  bracket_min numeric(14,2) DEFAULT 0,
  bracket_max numeric(14,2),
  bracket_rate numeric(6,4) DEFAULT 0,
  source text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tax_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_tax" ON tax_rules;
CREATE POLICY "select_own_tax" ON tax_rules FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_tax" ON tax_rules;
CREATE POLICY "insert_own_tax" ON tax_rules FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_tax" ON tax_rules;
CREATE POLICY "update_own_tax" ON tax_rules FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_tax" ON tax_rules;
CREATE POLICY "delete_own_tax" ON tax_rules FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- App settings
CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'he', 'en')),
  backup_time text DEFAULT '02:00',
  backup_enabled boolean NOT NULL DEFAULT true,
  last_backup_at timestamptz,
  last_backup_status text DEFAULT '',
  last_backup_size integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_settings" ON app_settings;
CREATE POLICY "select_own_settings" ON app_settings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_settings" ON app_settings;
CREATE POLICY "insert_own_settings" ON app_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_settings" ON app_settings;
CREATE POLICY "update_own_settings" ON app_settings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_settings" ON app_settings;
CREATE POLICY "delete_own_settings" ON app_settings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text DEFAULT '',
  entity_id uuid,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_audit" ON audit_logs;
CREATE POLICY "select_own_audit" ON audit_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_audit" ON audit_logs;
CREATE POLICY "insert_own_audit" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_reg_user_date ON daily_registrations(user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_daily_reg_workshop ON daily_registrations(workshop_id, work_date);
CREATE INDEX IF NOT EXISTS idx_daily_reg_worker ON daily_registrations(worker_id, work_date);
CREATE INDEX IF NOT EXISTS idx_claims_user ON claims(user_id);
CREATE INDEX IF NOT EXISTS idx_claims_workshop ON claims(workshop_id);
CREATE INDEX IF NOT EXISTS idx_claim_lines_claim ON claim_lines(claim_id);
CREATE INDEX IF NOT EXISTS idx_payments_worker ON worker_payments(worker_id);
CREATE INDEX IF NOT EXISTS idx_wt_account ON wallet_transactions(wallet_account_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_wt_user ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_rules_user ON tax_rules(user_id, tax_type, effective_date);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at);
