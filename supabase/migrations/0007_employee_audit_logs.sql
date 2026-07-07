-- Nhật ký thao tác nhân viên (ERP audit trail).
create table if not exists public.employee_audit_logs (
  id text primary key,
  employee_id text references public.employees(id) on delete set null,
  employee_name text not null default '',
  action text not null default '',
  details text not null default '',
  meta jsonb not null default '{}'::jsonb,
  actor_name text not null default '',
  actor_role text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists employee_audit_logs_employee_id_idx
  on public.employee_audit_logs (employee_id);

create index if not exists employee_audit_logs_created_at_idx
  on public.employee_audit_logs (created_at desc);

alter table public.employee_audit_logs enable row level security;

create policy if not exists allow_all_anon_employee_audit_logs
  on public.employee_audit_logs
  for all
  to anon
  using (true)
  with check (true);
