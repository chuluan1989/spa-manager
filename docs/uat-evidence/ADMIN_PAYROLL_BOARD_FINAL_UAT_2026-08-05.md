# Admin Payroll Board — UAT local FINAL (2026-08-05)

**Trạng thái checklist: PASS (local)**  
**Deploy Production: CHƯA xin — chờ chủ dự án duyệt**

---

## Kết quả

| Hạng mục | Kết quả |
|----------|---------|
| 1. Revert KPI Ly Ly UAT | PASS — KPI 0, net 1.569.400, audit giữ + hoàn tác |
| 2. KPI lưu +, −, 0 | PASS |
| 3. KPI cycle +100k / −100k / 0 | PASS (reload + preview) |
| 4. Sửa bảng lương đủ trường | PASS — thưởng, phạt, ứng, ĐC ±, multi, về 0 |
| 5. Audit cấu trúc + không nút Xóa | PASS |
| 6. Kỳ chốt E2E (Aug UAT) | PASS — không đụng July vận hành |
| 7. Phân quyền QL/NV | PASS — tài khoản UAT riêng |
| 8. Video liên tục | PASS — Playwright webm |
| 9. DT / Tips / HH không đổi | PASS mỗi bước |
| Bảng net = kỳ vọng sau reload | PASS |

---

## Evidence

- Báo cáo Playwright: `docs/uat-evidence/admin-payroll-board-local/PLAYWRIGHT_UAT_REPORT.json` (`ok: true`)
- Video: `docs/uat-evidence/admin-payroll-board-local/UAT_ADMIN_PAYROLL_BOARD_FULL.webm`
- Revert Ly Ly: `REVERT_LYLY_KPI_REPORT.json`
- Tài khoản UAT: `UAT_LOGIN_ACCOUNTS.json` (`uat_ql_gialai2_2026`, `uat_nv_2026`)
- Logic unit: `node scripts/uat-admin-payroll-board.mjs`

## Fix trong lần UAT này

- `saveAdminPayrollBoardEdits`: bỏ qua dòng không đổi (tránh ghi lại hàng loạt KPI lịch sử → race/chậm).
- Modal sửa bảng: bắt lỗi lưu, không đóng khi fail.
- Playwright: chờ dialog đóng; chỉ zero loại đang test (không đụng KPI lịch sử).

## Không deploy

Code/local UAT đã PASS. **Không deploy Production** cho đến khi chủ dự án xác nhận và ra lệnh deploy.
