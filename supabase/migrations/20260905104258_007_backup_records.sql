/*
# Backup records table

1. New Tables
- `backup_records`: stores metadata for each real backup operation
  - id, user_id, status (success/failed/in_progress), backup_type (manual/scheduled),
    file_path (storage path), file_size (bytes), record_count, error_message,
    created_at, completed_at
2. Security
- RLS enabled, owner-scoped CRUD
3. Notes
- Each backup creates a record here with real status, size, and storage path
- Failed backups are recorded but never overwrite previous successful ones
- Multiple backup versions are preserved in storage
*/

CREATE TABLE IF NOT EXISTS backup_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'success', 'failed')),
  backup_type text NOT NULL DEFAULT 'manual' CHECK (backup_type IN ('manual', 'scheduled')),
  file_path text DEFAULT '',
  file_size bigint DEFAULT 0,
  record_count integer DEFAULT 0,
  error_message text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE backup_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_backups" ON backup_records;
CREATE POLICY "select_own_backups" ON backup_records FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_backups" ON backup_records;
CREATE POLICY "insert_own_backups" ON backup_records FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_backups" ON backup_records;
CREATE POLICY "update_own_backups" ON backup_records FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_backups" ON backup_records;
CREATE POLICY "delete_own_backups" ON backup_records FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_backup_records_user ON backup_records(user_id, created_at);
