-- Spa Manager — Bật Supabase Realtime cho các bảng chính.
-- Chạy SAU khi đã chạy 0001_init_schema.sql.
-- An toàn khi chạy lại nhiều lần (kiểm tra tồn tại trước khi thêm).

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'branches', 'employees', 'services', 'branch_pricing', 'invoices', 'expenses'
  ])
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;

-- Kiểm tra nhanh: bảng nào đã có Realtime.
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime';
