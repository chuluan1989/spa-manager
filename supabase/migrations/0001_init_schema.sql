-- Spa Manager — Supabase schema khởi tạo (chạy 1 lần)
-- Cách chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file này → Run.
--
-- GHI CHÚ BẢO MẬT / KIẾN TRÚC ĐĂNG NHẬP
-- Ứng dụng hiện đăng nhập bằng "mật khẩu chi nhánh" / "mật khẩu Admin" tự
-- đặt (không phải email/mật khẩu qua Supabase Auth), toàn bộ phân quyền
-- (Admin / Quản lý chi nhánh / Nhân viên) đang được kiểm tra ở phía trình
-- duyệt (client-side), giống hệt cơ chế hiện tại đang chạy bằng
-- LocalStorage. Vì vậy bảng "app_credentials" đóng vai trò bảng
-- Authentication tối giản, lưu mật khẩu đã hash (không lưu plaintext).
-- Do dùng anon key ở client, RLS bên dưới tạm thời cho phép vai trò anon
-- đọc/ghi mọi bảng — ĐÚNG BẰNG mức bảo mật hiện có (không làm yếu đi so
-- với trước, vì trước đây dữ liệu vốn chỉ nằm trong trình duyệt của từng
-- máy, không có bất kỳ lớp xác thực server nào). Khi nâng cấp sang
-- Supabase Auth thật (email/OTP…), hãy thay các policy "allow_all_anon"
-- bằng điều kiện dựa trên auth.uid() để khoá chặt hơn.

create extension if not exists "pgcrypto";

-- ===================== BRANCHES (chi nhánh) =====================
create table if not exists public.branches (
  id text primary key,
  name text not null default '',
  status text not null default 'active',
  price_group_id text not null default 'standard',
  support_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ===================== EMPLOYEES (nhân viên / hồ sơ cá nhân) =====================
create table if not exists public.employees (
  id text primary key,
  branch_id text references public.branches(id) on delete set null,
  name text default '',
  date_of_birth text default '',
  gender text default '',
  phone text default '',
  email text default '',
  cccd text default '',
  cccd_issue_date text default '',
  cccd_issue_place text default '',
  cccd_address text default '',
  current_address text default '',
  bank_name text default '',
  bank_account_holder text default '',
  bank_account text default '',
  emergency_contact_name text default '',
  emergency_contact_phone text default '',
  position text default '',
  start_date text default '',
  status text not null default 'active',
  note text default '',
  avatar text default '',
  cccd_front_image text default '',
  cccd_back_image text default '',
  -- Ảnh lưu dạng base64 (giống LocalStorage hiện tại) để không phải đổi
  -- luồng upload/hiển thị. Có thể chuyển sang Supabase Storage sau này.
  branch_history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ===================== SERVICES (dịch vụ + bảng giá theo nhóm) =====================
create table if not exists public.services (
  id text primary key,
  name text not null default '',
  status text not null default 'active',
  price_lists jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ===================== BRANCH PRICING (bảng giá riêng theo chi nhánh) =====================
create table if not exists public.branch_pricing (
  branch_id text primary key references public.branches(id) on delete cascade,
  use_custom boolean not null default false,
  overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ===================== INVOICES (hóa đơn / tour) =====================
create table if not exists public.invoices (
  id text primary key,
  date text not null default '',
  branch_id text references public.branches(id) on delete set null,
  branch_name text default '',
  employee_id text default '',
  employee_name text default '',
  support_employee_id text default '',
  support_employee_name text default '',
  customer_name text default '',
  service_ids jsonb not null default '[]'::jsonb,
  services jsonb not null default '[]'::jsonb,
  -- Dùng double precision (không phải numeric) để supabase-js trả về
  -- number JS trực tiếp, khớp với kiểu dữ liệu hiện có trong LocalStorage.
  tips double precision not null default 0,
  payment_method text default '',
  note text default '',
  service_total double precision not null default 0,
  total double precision not null default 0,
  commission double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- ===================== EXPENSES (chi phí) =====================
create table if not exists public.expenses (
  id text primary key,
  date text not null default '',
  branch_id text references public.branches(id) on delete set null,
  branch_name text default '',
  expense_type text default '',
  expense_type_label text default '',
  content text default '',
  amount double precision not null default 0,
  entered_by text default '',
  note text default '',
  updated_at timestamptz not null default now()
);

-- ===================== AUTHENTICATION (mật khẩu Admin / Quản lý chi nhánh) ============
create table if not exists public.app_credentials (
  id text primary key default 'singleton',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ===================== PERMISSIONS (ma trận phân quyền theo vai trò) =====================
create table if not exists public.app_permissions (
  id text primary key default 'singleton',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ===================== SETTINGS (cấu hình hệ thống chung) =====================
create table if not exists public.app_settings (
  id text primary key default 'singleton',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ===================== INDEXES =====================
create index if not exists idx_employees_branch_id on public.employees(branch_id);
create index if not exists idx_invoices_branch_id on public.invoices(branch_id);
create index if not exists idx_invoices_employee_id on public.invoices(employee_id);
create index if not exists idx_invoices_date on public.invoices(date);
create index if not exists idx_expenses_branch_id on public.expenses(branch_id);
create index if not exists idx_expenses_date on public.expenses(date);

-- ===================== ROW LEVEL SECURITY =====================
alter table public.branches enable row level security;
alter table public.employees enable row level security;
alter table public.services enable row level security;
alter table public.branch_pricing enable row level security;
alter table public.invoices enable row level security;
alter table public.expenses enable row level security;
alter table public.app_credentials enable row level security;
alter table public.app_permissions enable row level security;
alter table public.app_settings enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'branches', 'employees', 'services', 'branch_pricing',
    'invoices', 'expenses', 'app_credentials', 'app_permissions', 'app_settings'
  ])
  loop
    execute format('drop policy if exists "allow_all_anon" on public.%I;', t);
    execute format(
      'create policy "allow_all_anon" on public.%I for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- Xong. Sau khi chạy file này, quay lại app và dán Project URL + Anon Key
-- vào biến môi trường VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
