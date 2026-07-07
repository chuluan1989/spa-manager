-- Thêm trường giờ và SĐT khách cho hóa đơn (tùy chọn, tương thích ngược).
alter table public.invoices
  add column if not exists customer_phone text not null default '',
  add column if not exists invoice_time text not null default '';
