-- Giảm giá / khuyến mãi trên hóa đơn
alter table public.invoices
  add column if not exists discount_input text default '',
  add column if not exists discount_type text default '',
  add column if not exists discount_value double precision default 0,
  add column if not exists discount_amount double precision default 0,
  add column if not exists original_service_total double precision default 0;
