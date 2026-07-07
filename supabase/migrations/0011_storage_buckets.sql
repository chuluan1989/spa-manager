-- Supabase Storage cho ảnh hệ thống (avatar, CCCD, hóa đơn, logo...)
-- Database chỉ lưu URL public; không lưu Base64.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spa-images',
  'spa-images',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read spa-images" on storage.objects;
create policy "Public read spa-images"
on storage.objects for select
to public
using (bucket_id = 'spa-images');

drop policy if exists "Anon insert spa-images" on storage.objects;
create policy "Anon insert spa-images"
on storage.objects for insert
to anon
with check (bucket_id = 'spa-images');

drop policy if exists "Anon update spa-images" on storage.objects;
create policy "Anon update spa-images"
on storage.objects for update
to anon
using (bucket_id = 'spa-images')
with check (bucket_id = 'spa-images');

drop policy if exists "Anon delete spa-images" on storage.objects;
create policy "Anon delete spa-images"
on storage.objects for delete
to anon
using (bucket_id = 'spa-images');
