-- ============================================================
-- CHẠY TRÊN SUPABASE SQL EDITOR (Production)
-- Fix: "Bảng chấm công chưa có trên Supabase"
--
-- Cách làm:
-- 1. supabase.com/dashboard → chọn đúng project của khoespa.net.vn
-- 2. SQL Editor → New query
-- 3. Dán TOÀN BỘ file này → Run
-- 4. Đợi 30 giây → Ctrl+F5 trên app → thử chấm công lại
-- ============================================================

-- 1. Bảng chấm công (không dùng FK để tránh lỗi khi tạo lần đầu)
create table if not exists public.attendance (
  id text primary key,
  employee_id text not null,
  branch_id text,
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

-- 2. RPC ngày server
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

-- 3. Quyền + RLS (anon + authenticated)
grant usage on schema public to anon, authenticated;
grant all on public.attendance to anon, authenticated;

alter table public.attendance enable row level security;

drop policy if exists allow_all_anon_attendance on public.attendance;
create policy allow_all_anon_attendance on public.attendance
  for all to anon, authenticated using (true) with check (true);

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

-- 5. Reload schema cache PostgREST
notify pgrst, 'reload schema';

-- 6. Kiểm tra — phải trả về 1 dòng "OK"
select 'OK — bảng attendance đã sẵn sàng' as result;
