-- Bổ sung cột giờ chi phí và trường ERP (idempotent — an toàn chạy lại).
-- Production có thể chưa chạy 0008; migration này đảm bảo schema đồng bộ với app.
alter table public.expenses
  add column if not exists expense_time text default '',
  add column if not exists paid_by text default '',
  add column if not exists receipt_image text default '',
  add column if not exists entered_by_id text default '';

create index if not exists idx_expenses_expense_type on public.expenses(expense_type);
