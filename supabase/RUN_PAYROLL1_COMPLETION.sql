-- OPTIONAL: bảng chuyên dụng cho kỳ lương 1 (hiện tại app dùng app_settings.payload).
-- Có thể chạy sau nếu muốn tách bảng riêng; app hiện không bắt buộc các bảng này.

-- Trạng thái runtime được lưu trong public.app_settings.payload:
--   payroll1DayReviews, payroll1Overrides, payroll1LockDate, payroll1PeriodStart, payroll1Enabled

create table if not exists public.payroll1_day_reviews (
  id text primary key,
  employee_id text not null references public.employees(id) on delete cascade,
  branch_id text references public.branches(id) on delete set null,
  day_date text not null,
  review_status text not null check (review_status in ('checked', 'no_tour')),
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  unique (employee_id, day_date)
);


create index if not exists payroll1_day_reviews_employee_idx
  on public.payroll1_day_reviews (employee_id, day_date);
create index if not exists payroll1_day_reviews_branch_idx
  on public.payroll1_day_reviews (branch_id, day_date);

create table if not exists public.payroll1_employee_overrides (
  employee_id text primary key references public.employees(id) on delete cascade,
  branch_id text references public.branches(id) on delete set null,
  manual_unlock boolean not null default false,
  admin_confirmed boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

alter table public.payroll1_day_reviews enable row level security;
alter table public.payroll1_employee_overrides enable row level security;

drop policy if exists allow_all_anon_payroll1_day_reviews on public.payroll1_day_reviews;
create policy allow_all_anon_payroll1_day_reviews on public.payroll1_day_reviews
  for all to anon using (true) with check (true);

drop policy if exists allow_all_anon_payroll1_employee_overrides on public.payroll1_employee_overrides;
create policy allow_all_anon_payroll1_employee_overrides on public.payroll1_employee_overrides
  for all to anon using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payroll1_day_reviews'
  ) then
    alter publication supabase_realtime add table public.payroll1_day_reviews;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payroll1_employee_overrides'
  ) then
    alter publication supabase_realtime add table public.payroll1_employee_overrides;
  end if;
end $$;

comment on table public.payroll1_day_reviews is 'Kỳ lương 1 — xác nhận kiểm tra hóa đơn theo ngày (checked | no_tour)';
comment on table public.payroll1_employee_overrides is 'Kỳ lương 1 — Admin mở khóa thủ công / xác nhận hoàn thành';
