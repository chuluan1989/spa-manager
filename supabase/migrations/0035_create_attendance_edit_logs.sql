-- Audit log chỉnh sửa chấm công — bảng chuẩn cho public.attendance
-- Chạy sau 0033_salary_advance_integration.sql
--
-- Production hiện trạng (2026-07-23):
--   • public.attendance — đã có (migration 0024 chạy thủ công)
--   • public.attendance_edit_logs — CHƯA có (0013 chưa chạy / chỉ chạy 0024)
--   • public.employee_attendance — không tồn tại
--
-- KHÔNG chạy 0034 trên Production nếu bảng chưa tồn tại (0034 chỉ ALTER FK).
-- File này thay thế việc cần chạy 0013 + 0034 trên môi trường chỉ có bảng attendance.
--
-- Cột khớp src/repositories/attendanceRepository.js → insertAttendanceEditLogs():
--   id, attendance_id, editor_id, editor_name, edited_at,
--   field_name, old_value, new_value, note

create table if not exists public.attendance_edit_logs (
  id text primary key,
  attendance_id text references public.attendance(id) on delete set null,
  editor_id text not null default '',
  editor_name text not null default '',
  edited_at timestamptz not null default now(),
  field_name text not null default '',
  old_value text not null default '',
  new_value text not null default '',
  note text not null default ''
);

create index if not exists attendance_edit_logs_attendance_idx
  on public.attendance_edit_logs (attendance_id);

create index if not exists attendance_edit_logs_edited_at_idx
  on public.attendance_edit_logs (edited_at desc);

alter table public.attendance_edit_logs enable row level security;

drop policy if exists allow_all_anon_attendance_edit_logs on public.attendance_edit_logs;
create policy allow_all_anon_attendance_edit_logs on public.attendance_edit_logs
  for all to anon using (true) with check (true);

-- Nếu bảng đã tồn tại từ 0013 (FK → employee_attendance, ON DELETE CASCADE, NOT NULL),
-- chuyển sang FK → public.attendance ON DELETE SET NULL (tương đương 0034).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'attendance_edit_logs'
  ) then
    alter table public.attendance_edit_logs
      drop constraint if exists attendance_edit_logs_attendance_id_fkey;

    alter table public.attendance_edit_logs
      alter column attendance_id drop not null;

    alter table public.attendance_edit_logs
      add constraint attendance_edit_logs_attendance_id_fkey
      foreign key (attendance_id) references public.attendance(id) on delete set null;
  end if;
end $$;

comment on table public.attendance_edit_logs is
  'Nhật ký chỉnh sửa chấm công — 1 dòng / thay đổi field (field_name, old_value, new_value, note)';
