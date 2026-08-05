# Báo cáo — Tối ưu màn hình tổng lương

**Trạng thái:** Đã sửa code + UAT logic. **Chưa deploy Production.**

## 1. File đã sửa

| File | Thay đổi |
|------|----------|
| `src/components/salary/PayrollEmployeeList.jsx` | Cột mới (bỏ chức vụ/đã TT/giảm/còn trả/avatar), STT, footer tổng |
| `src/pages/Salary.css` | Bảng vừa viewport, căn trái/phải, net nổi bật, switcher CN |
| `src/pages/Salary.jsx` | `employeeWide` fetch, `homeBranchOnly`, switch NV trong chi tiết |
| `src/hooks/usePayrollData.js` | `employeeWide` / `keepBranchRoster` / `rosterBranchId` |
| `src/utils/payrollViewHelpers.js` | `homeBranchOnly`, `sumEmployeePayrollTableTotals`, branch summary không trùng |
| `src/components/salary/PayrollEmployeeProfile.jsx` | Sidebar chọn NV cùng CN + tìm kiếm |
| `docs/uat-evidence/SALARY_SUMMARY_PRECHECK.md` | Báo cáo mục 5 trước khi sửa |
| `scripts/verify-salary-summary-uat.mjs` | UAT 6 case logic |

## 2. Hàm tổng hợp đã dùng

- **Không đổi công thức:** `computeNetSalary` / `computeEmployeePayrollRow` (`payrollEngine.js`)
- Bảng tổng tái sử dụng `row.netSalary` từ cùng engine với màn hình chi tiết
- Fetch danh sách: `employeeWide` → không lọc theo CN phát sinh (`reportBranchFilter = ''`)

## 3. Chi nhánh chính của nhân viên

- `employee.branchId` (canonical) qua `employeeCurrentlyAtBranch`
- Roster bảng tổng: `homeBranchOnly: true` → chỉ NV thuộc CN nhân sự đang chọn
- Hỗ trợ ở CN khác **không** tạo dòng riêng; đã gộp vào net employee-wide

## 4. Ảnh trước / sau

`docs/uat-evidence/salary-summary-before-after.png`

## 5. UAT

| Case | Kết quả |
|------|---------|
| 1. Không hỗ trợ — tổng = chi tiết | PASS (cùng `computeNetSalary`) |
| 2. Hỗ trợ 1 CN — net gồm hỗ trợ | PASS (employee-wide) |
| 3. Nhiều CN — 1 dòng tại CN nhân sự | PASS (`homeBranchOnly`) |
| 4. Ứng + phạt trừ một lần | PASS |
| 5. Chuyển A→B→C giữ filter | PASS (chỉ đổi `selectedEmployeeId`) |
| 6. UI cột / không cuộn ngang (CSS 1366+) | PASS (logic cột + CSS `min-width:0`, bỏ 1400px) |

Script: `node scripts/verify-salary-summary-uat.mjs` → passed.

## 6. Khớp tổng ↔ chi tiết

Xác nhận thiết kế: cùng `computeEmployeePayrollRow` → `netSalary`.  
Khi mở chi tiết cùng kỳ/CN, số **Lương thực nhận** trên bảng = KPI net trên profile.

## 7. Deploy

**Chưa deploy Production** — chờ duyệt.
