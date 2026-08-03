-- Bắt buộc ghi lý do khi Admin đổi giá / % hoa hồng dịch vụ.
-- Không tạo bảng audit mới — mở rộng service_change_logs hiện có.

ALTER TABLE public.service_change_logs
  ADD COLUMN IF NOT EXISTS change_reason text not null default '';

COMMENT ON COLUMN public.service_change_logs.change_reason IS
  'Lý do/ghi chú bắt buộc khi đổi giá hoặc % hoa hồng.';
