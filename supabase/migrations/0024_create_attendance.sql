-- Bảng chấm công chuẩn: public.attendance
-- Chạy file này trên Supabase SQL Editor nếu production báo thiếu bảng.

create table if not exists public.attendance (
  id text primary key,
  employee_id text not null references public.employees(id) on delete cascade,
  branch_id text references public.branches(id) on delete set null,
  attendance_date text not null,
  status text not null default '',
  reason text not null default '',
  penalty_amount integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text not null default '',
  unique (employee_id, attendance_date)
);

create index if not exists attendance_date_idx on public.attendance (attendance_date);
create index if not exists attendance_branch_date_idx on public.attendance (branch_id, attendance_date);
create index if not exists attendance_employee_date_idx on public.attendance (employee_id, attendance_date);

-- Copy dữ liệu từ bảng legacy employee_attendance (nếu có)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'employee_attendance'
  ) then
    insert into public.attendance (
      id,
      employee_id,
      branch_id,
      attendance_date,
      status,
      reason,
      penalty_amount,
      created_at,
      updated_at,
      created_by
    )
    select
      ea.id,
      ea.employee_id,
      ea.branch_id,
      ea.date,
      ea.status,
      coalesce(ea.reason, ''),
      coalesce(ea.penalty_amount, 0),
      coalesce(ea.submitted_at, ea.updated_at, now()),
      coalesce(ea.updated_at, ea.submitted_at, now()),
      coalesce(nullif(ea.created_by, ''), ea.submitted_by, '')
    from public.employee_attendance ea
    on conflict (employee_id, attendance_date) do nothing;
  end if;
end $$;

alter table public.attendance enable row level security;

drop policy if exists allow_all_anon_attendance on public.attendance;
create policy allow_all_anon_attendance on public.attendance
  for all to anon using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attendance'
  ) then
    alter publication supabase_realtime add table public.attendance;
  end if;
end $$;

comment on table public.attendance is 'Chấm công nhân viên — bảng chuẩn duy nhất';
comment on column public.attendance.attendance_date is 'Ngày chấm công YYYY-MM-DD';
comment on column public.attendance.created_by is 'employee_id hoặc admin id người tạo';
