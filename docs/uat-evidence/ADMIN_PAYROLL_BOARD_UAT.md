# UAT — Admin KPI + Sửa bảng lương (CHƯA DEPLOY)

**Trạng thái:** Chờ anh kiểm tra UI local / preview — **không deploy Production**.

## Đã làm

| Hạng mục | Chi tiết |
|----------|----------|
| Vị trí nút | Toolbar góc phải hồ sơ NV: **KPI** → **Sửa bảng lương** → Đối soát Excel → Tóm tắt PDF |
| Quyền | Chỉ `isAdmin()` — Manager / NV không thấy |
| KPI popup | Số (+/-), ghi chú, lý do bắt buộc, preview Lương cũ → mới → chênh lệch |
| Sửa bảng lương | KPI / Thưởng / Phạt / Ứng / Điều chỉnh khác / ghi chú / lý do bắt buộc + preview |
| Sau lưu | `reload()` → net + bảng tổng + chi tiết cập nhật live |
| Audit | Từng create/update/delete `payroll_adjustment` + log tổng `payroll_board` / `admin_edit_board` |

## Files chính

- `src/components/salary/PayrollKpiModal.jsx`
- `src/components/salary/PayrollEditBoardModal.jsx`
- `src/pages/Salary.jsx` + `PayrollReconciliationActions.jsx`
- `src/constants/payrollTypes.js` (`KPI`)
- `src/utils/payrollEngine.js` (net += kpi)
- `src/utils/payrollService.js` (`addAdminKpiAdjustment`, `saveAdminPayrollBoardEdits`)

## UAT checklist (anh / máy local)

1. Đăng nhập **Admin** → Lương → mở hồ sơ 1 NV (kỳ chưa khóa).
2. Thấy nút **KPI** và **Sửa bảng lương** cạnh Excel/PDF.
3. Đăng nhập **QL chi nhánh** / **NV** → **không** thấy 2 nút này.
4. KPI: nhập `+150000` → preview chênh lệch đúng → Lưu → net tăng; tab Audit có create.
5. KPI âm: `-50000` → net giảm.
6. Sửa bảng lương: đổi Thưởng / thêm Phạt → bắt buộc lý do → preview → Lưu → net/detail đổi; Audit có update/create + `admin_edit_board`.
7. Tháng đã chốt → nút disabled / lưu báo mở khóa trước.

## Logic UAT (máy)

```bash
node -e "/* hoặc scripts/uat-admin-payroll-board.mjs khi Vite resolve OK */"
```

Kết quả logic nội bộ: KPI signed + net preview **OK**.

## Ảnh / video

Mock UI (tham chiếu thiết kế — chưa phải screenshot Production):

- `docs/uat-evidence/admin-payroll-kpi-modal-mock.png`
- `docs/uat-evidence/admin-payroll-edit-board-modal-mock.png`

**Video thao tác:** cần anh quay trên máy local (Admin login → hồ sơ NV → KPI / Sửa bảng lương → preview → lưu → Audit). Agent không có mật khẩu Admin để quay video trên app thật.

Agent **chưa deploy**. Chỉ deploy sau khi anh xác nhận.
