# Employee Transfer — Kiến trúc (Design Freeze)

Tài liệu RC1 mô tả mô hình dữ liệu và quy tắc truy vấn sau khi nhân viên chuyển chi nhánh.

## Ba khái niệm

### 1. Current Branch (`employees.branch_id`)

- Chi nhánh **hiện tại** của nhân viên.
- Dùng cho: đăng nhập, session, tạo hóa đơn mới, chấm công mới, bảng giá, payroll lock theo chi nhánh hiện tại.
- **Không** dùng để lọc lịch sử hóa đơn / chấm công / lương đã phát sinh.

### 2. Record Branch (`*.branch_id` trên bản ghi)

- Chi nhánh **gắn trên từng bản ghi** khi tạo: `invoices`, `attendance`, `payroll_adjustments`.
- Bất biến sau khi tạo (trừ Admin sửa có audit — không đổi trong flow chuyển công tác).
- Dùng cho: hiển thị lịch sử, báo cáo Manager, KPI, ranking, P&L chi nhánh.

### 3. Branch History (`employees.branch_history[]`)

- Timeline các lần chuyển: `{ effectiveDate, fromBranchId, toBranchId }`.
- Dùng cho: suy luận chi nhánh tại một ngày (`getEmployeeBranchAtDate`), audit timeline.
- **TODO (sau RC1):** tách sang bảng `employee_branch_history` — chưa migration trong RC1.

## Query Rules

| Vai trò | Fetch lịch sử | Lọc chi nhánh | Lọc nhân viên |
|---------|---------------|---------------|---------------|
| **Employee** | Theo `employee_id` only | Không (`branchId: ''`) | Session `employeeId` |
| **Manager** | Theo `record.branch_id` | Session branch | Theo activity tại CN |
| **Admin** | Theo filter UI | `record.branch_id` khi chọn CN | `employee_id` when chọn NV (`branchId: ''`) |

Helper chính: `getRecordFetchBranchFilter()` trong `src/constants/auth.js`.

## Phạm vi theo màn hình

### Employee

- Payroll, Attendance, Invoice History, Salary Report, Customer Requested: **toàn bộ lịch sử theo `employee_id`**.
- Hiển thị chi nhánh từ `record.branch_id` từng dòng.
- Payroll đa chi nhánh trong một kỳ: section theo tên CN + **Tổng** (không dùng nhãn "Đa chi nhánh").

### Manager

- Báo cáo, KPI, ranking, attendance list: **`record.branch_id = chi nhánh quản lý`**.
- Roster = NV hiện tại tại CN **+** NV có invoice/attendance tại CN trong kỳ (kể cả đã chuyển đi).
- Sau ngày chuyển: NV **không** xuất hiện trong doanh số mới của CN cũ.

### Admin

- Xem toàn hệ thống.
- Filter theo NV → fetch `employee_id` only (không giới hạn `branchId`).
- Filter theo CN → `record.branch_id`.

## Timeline

```
getEmployeeBranchAtDate(employee, date):
  1. Không có history → employees.branchId
  2. Có history → bắt đầu từ fromBranchId của entry đầu
  3. Với mỗi entry: nếu date >= effectiveDate → toBranchId
```

Module: `src/utils/employeeBranchTimeline.js`

## Những điều CẤM

1. **Không** cập nhật `invoice.branch_id` / `attendance.branch_id` hàng loạt khi chuyển công tác.
2. **Không** lọc lịch sử Employee theo `employees.branch_id` (current branch).
3. **Không** lọc báo cáo Manager theo `employees.branch_id` — chỉ `record.branch_id`.
4. **Không** gộp multi-branch thành nhãn "Đa chi nhánh" trên payroll employee view.
5. **Không** sửa CEO Dashboard / Sidebar menu trong phạm vi transfer (frozen rules).

## Script verify / audit

| Script | Mục đích |
|--------|----------|
| `npm run verify:employee-branch-timeline` | Unit timeline |
| `npm run verify:employee-historical-fetch` | Employee fetch scope |
| `npm run verify:phase3-design-freeze` | Payroll / Attendance / Invoice |
| `npm run verify:phase4-design-freeze` | Manager / Admin / KPI / Ranking |
| `npm run audit:employee-branch-timeline` | Production read-only audit |
| `npm run verify:rc1` | RC1 full gate |

## Tham chiếu code

- `src/constants/auth.js` — `filterByUserScope`, `getRecordFetchBranchFilter`
- `src/utils/employeeBranchTimeline.js` — timeline core
- `src/utils/payrollEngine.js` — branch breakdown, payroll report
- `src/utils/managementReports/managementMetrics.js` — KPI / ranking Manager
