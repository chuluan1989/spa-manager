-- Phân quyền theo chi nhánh và metadata tài khoản (singleton jsonb, tương thích pattern hiện tại)

create table if not exists public.branch_role_permissions (
  id text primary key default 'singleton',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.account_metadata (
  id text primary key default 'singleton',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.branch_role_permissions enable row level security;
alter table public.account_metadata enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['branch_role_permissions', 'account_metadata'])
  loop
    execute format('drop policy if exists "allow_all_anon" on public.%I;', t);
    execute format(
      'create policy "allow_all_anon" on public.%I for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;
