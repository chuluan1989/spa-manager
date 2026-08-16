-- 0047 — payroll_adjustments: phân biệt nguồn phạt (audit) — idempotent
-- SoT tính lương vẫn = attendance.penalty_amount + manual adjustments.
-- source/category chỉ phân loại & chặn nhập mirror attendance; KHÔNG tạo nguồn lương thứ 3.

alter table public.payroll_adjustments
  add column if not exists source text not null default 'manual';

alter table public.payroll_adjustments
  add column if not exists category text not null default 'other';

comment on column public.payroll_adjustments.source is
  'manual = Admin/QL nhập; attendance = reserved (không dùng để mirror SoT — phạt chấm công chỉ từ attendance.penalty_amount)';

comment on column public.payroll_adjustments.category is
  'Phân loại phạt tay: conduct|service|hygiene|operation|other. Không dùng attendance/leave/late/early.';

-- Legacy rows giữ source=manual, category=other (default).
-- Không backfill / không xóa dữ liệu.

create index if not exists payroll_adjustments_source_idx
  on public.payroll_adjustments (source);

create index if not exists payroll_adjustments_category_idx
  on public.payroll_adjustments (category);
