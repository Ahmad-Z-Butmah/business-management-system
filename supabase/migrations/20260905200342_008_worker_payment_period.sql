-- Add period tracking columns to worker_payments for period closing functionality
ALTER TABLE worker_payments
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS is_period_closed boolean DEFAULT false;

-- Add a column to daily_registrations to mark settled/closed registrations
ALTER TABLE daily_registrations
  ADD COLUMN IF NOT EXISTS is_settled boolean DEFAULT false;
