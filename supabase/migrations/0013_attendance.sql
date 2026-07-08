-- Chấm công / điểm danh nhân viên — Supabase-only (không LocalStorage)
-- Chạy sau 0012_invoice_customer_requested.sql

create table if not exists public.employee_attendance (
  id text primary key,
  date text not null,
  branch_id text references public.branches(id) on delete set null,
  employee_id text not null references public.employees(id) on delete cascade,
  employee_name text not null default '',
  status text not null default '',
  reason text not null default '',
  note text not null default '',
  penalty_amount integer not null default 0,
  submitted_at timestamptz not null default now(),
  submitted_by text not null default '',
  updated_at timestamptz not null default now(),
  unique (employee_id, date)
);

create index if not exists employee_attendance_date_idx on public.employee_attendance (date);
create index if not exists employee_attendance_branch_date_idx on public.employee_attendance (branch_id, date);
create index if not exists employee_attendance_employee_date_idx on public.employee_attendance (employee_id, date);

create table if not exists public.attendance_edit_logs (
  id text primary key,
  attendance_id text not null references public.employee_attendance(id) on delete cascade,
  editor_id text not null default '',
  editor_name text not null default '',
  edited_at timestamptz not null default now(),
  field_name text not null default '',
  old_value text not null default '',
  new_value text not null default '',
  note text not null default ''
);

create index if not exists attendance_edit_logs_attendance_idx on public.attendance_edit_logs (attendance_id);

-- Ngày/giờ server (Asia/Ho_Chi_Minh) — không dùng giờ máy client
create or replace function public.get_attendance_server_date()
returns json
language sql
stable
as $$
  select json_build_object(
    'date', to_char((now() at time zone 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD'),
    'timestamp', (now() at time zone 'Asia/Ho_Chi_Minh')
  );
$$;

alter table public.employee_attendance enable row level security;
alter table public.attendance_edit_logs enable row level security;

drop policy if exists allow_all_anon_employee_attendance on public.employee_attendance;
create policy allow_all_anon_employee_attendance on public.employee_attendance
  for all to anon using (true) with check (true);

drop policy if exists allow_all_anon_attendance_edit_logs on public.attendance_edit_logs;
create policy allow_all_anon_attendance_edit_logs on public.attendance_edit_logs
  for all to anon using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'employee_attendance'
  ) then
    alter publication supabase_realtime add table public.employee_attendance;
  end if;
end $$;
