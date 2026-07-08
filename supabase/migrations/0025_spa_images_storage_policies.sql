-- Storage policies cho bucket spa-images
-- Chạy trên Supabase SQL Editor nếu upload báo "Không có quyền upload ảnh"
--
-- Lưu ý: App Spa Manager upload bằng anon key (không Supabase Auth session).
-- Migration này tạo policy cho authenticated (theo chuẩn) VÀ anon (để app upload được).

-- Đảm bảo bucket tồn tại
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spa-images',
  'spa-images',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Quyền schema storage
grant usage on schema storage to anon, authenticated, public;
grant select on storage.buckets to anon, authenticated, public;
grant all on storage.objects to anon, authenticated;

alter table storage.objects enable row level security;

-- Xóa policy cũ (0011 + lần chạy trước)
drop policy if exists "Public read spa-images" on storage.objects;
drop policy if exists "Anon insert spa-images" on storage.objects;
drop policy if exists "Anon update spa-images" on storage.objects;
drop policy if exists "Anon delete spa-images" on storage.objects;
drop policy if exists "Anon select spa-images" on storage.objects;
drop policy if exists "Authenticated select spa-images" on storage.objects;
drop policy if exists "Authenticated insert spa-images" on storage.objects;
drop policy if exists "Authenticated update spa-images" on storage.objects;
drop policy if exists "Authenticated delete spa-images" on storage.objects;

-- SELECT: public đọc ảnh public URL
create policy "Public read spa-images"
on storage.objects for select
to public
using (bucket_id = 'spa-images');

-- authenticated: SELECT / INSERT / UPDATE / DELETE
create policy "Authenticated select spa-images"
on storage.objects for select
to authenticated
using (bucket_id = 'spa-images');

create policy "Authenticated insert spa-images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'spa-images');

create policy "Authenticated update spa-images"
on storage.objects for update
to authenticated
using (bucket_id = 'spa-images')
with check (bucket_id = 'spa-images');

create policy "Authenticated delete spa-images"
on storage.objects for delete
to authenticated
using (bucket_id = 'spa-images');

-- anon: app upload bằng VITE_SUPABASE_ANON_KEY (không đổi frontend)
create policy "Anon insert spa-images"
on storage.objects for insert
to anon
with check (bucket_id = 'spa-images');

create policy "Anon update spa-images"
on storage.objects for update
to anon
using (bucket_id = 'spa-images')
with check (bucket_id = 'spa-images');

create policy "Anon delete spa-images"
on storage.objects for delete
to anon
using (bucket_id = 'spa-images');

create policy "Anon select spa-images"
on storage.objects for select
to anon
using (bucket_id = 'spa-images');
