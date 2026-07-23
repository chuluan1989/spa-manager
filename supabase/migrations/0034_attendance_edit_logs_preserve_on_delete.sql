-- Giữ log chỉnh sửa chấm công khi bản ghi attendance bị gỡ (audit Admin).
-- Chạy sau 0033_salary_advance_integration.sql

alter table public.attendance_edit_logs
  drop constraint if exists attendance_edit_logs_attendance_id_fkey;

alter table public.attendance_edit_logs
  alter column attendance_id drop not null;

alter table public.attendance_edit_logs
  add constraint attendance_edit_logs_attendance_id_fkey
  foreign key (attendance_id) references public.attendance(id) on delete set null;
