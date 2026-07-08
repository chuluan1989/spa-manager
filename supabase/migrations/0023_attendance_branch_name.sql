-- branch_name trên bản ghi chấm công (denormalized cho báo cáo/xuất file)

alter table public.employee_attendance
  add column if not exists branch_name text not null default '';

update public.employee_attendance ea
set branch_name = coalesce(b.name, '')
from public.branches b
where ea.branch_id = b.id and ea.branch_name = '';

comment on column public.employee_attendance.branch_name is 'Tên chi nhánh tại thời điểm chấm công';
