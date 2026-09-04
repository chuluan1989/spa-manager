-- KPI 90 phút (MAIN 90 / MAIN). Nullable: policy Aug 2026 không có KPI này.
-- Không sửa invoices / payroll / commission.

alter table public.kpi_branch_policies
  add column if not exists duration90_target numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kpi_branch_policies_duration90_target_range'
  ) then
    alter table public.kpi_branch_policies
      add constraint kpi_branch_policies_duration90_target_range
      check (duration90_target is null or (duration90_target >= 0 and duration90_target <= 1));
  end if;
end $$;
