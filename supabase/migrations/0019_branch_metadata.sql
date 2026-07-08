-- Bổ sung metadata chi nhánh: sort_order, address, hotline (khóa theo id)

alter table public.branches
  add column if not exists sort_order integer not null default 99,
  add column if not exists address text not null default '',
  add column if not exists hotline text not null default '';

update public.branches set sort_order = 1, address = coalesce(nullif(address, ''), '347 Phú Lợi, P. Phú Lợi, TP Cần Thơ'), hotline = coalesce(nullif(hotline, ''), '0933.664.368') where id = 'tram-spa';
update public.branches set sort_order = 2, address = coalesce(nullif(address, ''), '61 Nguyễn Chí Thanh, P. Sóc Trăng, TP Cần Thơ'), hotline = coalesce(nullif(hotline, ''), '0846.80.80.83') where id = 'soc-trang';
update public.branches set sort_order = 3, address = coalesce(nullif(address, ''), '63 Trần Khánh Dư, P. Pleiku, Gia Lai'), hotline = coalesce(nullif(hotline, ''), '0779.881.388') where id = 'gia-lai-1';
update public.branches set sort_order = 4, address = coalesce(nullif(address, ''), 'Tuyến 5, Dãy nhà TNR, Đường Võ Nguyên Giáp, P. Nguyệt Hóa, Vĩnh Long'), hotline = coalesce(nullif(hotline, ''), '0704.858.777') where id = 'vinh-long';
update public.branches set sort_order = 5, address = coalesce(nullif(address, ''), '36 Ninh Bình, P. Bạc Liêu, Cà Mau'), hotline = coalesce(nullif(hotline, ''), '0888.077.655') where id = 'bac-lieu';
update public.branches set sort_order = 6, address = coalesce(nullif(address, ''), '55D14 Phạm Thái Bường, P. Phước Hậu, Vĩnh Long (Lốc cuối dãy VinHome)'), hotline = coalesce(nullif(hotline, ''), '0704.884.777') where id = 'tra-vinh';
update public.branches set sort_order = 7, address = coalesce(nullif(address, ''), '286 Trần Hưng Đạo, P. Phú Lợi, TP Cần Thơ'), hotline = coalesce(nullif(hotline, ''), '085.4758.777') where id = 'song-khoe-spa';
update public.branches set sort_order = 8, address = coalesce(nullif(address, ''), '174 Tạ Quang Bửu, P. Pleiku, Gia Lai'), hotline = coalesce(nullif(hotline, ''), '0779.881.388') where id = 'gia-lai-3';
update public.branches set sort_order = 9 where id = 'gia-lai-2';

create index if not exists idx_branches_sort_order on public.branches(sort_order, name);
