# Preview UAT — nguồn % hoa hồng catalog SoT

**Không commit. Không deploy. Không ghi Production `branch_service_prices`.**

## Code root fix

- `src/utils/invoice.js` — HĐ mới lấy `%` từ catalog trên dòng dịch vụ; `0` hợp lệ; policy chỉ khi thiếu `%`.
- Payroll: `preferSnapshot` → `commissionAmount` → `commissionPercent` trên HĐ → mới policy. Không đọc bảng giá hiện tại.

## Dry-run catalog

Xem `DRY_RUN.md`. **31 dòng** sẽ đổi khi được duyệt apply. Trạm / Sống Khoẻ không đổi %. Sóc Trăng chỉ Xông hơi 0→20. Gia Lai **BLOCKED**.

## UAT in-memory

`npx vite-node scripts/verify-commission-catalog-sot-preview.mjs` — **10/10 PASS**.

Không tạo HĐ trên Supabase (Preview dùng chung DB production).

Rollback test: không có dữ liệu test trên production.
