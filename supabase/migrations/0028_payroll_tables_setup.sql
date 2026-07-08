-- Module Lương — đảm bảo bảng payroll_adjustments tồn tại (idempotent)
-- Schema khớp code: payrollRepository.js, payrollService.js, payrollEngine.js

create table if not exists public.payroll_adjustments (
  id text primary key,
  date text not null,
  month text not null,
  branch_id text,
  employee_id text not null,
  employee_name text not null default '',
  type text not null,
  amount integer not null default 0,
  reason text not null default '',
  note text not null default '',
  created_by text not null default '',
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payroll_adjustments_month_idx on public.payroll_adjustments (month);
create index if not exists payroll_adjustments_employee_month_idx on public.payroll_adjustments (employee_id, month);
create index if not exists payroll_adjustments_branch_month_idx on public.payroll_adjustments (branch_id, month);

create table if not exists public.payroll_locks (
  id text primary key,
  month text not null,
  branch_id text not null default '',
  is_locked boolean not null default true,
  locked_at timestamptz not null default now(),
  locked_by text not null default '',
  locked_by_name text not null default '',
  unlocked_at timestamptz,
  unlocked_by text not null default '',
  unlocked_by_name text not null default '',
  note text not null default ''
);

create unique index if not exists payroll_locks_month_branch_uidx
  on public.payroll_locks (month, branch_id);

create table if not exists public.payroll_audit_logs (
  id text primary key,
  entity_type text not null default '',
  entity_id text not null default '',
  action text not null default '',
  editor_id text not null default '',
  editor_name text not null default '',
  old_value jsonb not null default '{}'::jsonb,
  new_value jsonb not null default '{}'::jsonb,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists payroll_audit_logs_entity_idx on public.payroll_audit_logs (entity_type, entity_id);
create index if not exists payroll_audit_logs_created_idx on public.payroll_audit_logs (created_at desc);

grant usage on schema public to anon, authenticated;
grant all on public.payroll_adjustments to anon, authenticated;
grant all on public.payroll_locks to anon, authenticated;
grant all on public.payroll_audit_logs to anon, authenticated;

alter table public.payroll_adjustments enable row level security;
alter table public.payroll_locks enable row level security;
alter table public.payroll_audit_logs enable row level security;

drop policy if exists allow_all_anon_payroll_adjustments on public.payroll_adjustments;
create policy allow_all_anon_payroll_adjustments on public.payroll_adjustments
  for all to anon, authenticated using (true) with check (true);

drop policy if exists allow_all_anon_payroll_locks on public.payroll_locks;
create policy allow_all_anon_payroll_locks on public.payroll_locks
  for all to anon, authenticated using (true) with check (true);

drop policy if exists allow_all_anon_payroll_audit_logs on public.payroll_audit_logs;
create policy allow_all_anon_payroll_audit_logs on public.payroll_audit_logs
  for all to anon, authenticated using (true) with check (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'payroll_adjustments'
    ) then
      alter publication supabase_realtime add table public.payroll_adjustments;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'payroll_locks'
    ) then
      alter publication supabase_realtime add table public.payroll_locks;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
