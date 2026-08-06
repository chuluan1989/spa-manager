# PAYROLL GOVERNANCE V1 — Milestone đóng

## Kết luận

**ONE SOURCE OF TRUTH = PASS**

| Gate | Status |
|------|--------|
| Local UAT | PASS (chủ dự án duyệt) |
| Production READ-ONLY | PASS · mismatch=0 |
| Deploy | PASS · asset mới |
| Production Smoke | PASS |

## Deliverables

1. **Architecture:** [`docs/PAYROLL_ARCHITECTURE.md`](./PAYROLL_ARCHITECTURE.md)
2. **Regression suite:** `npm run regression:payroll`  
   Evidence: `docs/uat-evidence/payroll-governance-v1/REGRESSION_SUITE_REPORT.md`
3. **Prod dry-run evidence:** `docs/uat-evidence/admin-payroll-board-prod/sot-dry-run/`

## Phạm vi khóa V1

- Net vận hành 4 hạng mục Admin SET (+ tips/HH/base/reduction engine)
- Cùng nguồn `payrollRow` / `computePayrollReport` cho list, CN, dashboard, Excel, PDF, labor, profit, audit
- Bỏ fallback commission+tips cho chi phí NS

## Sau V1

Không sửa trực tiếp SoT/payroll board nếu không có issue mới.  
Mọi thay đổi Payroll sau này: chạy `npm run regression:payroll` trước khi xin duyệt.
