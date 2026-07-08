-- Khóa 8 chi nhánh chuẩn theo branch_id (CN1→CN8)
-- gia-lai-3 là chi nhánh lỗi — dữ liệu chuyển sang gia-lai-2 trước khi xóa

-- employees: chuyển branch_id gia-lai-3 → gia-lai-2 (giữ nguyên id và hồ sơ)
update public.employees
set branch_id = 'gia-lai-2', updated_at = now()
where branch_id = 'gia-lai-3';

-- invoices
update public.invoices
set branch_id = 'gia-lai-2'
where branch_id = 'gia-lai-3';

-- expenses
update public.expenses
set branch_id = 'gia-lai-2'
where branch_id = 'gia-lai-3';

-- attendance
update public.employee_attendance
set branch_id = 'gia-lai-2'
where branch_id = 'gia-lai-3';

-- payroll
update public.payroll_adjustments
set branch_id = 'gia-lai-2'
where branch_id = 'gia-lai-3';

-- branch pricing / catalogs / commission
update public.branch_pricing set branch_id = 'gia-lai-2' where branch_id = 'gia-lai-3';
update public.branch_catalogs set branch_id = 'gia-lai-2' where branch_id = 'gia-lai-3';
update public.branch_service_prices set branch_id = 'gia-lai-2' where branch_id = 'gia-lai-3';
update public.branch_commission_policies set branch_id = 'gia-lai-2' where branch_id = 'gia-lai-3';

delete from public.branch_service_prices where branch_id = 'gia-lai-3';
delete from public.branch_catalogs where branch_id = 'gia-lai-3';
delete from public.branch_commission_policies where branch_id = 'gia-lai-3';
delete from public.branch_pricing where branch_id = 'gia-lai-3';
delete from public.branches where id = 'gia-lai-3';

-- Tên và thứ tự chuẩn CN1→CN8
update public.branches set sort_order = 1, name = 'Sóc Trăng Khoẻ Spa', address = coalesce(nullif(address, ''), '61 Nguyễn Chí Thanh, P. Sóc Trăng, TP Cần Thơ'), hotline = coalesce(nullif(hotline, ''), '0846.80.80.83') where id = 'soc-trang';
update public.branches set sort_order = 2, name = 'Sống Khoẻ Spa', address = coalesce(nullif(address, ''), '286 Trần Hưng Đạo, P. Phú Lợi, TP Cần Thơ'), hotline = coalesce(nullif(hotline, ''), '085.4758.777') where id = 'song-khoe-spa';
update public.branches set sort_order = 3, name = 'Gia Lai 1', address = coalesce(nullif(address, ''), '63 Trần Khánh Dư, P. Pleiku, Gia Lai'), hotline = coalesce(nullif(hotline, ''), '0779.881.388') where id = 'gia-lai-1';
update public.branches set sort_order = 4, name = 'Trà Vinh Khoẻ Spa', address = coalesce(nullif(address, ''), '55D14 Phạm Thái Bường, P. Phước Hậu, Vĩnh Long (Lốc cuối dãy VinHome)'), hotline = coalesce(nullif(hotline, ''), '0704.884.777') where id = 'tra-vinh';
update public.branches set sort_order = 5, name = 'Bạc Liêu Khoẻ Spa', address = coalesce(nullif(address, ''), '36 Ninh Bình, P. Bạc Liêu, Cà Mau'), hotline = coalesce(nullif(hotline, ''), '0888.077.655') where id = 'bac-lieu';
update public.branches set sort_order = 6, name = 'Vĩnh Long Khoẻ Spa', address = coalesce(nullif(address, ''), 'Tuyến 5, Dãy nhà TNR, Đường Võ Nguyên Giáp, P. Nguyệt Hóa, Vĩnh Long'), hotline = coalesce(nullif(hotline, ''), '0704.858.777') where id = 'vinh-long';
update public.branches set sort_order = 7, name = 'Gia Lai 2', address = coalesce(nullif(address, ''), '174 Tạ Quang Bửu, P. Pleiku, Gia Lai'), hotline = coalesce(nullif(hotline, ''), '0779.881.388') where id = 'gia-lai-2';
update public.branches set sort_order = 8, name = 'Trạm Spa', address = coalesce(nullif(address, ''), '347 Phú Lợi, P. Phú Lợi, TP Cần Thơ'), hotline = coalesce(nullif(hotline, ''), '0933.664.368') where id = 'tram-spa';

comment on table public.branches is '8 chi nhánh chuẩn — mapping duy nhất theo id (branch_id)';
