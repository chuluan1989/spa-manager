# UAT Quản trị — ONE SOURCE OF TRUTH (LOCAL · CHƯA DEPLOY)

## Kết luận

**ONE SOURCE OF TRUTH = PASS**

Đủ điều kiện xin anh duyệt deploy (script chưa tự deploy).

## Xác nhận nguồn

> Sau Admin SET Thưởng/KPI/Phạt/Ứng: mọi module đọc cùng nguồn payroll_adjustments → computeEmployeePayrollRow / computePayrollReport / computePayrollCostByBranch. Không fallback commission+tips.

## Module đã kiểm tra (Before → Save → After)

- 1. Chi tiết nhân viên — computePayrollReport → payrollRow / wallet
- 2. Danh sách bảng lương — mergeEmployeePayrollRows(report.rows)
- 3. Tổng lương chi nhánh — aggregateBranchSummaries(report.rows)
- 4. Chi phí nhân sự — loadPayrollCostForFilters → computePayrollCostByBranch (Σ net)
- 5. Lợi nhuận Spa — actualRevenue − laborCost − expenses (cùng labor trên)
- 6. Dashboard Live Payroll — đọc field từ payrollRow (không tự cộng lại)
- 7. Excel — mapPayrollRowForExport(payrollRow)
- 8. PDF/phiếu — payslip từ payrollRow (+ KPI)
- 9. Audit — payroll_audit_logs ghi lúc SET

## Before / After

### Phạt 400.000 → 1.000.000

| Metric | Before | After | Δ | Expected |
|--------|-------:|------:|--:|---------:|
| Lương NV | 1169400 | 569400 | -600000 | -600000 |
| Chi phí NS | 41339379 | 40739379 | -600000 | (= Δ systemNet -600000) |
| Lợi nhuận Spa | 40680621 | 41280621 | 600000 | 600000 (công thức) |
| Tổng CN | 10631700 | 10031700 | -600000 | -600000 |
| Dashboard hệ | 41339379 | 40739379 | -600000 | (= Δ labor) |
| Excel net | 1169400 | 569400 | -600000 | -600000 |
| PDF net | 1169400 | 569400 | -600000 | -600000 |

Kết quả case: **KHỚP** · UI Δnet=-600000 · concurrentOtherNet=0

### Ứng 500.000 → 200.000

| Metric | Before | After | Δ | Expected |
|--------|-------:|------:|--:|---------:|
| Lương NV | 69400 | 369400 | 300000 | 300000 |
| Chi phí NS | 40239379 | 40539379 | 300000 | (= Δ systemNet 300000) |
| Lợi nhuận Spa | 41780621 | 41480621 | -300000 | -300000 (công thức) |
| Tổng CN | 9531700 | 9831700 | 300000 | 300000 |
| Dashboard hệ | 40239379 | 40539379 | 300000 | (= Δ labor) |
| Excel net | 69400 | 369400 | 300000 | 300000 |
| PDF net | 69400 | 369400 | 300000 | 300000 |

Kết quả case: **KHỚP** · UI Δnet=300000 · concurrentOtherNet=0

### KPI 0 → -300.000

| Metric | Before | After | Δ | Expected |
|--------|-------:|------:|--:|---------:|
| Lương NV | 369400 | 69400 | -300000 | -300000 |
| Chi phí NS | 40539379 | 40239379 | -300000 | (= Δ systemNet -300000) |
| Lợi nhuận Spa | 41480621 | 41780621 | 300000 | 300000 (công thức) |
| Tổng CN | 9831700 | 9531700 | -300000 | -300000 |
| Dashboard hệ | 40539379 | 40239379 | -300000 | (= Δ labor) |
| Excel net | 369400 | 69400 | -300000 | -300000 |
| PDF net | 369400 | 69400 | -300000 | -300000 |

Kết quả case: **KHỚP** · UI Δnet=-300000 · concurrentOtherNet=0

### KPI -300.000 → 500.000

| Metric | Before | After | Δ | Expected |
|--------|-------:|------:|--:|---------:|
| Lương NV | 69400 | 869400 | 800000 | 800000 |
| Chi phí NS | 40239379 | 41039379 | 800000 | (= Δ systemNet 800000) |
| Lợi nhuận Spa | 41780621 | 40980621 | -800000 | -800000 (công thức) |
| Tổng CN | 9531700 | 10331700 | 800000 | 800000 |
| Dashboard hệ | 40239379 | 41039379 | 800000 | (= Δ labor) |
| Excel net | 69400 | 869400 | 800000 | 800000 |
| PDF net | 69400 | 869400 | 800000 | 800000 |

Kết quả case: **KHỚP** · UI Δnet=800000 · concurrentOtherNet=0

### Thưởng 0 → 500.000

| Metric | Before | After | Δ | Expected |
|--------|-------:|------:|--:|---------:|
| Lương NV | 869400 | 1369400 | 500000 | 500000 |
| Chi phí NS | 41039379 | 41539379 | 500000 | (= Δ systemNet 500000) |
| Lợi nhuận Spa | 40980621 | 40480621 | -500000 | -500000 (công thức) |
| Tổng CN | 10331700 | 10831700 | 500000 | 500000 |
| Dashboard hệ | 41039379 | 41539379 | 500000 | (= Δ labor) |
| Excel net | 869400 | 1369400 | 500000 | 500000 |
| PDF net | 869400 | 1369400 | 500000 | 500000 |

Kết quả case: **KHỚP** · UI Δnet=500000 · concurrentOtherNet=0

## Tổng
allOk: true
ONE SOURCE OF TRUTH: PASS
error: none