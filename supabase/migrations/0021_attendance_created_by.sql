-- created_by: người tạo bản ghi chấm công (nhân viên tự chấm hoặc admin/QL)

alter table public.employee_attendance
  add column if not exists created_by text not null default '';

update public.employee_attendance
set created_by = submitted_by
where created_by = '' and submitted_by <> '';

comment on column public.employee_attendance.date is 'attendance_date — ngày chấm công (YYYY-MM-DD)';
comment on column public.employee_attendance.submitted_at is 'created_at — thời điểm tạo bản ghi';
comment on column public.employee_attendance.created_by is 'created_by — tên/người tạo bản ghi';
