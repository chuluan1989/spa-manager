alter table public.invoices
  add column if not exists customer_requested boolean not null default false;
