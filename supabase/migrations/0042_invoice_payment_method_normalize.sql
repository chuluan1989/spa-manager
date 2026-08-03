-- payment_method đã có từ 0001_init_schema (Production đang dùng).
-- Chuẩn hoá giá trị legacy `transfer` → `bank_transfer`.
-- Không backfill NULL → cash (HĐ cũ thiếu PTTT hiển thị "Chưa xác định").

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_method text;

UPDATE invoices
SET payment_method = 'bank_transfer'
WHERE payment_method = 'transfer';

COMMENT ON COLUMN invoices.payment_method IS
  'cash | bank_transfer | null/empty = chưa xác định. Legacy transfer đã map sang bank_transfer.';
