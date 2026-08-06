-- Expense soft-void + category hide + fixed-cost pause (idempotent).
-- Production: applied 2026-08-06; app uses expenses.status only (no [[VOID]] note fallback).

alter table public.expenses
  add column if not exists status text not null default 'active';

alter table public.expenses
  add column if not exists voided_at timestamptz;

alter table public.expenses
  add column if not exists voided_by text not null default '';

alter table public.expenses
  add column if not exists void_reason text not null default '';

create index if not exists expenses_status_idx on public.expenses (status);

alter table public.expense_categories
  add column if not exists is_hidden boolean not null default false;

alter table public.branch_fixed_costs
  add column if not exists status text not null default 'active';

alter table public.branch_fixed_costs
  add column if not exists start_date date;

comment on column public.expenses.status is 'active | void — void không tính vào tổng, vẫn xem lịch sử';
