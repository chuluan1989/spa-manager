-- ============================================================
-- KHÔI PHỤC Storage Policy spa-images về trạng thái hôm qua
-- (commit 57d0953 / migration 0011 — lúc Avatar/CCCD upload được)
--
-- Bối cảnh:
--   - App upload bằng role anon (getSession/getUser = null)
--   - Bucket spa-images ĐÃ TỒN TẠI
--   - SELECT/public URL vẫn OK; chỉ INSERT bị 403
--
-- KHÔNG tạo bucket mới.
-- KHÔNG xóa bucket.
-- KHÔNG đụng bảng/module khác.
--
-- Apply: Supabase Dashboard → SQL Editor → Run toàn bộ file này.
-- ============================================================

-- Chỉ chạy khi bucket đã có (không insert bucket)
do $$
begin
  if not exists (
    select 1 from storage.buckets where id = 'spa-images'
  ) then
    raise exception 'Bucket spa-images không tồn tại — dừng, không tạo bucket mới.';
  end if;
end $$;

alter table storage.objects enable row level security;

-- Public SELECT (ảnh cũ / public URL) — giống 0011
drop policy if exists "Public read spa-images" on storage.objects;
create policy "Public read spa-images"
on storage.objects for select
to public
using (bucket_id = 'spa-images');

-- Anon INSERT — bắt buộc để hết 403 (đúng như hôm qua)
drop policy if exists "Anon insert spa-images" on storage.objects;
create policy "Anon insert spa-images"
on storage.objects for insert
to anon
with check (bucket_id = 'spa-images');

-- Anon UPDATE — giống 0011
drop policy if exists "Anon update spa-images" on storage.objects;
create policy "Anon update spa-images"
on storage.objects for update
to anon
using (bucket_id = 'spa-images')
with check (bucket_id = 'spa-images');

-- Anon DELETE — giống 0011
drop policy if exists "Anon delete spa-images" on storage.objects;
create policy "Anon delete spa-images"
on storage.objects for delete
to anon
using (bucket_id = 'spa-images');

-- Xác nhận sau migrate
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname in (
    'Public read spa-images',
    'Anon insert spa-images',
    'Anon update spa-images',
    'Anon delete spa-images'
  )
order by policyname;
