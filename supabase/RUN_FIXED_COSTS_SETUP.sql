-- ============================================================
-- CHẠY TRÊN SUPABASE SQL EDITOR (Production)
-- Chi phí cố định + nhóm chi phí phát sinh + nhật ký thay đổi
-- An toàn: idempotent — CREATE IF NOT EXISTS / ON CONFLICT DO NOTHING
-- ============================================================

create table if not exists public.branch_fixed_costs (
  id text primary key,
  branch_id text not null references public.branches(id) on delete cascade,
  expense_type text not null default 'mat-bang',
  expense_type_label text not null default 'Mặt bằng',
  amount double precision not null default 0,
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  unique (branch_id, expense_type)
);

create index if not exists branch_fixed_costs_branch_id_idx
  on public.branch_fixed_costs (branch_id);

alter table public.branch_fixed_costs enable row level security;

drop policy if exists allow_all_anon_branch_fixed_costs on public.branch_fixed_costs;
create policy allow_all_anon_branch_fixed_costs
  on public.branch_fixed_costs
  for all
  to anon
  using (true)
  with check (true);

insert into public.branch_fixed_costs (id, branch_id, expense_type, expense_type_label, amount, updated_by)
values
  ('fc-soc-trang-mat-bang', 'soc-trang', 'mat-bang', 'Mặt bằng', 10000000, 'system'),
  ('fc-vinh-long-mat-bang', 'vinh-long', 'mat-bang', 'Mặt bằng', 20000000, 'system'),
  ('fc-song-khoe-spa-mat-bang', 'song-khoe-spa', 'mat-bang', 'Mặt bằng', 15000000, 'system'),
  ('fc-bac-lieu-mat-bang', 'bac-lieu', 'mat-bang', 'Mặt bằng', 15000000, 'system'),
  ('fc-tra-vinh-mat-bang', 'tra-vinh', 'mat-bang', 'Mặt bằng', 13000000, 'system'),
  ('fc-tram-spa-mat-bang', 'tram-spa', 'mat-bang', 'Mặt bằng', 10000000, 'system')
on conflict (branch_id, expense_type) do nothing;

create table if not exists public.expense_categories (
  id text primary key,
  label text not null,
  sort_order int not null default 0,
  is_system boolean not null default false,
  is_fixed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expense_categories enable row level security;

drop policy if exists allow_all_anon_expense_categories on public.expense_categories;
create policy allow_all_anon_expense_categories
  on public.expense_categories
  for all
  to anon
  using (true)
  with check (true);

insert into public.expense_categories (id, label, sort_order, is_system, is_fixed)
values
  ('mat-bang', 'Mặt bằng', 1, true, true),
  ('quang-cao-facebook', 'Quảng cáo Facebook', 10, true, false),
  ('quang-cao-tiktok', 'Quảng cáo TikTok', 11, true, false),
  ('dien', 'Điện', 20, true, false),
  ('nuoc', 'Nước', 21, true, false),
  ('wifi', 'Wifi', 22, true, false),
  ('shopee', 'Shopee', 30, true, false),
  ('sua-chua', 'Sửa chữa', 40, true, false),
  ('khac', 'Chi phí khác', 99, true, false)
on conflict (id) do nothing;

create table if not exists public.expense_change_logs (
  id text primary key,
  entity_type text not null,
  entity_id text not null default '',
  branch_id text not null default '',
  action text not null default 'update',
  changed_by text not null default '',
  changed_by_role text not null default '',
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  changed_at timestamptz not null default now()
);

create index if not exists expense_change_logs_entity_idx
  on public.expense_change_logs (entity_type, entity_id);

create index if not exists expense_change_logs_changed_at_idx
  on public.expense_change_logs (changed_at desc);

create index if not exists expense_change_logs_branch_id_idx
  on public.expense_change_logs (branch_id);

alter table public.expense_change_logs enable row level security;

drop policy if exists allow_all_anon_expense_change_logs on public.expense_change_logs;
create policy allow_all_anon_expense_change_logs
  on public.expense_change_logs
  for all
  to anon
  using (true)
  with check (true);

do $$
begin
  alter publication supabase_realtime add table public.branch_fixed_costs;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.expense_categories;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
