-- Bổ sung trường ERP cho module Chi phí (giữ tương thích dữ liệu cũ)
alter table public.expenses
  add column if not exists expense_time text default '',
  add column if not exists paid_by text default '',
  add column if not exists receipt_image text default '',
  add column if not exists entered_by_id text default '';

create index if not exists idx_expenses_expense_type on public.expenses(expense_type);
