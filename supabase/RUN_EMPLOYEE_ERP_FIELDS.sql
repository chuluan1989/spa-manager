-- ============================================================
-- CHẠY TRÊN SUPABASE SQL EDITOR (Production)
-- Fix: Could not find the 'commission_rate' column of 'employees'
--
-- Cách làm:
-- 1. supabase.com/dashboard → chọn đúng project của khoespa.net.vn
-- 2. SQL Editor → New query
-- 3. Dán TOÀN BỘ file này → Run
-- 4. (Tuỳ chọn) Redeploy app sau khi muốn sync end_date/commission_rate/salary_rate lên cloud
-- ============================================================

alter table public.employees
  add column if not exists end_date text not null default '',
  add column if not exists commission_rate text not null default '',
  add column if not exists salary_rate text not null default '';

notify pgrst, 'reload schema';
