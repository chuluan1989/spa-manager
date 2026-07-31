-- Batch 4.1 — Inventory read-only: full_day_unpermitted / nghi auto-absent
-- Chỉ SELECT. Không UPDATE / DELETE / INSERT / function ghi dữ liệu.
--
-- Lưu ý: reason ILIKE '%Hệ thống tự ghi nhận%' và created_by/submitted_by = 'system'
-- chỉ là dấu hiệu suy đoán nguồn. Không khẳng định chắc chắn nếu thiếu trường nguồn tin cậy.

-- 1) Tổng full_day_unpermitted
select count(*)::bigint as total_full_day_unpermitted
from public.attendance
where status = 'full_day_unpermitted';

-- 2) Phân loại nguồn (suy đoán)
select
  count(*) filter (
    where lower(coalesce(created_by, submitted_by, '')) = 'system'
       or coalesce(reason, '') ilike '%Hệ thống tự ghi nhận%'
  )::bigint as suspected_system_auto,
  count(*) filter (
    where lower(coalesce(created_by, submitted_by, '')) <> 'system'
      and coalesce(reason, '') not ilike '%Hệ thống tự ghi nhận%'
      and nullif(trim(coalesce(created_by, submitted_by, '')), '') is not null
  )::bigint as suspected_manual_or_named_actor,
  count(*) filter (
    where lower(coalesce(created_by, submitted_by, '')) <> 'system'
      and coalesce(reason, '') not ilike '%Hệ thống tự ghi nhận%'
      and nullif(trim(coalesce(created_by, submitted_by, '')), '') is null
  )::bigint as unknown_source
from public.attendance
where status = 'full_day_unpermitted';

-- 3) Theo chi nhánh (toàn bộ full_day_unpermitted)
select
  coalesce(branch_id, '(blank)') as branch_id,
  count(*)::bigint as total,
  count(*) filter (
    where lower(coalesce(created_by, submitted_by, '')) = 'system'
       or coalesce(reason, '') ilike '%Hệ thống tự ghi nhận%'
  )::bigint as suspected_system_auto
from public.attendance
where status = 'full_day_unpermitted'
group by 1
order by total desc;

-- 4) Theo tháng (attendance_date)
select
  left(attendance_date, 7) as month,
  count(*)::bigint as total,
  count(*) filter (
    where lower(coalesce(created_by, submitted_by, '')) = 'system'
       or coalesce(reason, '') ilike '%Hệ thống tự ghi nhận%'
  )::bigint as suspected_system_auto
from public.attendance
where status = 'full_day_unpermitted'
group by 1
order by 1;

-- 5) Danh sách chi tiết nghi do hệ thống tự tạo
select
  id,
  attendance_date,
  employee_id,
  branch_id,
  status,
  created_by,
  submitted_by,
  reason,
  updated_at
from public.attendance
where status = 'full_day_unpermitted'
  and (
    lower(coalesce(created_by, submitted_by, '')) = 'system'
    or coalesce(reason, '') ilike '%Hệ thống tự ghi nhận%'
  )
order by attendance_date, employee_id;

-- 6) Record không đủ thông tin để xác định nguồn
select
  id,
  attendance_date,
  employee_id,
  branch_id,
  created_by,
  submitted_by,
  reason,
  updated_at
from public.attendance
where status = 'full_day_unpermitted'
  and lower(coalesce(created_by, submitted_by, '')) <> 'system'
  and coalesce(reason, '') not ilike '%Hệ thống tự ghi nhận%'
  and nullif(trim(coalesce(created_by, submitted_by, '')), '') is null
order by attendance_date, employee_id;
