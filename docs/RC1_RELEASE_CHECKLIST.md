# RC1 Release Checklist — Employee Transfer

**Branch:** `feature/employee-transfer-login-customer-requested`  
**RC:** RC1 (Release Candidate 1)  
**Trạng thái:** Chưa merge · Chưa deploy

---

## Trước merge

- [ ] `npm run verify:rc1` — PASS
- [ ] `npm run build` — PASS
- [ ] Preview smoke — PASS
- [ ] Review PR — chủ dự án duyệt
- [ ] Không còn known blocker (xem báo cáo RC1)

## Migration cần chạy (Production)

| Migration | Mô tả | Trạng thái |
|-----------|--------|------------|
| `0012_invoice_customer_requested.sql` | Cột `invoices.customer_requested` | Đã verify trên Production |
| `0034_attendance_edit_logs_*` | Attendance audit logs | Kiểm tra env hiện tại |
| `0035_create_attendance_edit_logs.sql` | Nếu chưa có bảng | Kiểm tra env hiện tại |

**Không có migration mới** cho Design Freeze timeline trong RC1.

## ENV cần kiểm tra

| Biến | Bắt buộc |
|------|----------|
| `VITE_SUPABASE_URL` | Có |
| `VITE_SUPABASE_ANON_KEY` | Có (không placeholder) |
| `.env.local` / Production env loader | Scripts audit/verify |

Optional (smoke login manual):

- `ADMIN_PASSWORD`
- `CHERRY_PASSWORD` / `TRUC_LY_PASSWORD`

## Backup trước deploy

1. **Supabase:** snapshot / backup DB (chủ dự án hoặc DBA).
2. **Git:** tag commit deploy `rc1-employee-transfer-YYYYMMDD`.
3. **Credentials:** export `app_credentials` payload (read-only backup).
4. Ghi nhận: Cherry / Trúc Ly `branch_id` hiện tại trước deploy.

## Rollback Plan

1. Revert deploy frontend về build trước RC1.
2. **Không** rollback `employees.branch_id` / `branch_history` trừ khi có sự cố dữ liệu — dữ liệu lịch sử `record.branch_id` **giữ nguyên**.
3. Nếu migration 0012 đã chạy: không cần rollback cột `customer_requested` (backward compatible).
4. Khôi phục credentials từ backup nếu login bị ảnh hưởng.

## Smoke Test sau deploy

| # | Test | Người thực hiện |
|---|------|-----------------|
| 1 | Admin login | QA / Chủ dự án |
| 2 | QL Trạm Spa login — thấy Cherry + Trúc Ly tháng 7 | QA |
| 3 | Cherry login → branch Bạc Liêu, HĐ cũ Trạm Spa đủ | QA |
| 4 | Trúc Ly login → branch Sóc Trăng, HĐ cũ Trạm Spa đủ | QA |
| 5 | Tạo HĐ mới Cherry → `branch_id = bac-lieu` | QA |
| 6 | Customer Requested tick + báo cáo | QA |
| 7 | Payroll employee multi-branch breakdown | QA |
| 8 | Attendance Audit / Invoice Audit load | QA |

## Người chịu trách nhiệm (điền tên trước deploy)

| Bước | Người phụ trách |
|------|----------------|
| RC1 verify PASS | |
| Approve merge | Chủ dự án |
| DB backup | |
| Deploy frontend | |
| Smoke test | |
| Sign-off Production | |

## Lệnh verify nhanh

```bash
npm run verify:rc1
npm run build
npm run preview
```
