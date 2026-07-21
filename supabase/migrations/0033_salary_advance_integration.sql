-- Salary advance ↔ expense ↔ payroll link fields

alter table public.expenses
  add column if not exists employee_id text default '',
  add column if not exists payroll_adjustment_id text default '',
  add column if not exists payroll_month text default '',
  add column if not exists payroll_cycle text default '';

alter table public.payroll_adjustments
  add column if not exists expense_id text default '',
  add column if not exists payroll_cycle text default '';

create index if not exists expenses_salary_advance_idx
  on public.expenses (expense_type, employee_id)
  where expense_type = 'ung-luong';

create index if not exists payroll_adjustments_expense_id_idx
  on public.payroll_adjustments (expense_id)
  where expense_id <> '';

notify pgrst, 'reload schema';
