-- B1 KPI: versioned branch policies. Idempotent.
-- KHÔNG sửa invoices / payroll / commission.
-- KHÔNG APPLY Production trong B1 trừ khi được duyệt riêng.

create extension if not exists btree_gist;

create table if not exists public.kpi_branch_policies (
  id text primary key,
  branch_id text not null references public.branches(id),
  effective_from date not null,
  effective_to date,
  addon_target numeric not null,
  advanced_target numeric not null,
  combo_target numeric not null,
  requested_target numeric not null,
  status text not null default 'active'
    check (status in ('active', 'superseded')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  change_reason text not null default '',
  check (addon_target >= 0 and addon_target <= 1),
  check (advanced_target >= 0 and advanced_target <= 1),
  check (combo_target >= 0 and combo_target <= 1),
  check (requested_target >= 0 and requested_target <= 1),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists kpi_branch_policies_branch_from_idx
  on public.kpi_branch_policies (branch_id, effective_from);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kpi_branch_policies_no_overlap'
  ) then
    alter table public.kpi_branch_policies
      add constraint kpi_branch_policies_no_overlap
      exclude using gist (
        branch_id with =,
        daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
      );
  end if;
end $$;

create table if not exists public.kpi_policy_change_logs (
  id text primary key,
  branch_id text not null,
  old_policy jsonb,
  new_policy jsonb not null default '{}'::jsonb,
  effective_from date,
  effective_to date,
  actor_id text not null default '',
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists kpi_policy_change_logs_branch_idx
  on public.kpi_policy_change_logs (branch_id, created_at desc);

alter table public.kpi_branch_policies enable row level security;
alter table public.kpi_policy_change_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'kpi_branch_policies_select') then
    create policy kpi_branch_policies_select on public.kpi_branch_policies for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'kpi_branch_policies_insert') then
    create policy kpi_branch_policies_insert on public.kpi_branch_policies for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'kpi_branch_policies_update') then
    create policy kpi_branch_policies_update on public.kpi_branch_policies for update using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'kpi_policy_change_logs_select') then
    create policy kpi_policy_change_logs_select on public.kpi_policy_change_logs for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'kpi_policy_change_logs_insert') then
    create policy kpi_policy_change_logs_insert on public.kpi_policy_change_logs for insert with check (true);
  end if;
end $$;
