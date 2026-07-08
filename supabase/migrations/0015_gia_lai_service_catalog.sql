-- Bảng giá Gia Lai (CN3/CN8): catalog phân cấp theo chi nhánh
alter table public.branch_pricing
  add column if not exists catalog jsonb,
  add column if not exists catalog_version integer not null default 0;

comment on column public.branch_pricing.catalog is
  'Cấu trúc nhóm dịch vụ theo chi nhánh (Gia Lai: COMBO / MASSAGE BODY / GỘI / KHÁC)';

comment on column public.branch_pricing.catalog_version is
  'Phiên bản catalog — tăng khi cập nhật bảng giá Gia Lai';
