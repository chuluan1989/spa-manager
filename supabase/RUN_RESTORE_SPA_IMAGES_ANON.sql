-- ============================================================
-- CHẠY NGAY trên Supabase SQL Editor
-- Project: https://ceyzjgpobfqyqoxtuixz.supabase.co
-- Khôi phục ANON policies giống migration 0011 (hôm qua upload OK)
-- Không tạo / xóa bucket. Không mở quyền module khác.
-- ============================================================

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'spa-images') then
    raise exception 'Bucket spa-images không tồn tại — dừng, không tạo bucket mới.';
  end if;
end $$;

alter table storage.objects enable row level security;

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
