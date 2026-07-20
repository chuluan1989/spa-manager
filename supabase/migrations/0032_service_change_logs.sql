-- Nhật ký thay đổi giá / % hoa hồng dịch vụ theo chi nhánh (append-only).

create table if not exists public.service_change_logs (
  id text primary key,
  branch_id text not null references public.branches(id) on delete cascade,
  service_id text not null default '',
  duration_id text not null default '',
  action text not null default 'update',
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  changed_by text not null default '',
  changed_by_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists service_change_logs_branch_id_idx
  on public.service_change_logs (branch_id);

create index if not exists service_change_logs_service_id_idx
  on public.service_change_logs (service_id);

create index if not exists service_change_logs_duration_id_idx
  on public.service_change_logs (duration_id);

create index if not exists service_change_logs_branch_duration_created_idx
  on public.service_change_logs (branch_id, duration_id, created_at desc);

alter table public.service_change_logs enable row level security;

drop policy if exists allow_all_anon_service_change_logs on public.service_change_logs;
create policy allow_all_anon_service_change_logs
  on public.service_change_logs
  for all
  to anon
  using (true)
  with check (true);

-- Rollback (manual):
-- drop policy if exists allow_all_anon_service_change_logs on public.service_change_logs;
-- drop table if exists public.service_change_logs;
