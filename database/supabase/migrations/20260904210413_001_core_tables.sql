/*
# Core Tables: Business Profiles, Workers, Contractors, Workshops

1. New Tables
- `business_profiles`: 1:1 with auth user, stores business name, logo URL, phone, address
- `workers`: permanent worker profiles, type (normal/team_leader), active status, trade, phone, notes
- `worker_wage_history`: immutable historical wage records with effective dates
- `worker_overtime_history`: immutable historical overtime hourly rates with effective dates
- `team_memberships`: links workers to team leaders
- `contractors`: client profiles, company info, active status
- `workshops`: workshop definitions linked to contractors, type (daily_wage/contract), active/closed
- `workshop_contracts`: contract details for contract-type workshops (agreed amount, received, remaining, status)

2. Security
- RLS enabled on all tables
- All tables scoped to authenticated users via user_id
- Owner columns default to auth.uid()

3. Notes
- Worker wage and overtime history are immutable: changing current rate adds a new row, never edits existing
- Team leaders are workers with worker_type = 'team_leader'
- Workshops link to contractors; contractor comes from workshop definition for claims
*/

-- Business profiles
CREATE TABLE IF NOT EXISTS business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text NOT NULL DEFAULT '',
  phone text DEFAULT '',
  address text DEFAULT '',
  logo_url text DEFAULT '',
  currency text NOT NULL DEFAULT 'ILS',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON business_profiles;
CREATE POLICY "select_own_profile" ON business_profiles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_profile" ON business_profiles;
CREATE POLICY "insert_own_profile" ON business_profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_profile" ON business_profiles;
CREATE POLICY "update_own_profile" ON business_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_profile" ON business_profiles;
CREATE POLICY "delete_own_profile" ON business_profiles FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Workers
CREATE TABLE IF NOT EXISTS workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text DEFAULT '',
  profession text DEFAULT '',
  worker_type text NOT NULL DEFAULT 'normal' CHECK (worker_type IN ('normal', 'team_leader')),
  is_active boolean NOT NULL DEFAULT true,
  notes text DEFAULT '',
  default_daily_wage numeric(12,2) DEFAULT 0,
  default_overtime_rate numeric(12,2) DEFAULT 0,
  default_driving_amount numeric(12,2) DEFAULT 50,
  effective_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_workers" ON workers;
CREATE POLICY "select_own_workers" ON workers FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_workers" ON workers;
CREATE POLICY "insert_own_workers" ON workers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_workers" ON workers;
CREATE POLICY "update_own_workers" ON workers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_workers" ON workers;
CREATE POLICY "delete_own_workers" ON workers FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Worker wage history (immutable)
CREATE TABLE IF NOT EXISTS worker_wage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  daily_wage numeric(12,2) NOT NULL,
  effective_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE worker_wage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_wage_history" ON worker_wage_history;
CREATE POLICY "select_own_wage_history" ON worker_wage_history FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_wage_history" ON worker_wage_history;
CREATE POLICY "insert_own_wage_history" ON worker_wage_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_wage_history" ON worker_wage_history;
CREATE POLICY "delete_own_wage_history" ON worker_wage_history FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Worker overtime rate history (immutable)
CREATE TABLE IF NOT EXISTS worker_overtime_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  overtime_rate numeric(12,2) NOT NULL,
  effective_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE worker_overtime_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ot_history" ON worker_overtime_history;
CREATE POLICY "select_own_ot_history" ON worker_overtime_history FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_ot_history" ON worker_overtime_history;
CREATE POLICY "insert_own_ot_history" ON worker_overtime_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_ot_history" ON worker_overtime_history;
CREATE POLICY "delete_own_ot_history" ON worker_overtime_history FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Team memberships
CREATE TABLE IF NOT EXISTS team_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  team_leader_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_teams" ON team_memberships;
CREATE POLICY "select_own_teams" ON team_memberships FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_teams" ON team_memberships;
CREATE POLICY "insert_own_teams" ON team_memberships FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_teams" ON team_memberships;
CREATE POLICY "delete_own_teams" ON team_memberships FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Contractors / Clients
CREATE TABLE IF NOT EXISTS contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  company_name text DEFAULT '',
  phone text DEFAULT '',
  address text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_contractors" ON contractors;
CREATE POLICY "select_own_contractors" ON contractors FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_contractors" ON contractors;
CREATE POLICY "insert_own_contractors" ON contractors FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_contractors" ON contractors;
CREATE POLICY "update_own_contractors" ON contractors FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_contractors" ON contractors;
CREATE POLICY "delete_own_contractors" ON contractors FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Workshops
CREATE TABLE IF NOT EXISTS workshops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL,
  phone text DEFAULT '',
  address text DEFAULT '',
  workshop_type text NOT NULL DEFAULT 'daily_wage' CHECK (workshop_type IN ('daily_wage', 'contract')),
  is_active boolean NOT NULL DEFAULT true,
  start_date date,
  end_date date,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE workshops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_workshops" ON workshops;
CREATE POLICY "select_own_workshops" ON workshops FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_workshops" ON workshops;
CREATE POLICY "insert_own_workshops" ON workshops FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_workshops" ON workshops;
CREATE POLICY "update_own_workshops" ON workshops FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_workshops" ON workshops;
CREATE POLICY "delete_own_workshops" ON workshops FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Workshop contracts (for contract-type workshops)
CREATE TABLE IF NOT EXISTS workshop_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  workshop_id uuid NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  contract_name text NOT NULL DEFAULT '',
  agreed_amount numeric(14,2) NOT NULL DEFAULT 0,
  agreement_type text NOT NULL DEFAULT 'fixed' CHECK (agreement_type IN ('fixed', 'per_worker')),
  start_date date,
  end_date date,
  received_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE workshop_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_contracts" ON workshop_contracts;
CREATE POLICY "select_own_contracts" ON workshop_contracts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_contracts" ON workshop_contracts;
CREATE POLICY "insert_own_contracts" ON workshop_contracts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_contracts" ON workshop_contracts;
CREATE POLICY "update_own_contracts" ON workshop_contracts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_contracts" ON workshop_contracts;
CREATE POLICY "delete_own_contracts" ON workshop_contracts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workers_user ON workers(user_id);
CREATE INDEX IF NOT EXISTS idx_workers_active ON workers(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_contractors_user ON contractors(user_id);
CREATE INDEX IF NOT EXISTS idx_workshops_user ON workshops(user_id);
CREATE INDEX IF NOT EXISTS idx_workshops_contractor ON workshops(contractor_id);
CREATE INDEX IF NOT EXISTS idx_wage_history_worker ON worker_wage_history(worker_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_ot_history_worker ON worker_overtime_history(worker_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_team_members_leader ON team_memberships(team_leader_id);
CREATE INDEX IF NOT EXISTS idx_team_members_worker ON team_memberships(worker_id);
