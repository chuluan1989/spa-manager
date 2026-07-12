-- Trường ERP mở rộng cho hồ sơ nhân viên (hoa hồng, lương, ngày nghỉ).
alter table public.employees
  add column if not exists commission_rate text not null default '',
  add column if not exists salary_rate text not null default '',
  add column if not exists days_off text not null default '';
