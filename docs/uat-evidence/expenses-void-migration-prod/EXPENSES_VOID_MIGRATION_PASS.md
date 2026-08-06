# Chi phí — Migration 0045 + bỏ fallback [[VOID]] — Production PASS

| Mục | Giá trị |
|-----|---------|
| Production | https://www.khoespa.net.vn |
| Migration | `0045_expense_soft_void_and_category_hide.sql` |
| Backup dir | `docs/uat-evidence/expenses-void-migration-prod/2026-08-06T06-22-40/` |
| Backfill `[[VOID]]` → `status=void` | **2** bản ghi |
| Clean note `[[VOID]]` | **2** bản ghi |
| Sau migration | void=2 (rồi UAT thêm), active≈117; **0** marker `[[VOID]]` còn lại |
| Video UAT | `docs/uat-evidence/expenses-void-migration-prod/uat-video/video/expenses-void-status-uat-1785997854947.webm` |
| UAT report | `docs/uat-evidence/expenses-void-migration-prod/uat-video/EXPENSES_VOID_STATUS_UAT_REPORT.json` |

## UAT checklist

| Kiểm tra | Kết quả |
|----------|---------|
| Tổng chi phí đúng sau thêm/sửa | PASS (`87.792.000` → `+55k` → `+66k`) |
| Khoản đã hủy không tính vào tổng | PASS (về lại `87.792.000`) |
| Bật «Hiện khoản đã hủy» vẫn xem được | PASS (badge Đã hủy) |
| Sửa + lịch sử audit trước/sau + lý do | PASS |
| UI không còn `[[VOID]]` | PASS |

## App

- `isExpenseVoided` chỉ dựa `status` (`void` / `cancelled`).
- `voidExpense` ghi `status/void_*`, **không** nhét marker vào note.
- Upsert **không** bỏ cột `status` khi retry thiếu cột legacy.
