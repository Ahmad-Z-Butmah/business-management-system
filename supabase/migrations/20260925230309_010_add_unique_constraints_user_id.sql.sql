-- Add unique constraints on user_id for business_profiles and app_settings
-- This is required for upsert (ON CONFLICT) to work correctly.
-- Without these, the Supabase client upsert with onConflict: 'user_id' silently fails
-- because Postgres needs a unique constraint or unique index on the conflict column.

CREATE UNIQUE INDEX IF NOT EXISTS business_profiles_user_id_unique
  ON business_profiles (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS app_settings_user_id_unique
  ON app_settings (user_id);
