-- Catalog dịch vụ riêng theo từng chi nhánh

create table if not exists public.branch_catalogs (
  branch_id text primary key references public.branches(id) on delete cascade,
  catalog jsonb not null default '{"version":1,"categories":[],"services":[],"durations":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_branch_catalogs_updated on public.branch_catalogs(updated_at);

alter table public.branch_catalogs enable row level security;

drop policy if exists allow_all_anon_branch_catalogs on public.branch_catalogs;
create policy allow_all_anon_branch_catalogs on public.branch_catalogs
  for all to anon using (true) with check (true);

do $$
declare
  t text;
begin
  for t in select unnest(array['branch_catalogs'])
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
