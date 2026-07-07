-- Trường ERP mở rộng cho hồ sơ nhân viên (ngày nghỉ, hoa hồng, lương).
alter table public.employees
  add column if not exists end_date text not null default '',
  add column if not exists commission_rate text not null default '',
  add column if not exists salary_rate text not null default '';
