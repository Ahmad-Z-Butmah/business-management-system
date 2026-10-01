-- Add unique constraint on user_id for account_management
-- Required for upsert (ON CONFLICT) to work with onConflict: 'user_id'

CREATE UNIQUE INDEX IF NOT EXISTS account_management_user_id_unique
  ON account_management (user_id);
