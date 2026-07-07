-- Người nhập hóa đơn (tên user tại thời điểm tạo)
alter table public.invoices
  add column if not exists entered_by text default '';
