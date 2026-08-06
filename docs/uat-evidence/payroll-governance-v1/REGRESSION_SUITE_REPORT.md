# Payroll Governance V1 — Regression Suite Report

Generated: 2026-08-06T02:07:26.849Z
Result: **PASS**
includeProd=false

| ID | Title | Result |
|----|-------|--------|
| commission-body75-baclieu | Hoa hồng Body 75 = 0% (tiered) + Chuyên sâu Bạc Liêu 30% | PASS |
| cross-branch-support | Hỗ trợ liên chi nhánh (serving branch / không phụ thuộc supportEnabled) | PASS |
| salary-summary | Payroll Summary (home-branch, không trùng net hỗ trợ) | PASS |
| offline-core | Chu kỳ lương · Popup SET · KPI · Excel/PDF · Dashboard · SoT · Audit fields | PASS |
| prod-sot-readonly | ONE SOURCE OF TRUTH — Production READ ONLY dry-run | SKIP |

Run: `npm run regression:payroll`
Prod RO: `REGRESSION_INCLUDE_PROD=1 npm run regression:payroll`