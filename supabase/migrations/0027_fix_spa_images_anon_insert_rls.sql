-- ============================================================
-- 0027: Fix spa-images Storage RLS (Production)
-- Project: https://ceyzjgpobfqyqoxtuixz.supabase.co
--
-- Root cause (proven by scripts/debug-upload-compare.mjs):
--   INSERT as anon → 403 "new row violates row-level security policy"
--   Same failure for 2 employees / 2 branches → not data/code.
--
-- Rules:
--   - Do NOT create a new bucket
--   - Do NOT GRANT ALL
--   - Only restore Storage policies for spa-images (as 0011)
-- ============================================================

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'spa-images') then
    raise exception 'Bucket spa-images không tồn tại — dừng, không tạo bucket mới.';
  end if;
end $$;

-- Minimal privileges (NOT GRANT ALL): anon must be able to INSERT objects
grant usage on schema storage to anon;
grant select on table storage.buckets to anon;
grant select, insert, update, delete on table storage.objects to anon;

alter table storage.objects enable row level security;

-- Drop every known spa-images policy (0011 / 0025 / 0026 / dashboard variants)
drop policy if exists "Public read spa-images" on storage.objects;
drop policy if exists "Anon select spa-images" on storage.objects;
drop policy if exists "Anon insert spa-images" on storage.objects;
drop policy if exists "Anon update spa-images" on storage.objects;
drop policy if exists "Anon delete spa-images" on storage.objects;
drop policy if exists "Authenticated select spa-images" on storage.objects;
drop policy if exists "Authenticated insert spa-images" on storage.objects;
drop policy if exists "Authenticated update spa-images" on storage.objects;
drop policy if exists "Authenticated delete spa-images" on storage.objects;

-- Recreate exactly like migration 0011 (working yesterday)
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

-- Verify final state
select id, name, public from storage.buckets where id = 'spa-images';

select policyname, cmd, roles, permissive, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname ilike '%spa-images%'
order by policyname;
