# Chi phí unified UI — Production UAT

**Kết quả: PASS** (video thao tác đầy đủ, không chỉ ảnh)

| Mục | Giá trị |
|-----|---------|
| Production | https://www.khoespa.net.vn |
| Asset | `/assets/index-CBDYaqMu.js` (deploy tiếp theo có history timeout) |
| Deployment | `dpl_F73REoeyWKnUN1oKUHAKTPRMEQvf` |
| Tag UAT | `UAT-EXP-1785997111359` |
| Video | `docs/uat-evidence/expenses-unified-prod/video/expenses-unified-uat-1785997149633.webm` |
| Report JSON | `docs/uat-evidence/expenses-unified-prod/EXPENSES_UNIFIED_PROD_UAT_REPORT.json` |

## Checklist chủ dự án

1. Quản lý tạo khoản chi — **PASS**
2. Admin sửa số tiền (+ lý do bắt buộc) — **PASS** (`83.111.000` → `83.222.000`)
3. Tổng chi phí cập nhật đúng — **PASS**
4. Lịch sử trước/sau + lý do — **PASS** (amount `111.000` → `222.000`, lý do «Quản lý nhập sai số tiền»)
5. Admin đổi nhóm (Taxi → Điện) — **PASS**
6. Admin hủy khoản chi, tổng giảm đúng — **PASS** (`83.222.000` → `83.000.000`, drop `222.000`)
7. Bộ lọc tháng / chi nhánh / nhóm — **PASS**

## Ghi chú kỹ thuật

- Soft void: app ghi `status=void` + marker `[[VOID]]` trong note (fallback nếu migration 0045 chưa chạy trên DB).
- Migration SQL: `supabase/migrations/0045_expense_soft_void_and_category_hide.sql` (nên apply trên Supabase khi tiện).
- Script: `scripts/playwright-expenses-unified-prod-uat.mjs`
