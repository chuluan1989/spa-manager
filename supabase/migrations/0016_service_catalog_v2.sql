-- Chuẩn hóa danh mục dịch vụ: nhóm → dịch vụ → thời lượng → giá theo chi nhánh

create table if not exists public.service_categories (
  id text primary key,
  name text not null default '',
  sort_order integer not null default 0,
  status text not null default 'active',
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_services (
  id text primary key,
  category_id text not null references public.service_categories(id) on delete cascade,
  name text not null default '',
  sort_order integer not null default 0,
  status text not null default 'active',
  updated_at timestamptz not null default now()
);

create table if not exists public.service_durations (
  id text primary key,
  service_id text not null references public.catalog_services(id) on delete cascade,
  duration_minutes integer,
  sort_order integer not null default 0,
  status text not null default 'active',
  updated_at timestamptz not null default now()
);

create table if not exists public.branch_service_prices (
  branch_id text not null references public.branches(id) on delete cascade,
  duration_id text not null references public.service_durations(id) on delete cascade,
  price double precision not null default 0,
  commission_percent double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (branch_id, duration_id)
);

create index if not exists idx_catalog_services_category on public.catalog_services(category_id);
create index if not exists idx_service_durations_service on public.service_durations(service_id);
create index if not exists idx_branch_service_prices_branch on public.branch_service_prices(branch_id);

alter table public.service_categories enable row level security;
alter table public.catalog_services enable row level security;
alter table public.service_durations enable row level security;
alter table public.branch_service_prices enable row level security;

drop policy if exists allow_all_anon_service_categories on public.service_categories;
create policy allow_all_anon_service_categories on public.service_categories
  for all to anon using (true) with check (true);

drop policy if exists allow_all_anon_catalog_services on public.catalog_services;
create policy allow_all_anon_catalog_services on public.catalog_services
  for all to anon using (true) with check (true);

drop policy if exists allow_all_anon_service_durations on public.service_durations;
create policy allow_all_anon_service_durations on public.service_durations
  for all to anon using (true) with check (true);

drop policy if exists allow_all_anon_branch_service_prices on public.branch_service_prices;
create policy allow_all_anon_branch_service_prices on public.branch_service_prices
  for all to anon using (true) with check (true);

alter publication supabase_realtime add table public.service_categories;
alter publication supabase_realtime add table public.catalog_services;
alter publication supabase_realtime add table public.service_durations;
alter publication supabase_realtime add table public.branch_service_prices;
