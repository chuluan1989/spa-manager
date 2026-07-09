-- ============================================================
-- RUN on Production SQL Editor (ceyzjgpobfqyqoxtuixz)
-- Same as migration 0027 — no new bucket, no GRANT ALL
-- ============================================================

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'spa-images') then
    raise exception 'Bucket spa-images không tồn tại — dừng, không tạo bucket mới.';
  end if;
end $$;

grant usage on schema storage to anon;
grant select on table storage.buckets to anon;
grant select, insert, update, delete on table storage.objects to anon;

alter table storage.objects enable row level security;

drop policy if exists "Public read spa-images" on storage.objects;
drop policy if exists "Anon select spa-images" on storage.objects;
drop policy if exists "Anon insert spa-images" on storage.objects;
drop policy if exists "Anon update spa-images" on storage.objects;
drop policy if exists "Anon delete spa-images" on storage.objects;
drop policy if exists "Authenticated select spa-images" on storage.objects;
drop policy if exists "Authenticated insert spa-images" on storage.objects;
drop policy if exists "Authenticated update spa-images" on storage.objects;
drop policy if exists "Authenticated delete spa-images" on storage.objects;

create policy "Public read spa-images"
on storage.objects for select
to public
using (bucket_id = 'spa-images');

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

select id, name, public from storage.buckets where id = 'spa-images';

select policyname, cmd, roles, permissive, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname ilike '%spa-images%'
order by policyname;
