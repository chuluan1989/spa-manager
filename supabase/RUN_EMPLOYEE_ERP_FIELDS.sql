-- ============================================================
-- CHẠY TRÊN SUPABASE SQL EDITOR (Production)
-- Thêm cột ERP cho bảng employees
--
-- Cột:
--   commission_rate  — mức hoa hồng
--   salary_rate      — tỷ lệ lương
--   days_off         — ngày nghỉ việc
--
-- Cách làm:
-- 1. supabase.com/dashboard → chọn đúng project của khoespa.net.vn
-- 2. SQL Editor → New query
-- 3. Dán TOÀN BỘ file này → Run
-- 4. Ctrl+F5 trên app → thử lưu hồ sơ lại
-- ============================================================

alter table public.employees
  add column if not exists commission_rate text not null default '',
  add column if not exists salary_rate text not null default '',
  add column if not exists days_off text not null default '';

notify pgrst, 'reload schema';
