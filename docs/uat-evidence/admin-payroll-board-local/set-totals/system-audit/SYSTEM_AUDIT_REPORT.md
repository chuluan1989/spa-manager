# Audit toàn hệ thống — Popup “Sửa bảng lương” bind payrollRow

**Trạng thái: LOCAL BIND PASS (mismatch sau sửa = 0) — CHƯA DEPLOY — chờ anh xác nhận**

Không tự kết luận PASS Production.

---

## Nguyên tắc đã áp dụng

Cột **Hiện tại** = `currentTotalsFromPayrollRow(payrollRow)`:

- `bonus` / `kpi` / `penalty` / `advance` / `otherAdjustment`

Không cộng lại từ adjustments riêng.

---

## 1) Audit engine (READ-ONLY — không ghi DB)

Script: `scripts/audit-payroll-edit-popup-bind.mjs`  
CSV: `docs/uat-evidence/admin-payroll-board-local/set-totals/system-audit/POPUP_BIND_AUDIT_ALL.csv`  
JSON: `POPUP_BIND_AUDIT_SUMMARY.json` · `MISMATCH_FIELDS_BEFORE.json`

| Kỳ | Phạm vi |
|----|---------|
| 2026-07 Kỳ 1 | Tất cả CN |
| 2026-07 Kỳ 2 | Tất cả CN |
| 2026-08 Kỳ 1 | Tất cả CN |

| Chỉ số | Giá trị |
|--------|---------|
| Employee-periods đã kiểm tra | **114** |
| Nhân viên unique | **38** |
| Mismatch **TRƯỚC** sửa (logic cộng adjustments) | **22** rows / **22** field (toàn bộ là **Phạt** — phạt chấm công có trên bảng, popup cũ = 0) |
| Mismatch **SAU** sửa (bind payrollRow) | **0** rows / **0** field |

Tháng 7: **chỉ đọc**, không ghi.

---

## 2) UI — tối thiểu 5 nhân viên khác nhau (bảng = popup)

Ảnh cạnh nhau: `docs/uat-evidence/admin-payroll-board-local/set-totals/system-audit/shots/*-side.png`

| Nhân viên | Kỳ | Loại | Khớp |
|-----------|-----|------|------|
| Bảo Trân | 2026-07 K1 | (đối chiếu UI) | KHỚP |
| Thu Hương | 2026-08 K1 | Thưởng + ĐC khác | KHỚP (500k / 500k) |
| Trúc Ly | 2026-07 K1 | Ứng lương | KHỚP (2.000.000) |
| Lan Anh | 2026-07 K1 | Cross-branch / Trạm Spa | KHỚP |
| Ái Di | 2026-07 K1 | Không phát sinh 5 hạng mục | KHỚP |
| Ly Ly | 2026-08 K1 | Ops Aug readonly | KHỚP |

---

## 3) UAT ghi DB — chỉ `UAT Cong Tac Final` (Aug K1)

| Bước | Kết quả |
|------|---------|
| KPI 0 → +300.000 · reload · bảng = popup | PASS |
| KPI → −200.000 · reload · bảng = popup | PASS |
| Phạt 600.000 → 200.000 · reload · bảng = popup | PASS |
| Hoàn tác về 0 · DT/Tips/HH không đổi | PASS |

Không sửa / không hoàn tác nhân viên vận hành tháng 7.

---

## 4) Coverage checklist

| Yêu cầu | Evidence |
|---------|----------|
| Có Phạt | Engine: 22 case phạt trước-sửa lệch; UAT penalty cycle UI |
| Có Thưởng | Thu Hương 500.000 |
| Có Ứng | Trúc Ly 2.000.000 |
| KPI dương | UAT +300.000 |
| KPI âm | UAT −200.000 |
| Điều chỉnh khác | Thu Hương 500.000 |
| Hỗ trợ nhiều CN | Lan Anh (Trạm Spa) |
| Không phát sinh | Ái Di |

*(Hệ thống hiện không có NV nào sẵn KPI ± trên Jul/Aug — đã tạo tạm trên UAT rồi hoàn tác.)*

---

## 5) Điều kiện local

- [x] mismatch sau sửa = 0 (114/114)
- [x] 5 hạng mục khớp trên UI mẫu
- [x] Audit tháng 7 read-only
- [x] UAT save/reload + hoàn tác baseline
- [x] Không deploy

Anh mở CSV + ảnh `shots/*-side.png` để xác nhận. **Không xin deploy** đến khi anh OK.
