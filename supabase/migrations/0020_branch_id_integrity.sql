-- Đảm bảo branch_id là khóa duy nhất cho mapping dữ liệu (không dùng index/vị trí)
-- sort_order chỉ dùng hiển thị

create index if not exists idx_branches_sort_order on public.branches(sort_order);

comment on column public.branches.sort_order is 'Chỉ dùng sắp xếp hiển thị — không dùng mapping dữ liệu';
comment on column public.branches.id is 'branch_id — khóa duy nhất liên kết toàn hệ thống';

-- attendance: đảm bảo index branch_id
create index if not exists idx_employee_attendance_branch_id on public.employee_attendance(branch_id);

-- commission policies keyed by branch_id
create index if not exists idx_branch_commission_policies_branch_id on public.branch_commission_policies(branch_id);
