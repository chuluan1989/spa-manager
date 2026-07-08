-- ============================================================
-- CHẠY NGAY TRÊN SUPABASE SQL EDITOR (Production)
-- Fix: "Could not find the table public.attendance in schema cache"
-- ============================================================

-- 1. Bảng chấm công chuẩn
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

-- 2. RPC ngày server (nếu chưa có)
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

-- 3. RLS cho phép app anon (giống các bảng khác)
alter table public.attendance enable row level security;

drop policy if exists allow_all_anon_attendance on public.attendance;
create policy allow_all_anon_attendance on public.attendance
  for all to anon using (true) with check (true);

-- 4. Realtime (tuỳ chọn)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'attendance'
    ) then
      alter publication supabase_realtime add table public.attendance;
    end if;
  end if;
end $$;

-- 5. Bắt PostgREST reload schema cache ngay (quan trọng!)
notify pgrst, 'reload schema';

-- Xong. Kiểm tra:
-- select * from public.attendance limit 1;
