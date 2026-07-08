-- ============================================================
-- CHẠY TRÊN SUPABASE SQL Editor (Production)
-- Fix: "Không có quyền upload ảnh. Kiểm tra policy Storage."
-- ============================================================

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

grant usage on schema storage to anon, authenticated, public;
grant select on storage.buckets to anon, authenticated, public;
grant all on storage.objects to anon, authenticated;

alter table storage.objects enable row level security;

drop policy if exists "Public read spa-images" on storage.objects;
drop policy if exists "Anon insert spa-images" on storage.objects;
drop policy if exists "Anon update spa-images" on storage.objects;
drop policy if exists "Anon delete spa-images" on storage.objects;
drop policy if exists "Anon select spa-images" on storage.objects;
drop policy if exists "Authenticated select spa-images" on storage.objects;
drop policy if exists "Authenticated insert spa-images" on storage.objects;
drop policy if exists "Authenticated update spa-images" on storage.objects;
drop policy if exists "Authenticated delete spa-images" on storage.objects;

create policy "Public read spa-images"
on storage.objects for select to public
using (bucket_id = 'spa-images');

create policy "Authenticated select spa-images"
on storage.objects for select to authenticated
using (bucket_id = 'spa-images');

create policy "Authenticated insert spa-images"
on storage.objects for insert to authenticated
with check (bucket_id = 'spa-images');

create policy "Authenticated update spa-images"
on storage.objects for update to authenticated
using (bucket_id = 'spa-images')
with check (bucket_id = 'spa-images');

create policy "Authenticated delete spa-images"
on storage.objects for delete to authenticated
using (bucket_id = 'spa-images');

create policy "Anon insert spa-images"
on storage.objects for insert to anon
with check (bucket_id = 'spa-images');

create policy "Anon update spa-images"
on storage.objects for update to anon
using (bucket_id = 'spa-images')
with check (bucket_id = 'spa-images');

create policy "Anon delete spa-images"
on storage.objects for delete to anon
using (bucket_id = 'spa-images');

create policy "Anon select spa-images"
on storage.objects for select to anon
using (bucket_id = 'spa-images');

-- Kiểm tra
select id, name, public from storage.buckets where id = 'spa-images';

select policyname, cmd, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname ilike '%spa-images%'
order by policyname;
