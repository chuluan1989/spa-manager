# PAYROLL ARCHITECTURE

Milestone: **PAYROLL GOVERNANCE V1**  
Status: **ONE SOURCE OF TRUTH = PASS** (Local · Production READ-ONLY · Deploy · Smoke)

## Source of Truth

Sau khi Admin **Sửa bảng lương** (SET Thưởng / KPI / Phạt / Ứng):

1. Dữ liệu gốc lưu trong `payroll_adjustments` (cộng invoices + attendance).
2. Công thức net **chỉ** sống trong `computeEmployeePayrollRow` / `computeNetSalary` (`src/utils/payrollEngine.js`).
3. Bảng kỳ / UI / export lấy từ **`computePayrollReport` → `payrollRow`** (và `report.rows` / `report.dashboard`).
4. Chi phí nhân sự / lợi nhuận kỳ lương lấy **Σ `payrollRow.netSalary`** qua `aggregatePayrollCostFromReport` (hoặc `computePayrollCostByBranch({ month, cycle })` ủy quyền report).

```
Invoice + Attendance + payroll_adjustments
              ↓
      Payroll Engine
   computeEmployeePayrollRow
              ↓
         payrollRow
              ↓
   ┌──────────┼──────────┬──────────┬──────────┐
   ↓          ↓          ↓          ↓          ↓
Dashboard   Excel       PDF      Labor/Profit  Audit
(list/CN)  (map row)  (payslip) (Σ net)     (event log)
```

## Net vận hành (khóa)

```
net = tips + commission + bonus + kpi − penalty − advance
      (+ baseSalary − reduction nếu có)
```

- **KPI** có dấu (±).
- **Điều chỉnh khác (`otherAdjustment`)** chỉ legacy/audit — **không** vào net vận hành.
- Admin SET chỉ 4 hạng mục: Thưởng, KPI, Phạt, Ứng.

## Module → nguồn dữ liệu

| Module | Nguồn bắt buộc | Ghi chú |
|--------|----------------|---------|
| Chi tiết NV / wallet | `payrollRow` từ `computePayrollReport` | Wallet timeline = chi tiết dòng, không công thức net thứ hai |
| Danh sách bảng lương | `mergeEmployeePayrollRows(..., report.rows)` | Không tự cộng HH/tips |
| Tổng lương chi nhánh | `aggregateBranchSummaries` trên `report.rows` | Home-branch roster |
| Live Dashboard (Salary) | Field trên `payrollRow` | Không tự cộng lại net |
| Excel | `mapPayrollRowForExport(payrollRow)` | Reconcile phải gồm KPI |
| PDF / phiếu lương | `payrollRow` (có dòng KPI) | Net = `payrollRow.netSalary` |
| Chi phí nhân sự | `aggregatePayrollCostFromReport` / `loadPayrollCostForFilters` | Kỳ lương khớp → cùng report |
| Lợi nhuận Spa / Báo cáo | `actualRevenue − totalSalary − expenses` với `totalSalary` từ payroll cost trên | Không fallback commission+tips |
| DrillDown / Ops finance | `payrollByBranch` từ `loadPayrollCostForFilters` | Cùng loader Báo cáo |
| Audit | `payroll_audit_logs` lúc SET | Event log, không phải engine live |
| CEO Dashboard | **Không** có KPI lương | Đóng băng — không gắn payroll |

## Module tuyệt đối không được tự tính

- Không tự `commission + tips` làm “lương”.
- Không tự cộng net từ từng field trên UI (trừ engine).
- Không đọc lại adjustments để “ước lượng” cột Hiện tại của popup — popup bind **`currentTotalsFromPayrollRow(payrollRow)`**.
- Không dùng `buildBranchEfficiencyPnl` / `computeSalaryReport` (legacy) như lương chính thức.
- Không thêm net logic song song trong Excel/PDF/Dashboard.

## Quy tắc bắt buộc cho module mới

> **Mọi module Payroll mới phải đọc từ `payrollRow` hoặc `computePayrollReport`.**  
> **Không được tự cộng commission, tips hoặc net.**

Khi cần chi phí NS / lợi nhuận theo **đúng kỳ lương** (Kỳ 1 / Kỳ 2 / cả tháng):

- Dùng `month` + `cycle` → `computePayrollReport` / `aggregatePayrollCostFromReport`.
- Kỳ 2: attendance **cả tháng** (cùng `usePayrollData`) — không date-filter khác Salary UI.

## Admin SET — Sửa bảng lương

- SET giá trị cuối kỳ (Excel), không “Thêm phát sinh”.
- 4 field: `bonus`, `kpi`, `penalty`, `advance`.
- Sau Lưu: zero dòng cũ kỳ + ghi tổng mới + audit; mọi module reload cùng report.

## Regression

Một lệnh (offline):

```bash
npm run regression:payroll
```

Kèm Production READ-ONLY:

```bash
REGRESSION_INCLUDE_PROD=1 npm run regression:payroll
```

Suite gồm: hoa hồng Body 75 / Chuyên sâu BL 30% · hỗ trợ liên CN · chu kỳ lương · summary · popup SET · KPI · SoT · Excel/PDF/Dashboard/Audit · (optional) prod dry-run.

## Freeze

Milestone **PAYROLL GOVERNANCE V1** đã đóng.  
Không sửa payroll SoT nếu không có issue mới được chủ dự án giao.
