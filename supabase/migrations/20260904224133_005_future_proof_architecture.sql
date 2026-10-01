/*
# Future-Proof Architecture: Tax Invoices, Tasks, Enhanced Audit, Attachments, Feature Flags

1. New Tables
- `tax_invoices`: Israeli tax invoice with assignment number support, linked to claim/contractor
- `tasks`: tasks & reminders center with auto-generated and manual reminders
- `attachments`: file/image attachments linked to any business entity
- `feature_flags`: per-user feature flags for future plan-based feature gating
- `user_roles`: future role/permission support (owner/manager/employee/accountant/viewer)
- `account_management`: account status, plan, subscription metadata
2. Modified Tables
- `audit_logs`: added old_value, new_value, source_device columns for stronger audit trail
3. Security
- RLS enabled on all new tables, scoped to authenticated users via user_id
4. Notes
- Tax invoice assignment numbers are data-driven, not hard-coded
- Tasks support auto-generation from system state (claims not sent, deadlines approaching, etc.)
- Attachments store metadata and base64 image data
- Feature flags default to enabled for core features
- User roles table is future-ready but only 'owner' is exposed initially
*/

-- Tax invoices table
CREATE TABLE IF NOT EXISTS tax_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number text NOT NULL DEFAULT '',
  assignment_number text DEFAULT '',
  claim_id uuid REFERENCES claims(id) ON DELETE SET NULL,
  contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  taxable_amount numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('draft', 'issued', 'sent', 'paid', 'void', 'cancelled')),
  notes text DEFAULT '',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tax_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_tax_inv" ON tax_invoices;
CREATE POLICY "select_own_tax_inv" ON tax_invoices FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_tax_inv" ON tax_invoices;
CREATE POLICY "insert_own_tax_inv" ON tax_invoices FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_tax_inv" ON tax_invoices;
CREATE POLICY "update_own_tax_inv" ON tax_invoices FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_tax_inv" ON tax_invoices;
CREATE POLICY "delete_own_tax_inv" ON tax_invoices FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Tasks & reminders table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('claims', 'payments', 'documents', 'tax', 'backup', 'agreements', 'workshops', 'general')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date date,
  related_entity_type text DEFAULT '',
  related_entity_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'postponed', 'dismissed')),
  is_auto_generated boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_tasks" ON tasks;
CREATE POLICY "select_own_tasks" ON tasks FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_tasks" ON tasks;
CREATE POLICY "insert_own_tasks" ON tasks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_tasks" ON tasks;
CREATE POLICY "update_own_tasks" ON tasks FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_tasks" ON tasks;
CREATE POLICY "delete_own_tasks" ON tasks FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Attachments table
CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL DEFAULT '',
  file_type text DEFAULT '',
  file_size integer DEFAULT 0,
  file_data text DEFAULT '',
  related_entity_type text NOT NULL DEFAULT '',
  related_entity_id uuid,
  uploaded_by text DEFAULT '',
  checksum text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_attachments" ON attachments;
CREATE POLICY "select_own_attachments" ON attachments FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_attachments" ON attachments;
CREATE POLICY "insert_own_attachments" ON attachments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_attachments" ON attachments;
CREATE POLICY "delete_own_attachments" ON attachments FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Feature flags table
CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, feature_key)
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_flags" ON feature_flags;
CREATE POLICY "select_own_flags" ON feature_flags FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_flags" ON feature_flags;
CREATE POLICY "insert_own_flags" ON feature_flags FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_flags" ON feature_flags;
CREATE POLICY "update_own_flags" ON feature_flags FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User roles table (future-ready, only 'owner' exposed initially)
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'employee', 'accountant', 'viewer')),
  permissions jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_roles" ON user_roles;
CREATE POLICY "select_own_roles" ON user_roles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_roles" ON user_roles;
CREATE POLICY "insert_own_roles" ON user_roles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_roles" ON user_roles;
CREATE POLICY "update_own_roles" ON user_roles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Account management table
CREATE TABLE IF NOT EXISTS account_management (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'pending_deletion', 'deleted')),
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'pro', 'business')),
  subscription_status text DEFAULT 'none',
  deletion_requested_at timestamptz,
  deletion_scheduled_for timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE account_management ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_account" ON account_management;
CREATE POLICY "select_own_account" ON account_management FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_account" ON account_management;
CREATE POLICY "insert_own_account" ON account_management FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_account" ON account_management;
CREATE POLICY "update_own_account" ON account_management FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Enhance audit_logs with old_value, new_value, source_device
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS old_value jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS new_value jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS source_device text DEFAULT '';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tax_invoices_user ON tax_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_feature_flags_user ON feature_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_account_mgmt_user ON account_management(user_id);
