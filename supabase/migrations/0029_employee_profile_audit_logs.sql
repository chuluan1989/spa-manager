-- Nhật ký thay đổi hồ sơ nhân viên theo field (partial update audit).
create table if not exists public.employee_profile_audit_logs (
  id text primary key,
  employee_id text references public.employees(id) on delete set null,
  changed_by text not null default '',
  changed_by_role text not null default '',
  changed_fields jsonb not null default '[]'::jsonb,
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  changed_at timestamptz not null default now(),
  source_device text not null default ''
);

create index if not exists employee_profile_audit_logs_employee_id_idx
  on public.employee_profile_audit_logs (employee_id);

create index if not exists employee_profile_audit_logs_changed_at_idx
  on public.employee_profile_audit_logs (changed_at desc);

alter table public.employee_profile_audit_logs enable row level security;

drop policy if exists allow_all_anon_employee_profile_audit_logs on public.employee_profile_audit_logs;
create policy allow_all_anon_employee_profile_audit_logs
  on public.employee_profile_audit_logs
  for all
  to anon
  using (true)
  with check (true);
