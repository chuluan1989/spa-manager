-- Chính sách hoa hồng theo chi nhánh (nguồn cấu hình chính thức)

create table if not exists public.branch_commission_policies (
  branch_id text primary key references public.branches(id) on delete cascade,
  policy_type text not null default 'flat',
  flat_rate double precision,
  default_rate double precision not null default 20,
  groups jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_branch_commission_policies_type
  on public.branch_commission_policies(policy_type);

alter table public.branch_commission_policies enable row level security;

create policy "branch_commission_policies_select"
  on public.branch_commission_policies for select using (true);

create policy "branch_commission_policies_insert"
  on public.branch_commission_policies for insert with check (true);

create policy "branch_commission_policies_update"
  on public.branch_commission_policies for update using (true);

create policy "branch_commission_policies_delete"
  on public.branch_commission_policies for delete using (true);

do $$
declare
  t text;
begin
  for t in select unnest(array['branch_commission_policies'])
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;
