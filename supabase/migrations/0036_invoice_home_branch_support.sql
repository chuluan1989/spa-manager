/**
 * Hóa đơn hỗ trợ liên chi nhánh — lưu chi nhánh gốc NV.
 * Cột optional: strip nếu Production chưa chạy migration.
 */
alter table public.invoices
  add column if not exists home_branch_id text,
  add column if not exists home_branch_name text,
  add column if not exists updated_by text;

comment on column public.invoices.home_branch_id is
  'Chi nhánh gốc của nhân viên thực hiện tại thời điểm tạo HĐ (hỗ trợ liên CN).';
comment on column public.invoices.home_branch_name is
  'Tên chi nhánh gốc của nhân viên thực hiện.';
comment on column public.invoices.updated_by is
  'Người sửa hóa đơn gần nhất.';
