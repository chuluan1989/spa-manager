-- ============================================================
-- CHẠY TRÊN SUPABASE SQL EDITOR (Production)
-- Fix: Trạm Spa hiện 2 nhân viên "Thanhtram" sai (không có TK, không có dữ liệu)
--
-- Giữ lại: tram-spa-thanh (tên "Thanh", có hóa đơn hợp lệ)
-- Xóa: 2 bản ghi UUID trùng tên Thanhtram
-- ============================================================

-- 1. Xóa nhân viên không hợp lệ (chưa phát sinh HĐ/chấm công/lương)
delete from public.employees
where id in (
  'e6953f13-d5db-4d69-a740-c1f03d75a0f2',
  '1e7f4663-5936-416b-821a-e7bb88735092'
)
and branch_id = 'tram-spa'
and lower(trim(name)) in ('thanhtram', 'thanh tram');

-- 2. Kiểm tra danh sách Trạm Spa sau khi dọn
select id, name, branch_id, status, phone
from public.employees
where branch_id = 'tram-spa'
order by name;

-- Kỳ vọng: 5 nhân viên — Thanh, Nhu Hà, Trúc Ly, Cherry, Lan Anh
-- Không còn dòng Thanhtram

notify pgrst, 'reload schema';
