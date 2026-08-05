# Báo cáo triển khai — Sửa công thức HH + Kỳ 2/7 (38 dòng)

**Thời điểm:** 2026-08-05  
**Deploy Production app:** **CHƯA** (chờ xác nhận sau UAT)  
**Dữ liệu Production (38 dòng HĐ):** **ĐÃ CẬP NHẬT**

---

## 1. File code đã sửa (chưa deploy)

| File | Thay đổi |
|------|----------|
| `src/constants/commissionPolicyTypes.js` | Thêm `body-75` vào nhóm 0%; tách Bạc Liêu khỏi FLAT_20 |
| `src/constants/defaultCommissionPolicies.js` | Policy Bạc Liêu: default 20% + Chuyên sâu 30% |
| `src/utils/invoice.js` | Khi có `branchId`, % HH lấy từ **policy** (không lấy seed catalog tiered) |
| `src/utils/commissionPolicyStorage.js` | `POLICY_DATA_VERSION = 3` — re-seed localStorage tránh giữ flat BL / thiếu body-75 |
| `scripts/verify-commission-policy-matrix.mjs` | UAT matrix 6 CN × 11 dịch vụ |
| `scripts/fix-commission-jul-p2-38-lines.mjs` | Backup + cập nhật đúng 38 dòng |
| `scripts/audit-commission-formula-jul-p2-readonly.mjs` | Export đủ `sampleLineDiffs` |

**Không** đồng bộ flat 20% cho Trạm / Sóc Trăng / Sống Khoẻ.

---

## 2. Công thức sau sửa (HĐ mới — sau khi deploy code)

| Nhóm CN | Body 60/75/90, CVG, Foot | Combo 1/2/3, Chuyên sâu | Còn lại | Tip |
|---------|--------------------------|-------------------------|---------|-----|
| Trạm, Sóc Trăng, Sống Khoẻ | 0% | 10% | 20% | 100% |
| Trà Vinh, Vĩnh Long | 20% | 20% | 20% | 100% |
| Bạc Liêu | 20% | Combo 20%; **CS 30%** | 20% | 100% |

UAT matrix: **PASS** (`node scripts/verify-commission-policy-matrix.mjs`).

---

## 3. Kỳ 2 tháng 7 — xử lý 38 dòng

### Trước khi ghi
- Backup: `docs/uat-evidence/COMMISSION_JUL_P2_38_BACKUP_2026-08-05T05-54-27-664Z.json`
- Before: `..._BEFORE_2026-08-05T05-54-27-664Z.json`
- Plan: `..._PLAN_2026-08-05T05-54-27-664Z.json`

### Trạng thái close (7 NV bị lệch)
Tất cả **không có** `payroll_cycle_closes` Kỳ 2/7 (`billing_month=2026-07`, `cycle=period2`):
- Không approved / không submitted → **được phép cập nhật snapshot HĐ**.
- (Close khác: `tram-spa-truc-ly` submitted Kỳ 2/7 — **không** thuộc 7 NV / 38 dòng.)

### Sau khi ghi
- After: `..._AFTER_2026-08-05T05-54-27-664Z.json`
- **Updated invoices: 38/38**
- Blocked: 0

### Tổng thay đổi (khớp yêu cầu)

| | Mục tiêu | Thực tế (line Δ) |
|--|----------|------------------|
| Sóc Trăng | −1.648.800 | −1.648.800 |
| Bạc Liêu | +69.800 | +69.800 |
| Net | −1.579.000 | −1.579.000 |

### Audit lại sau sửa
```
mismatchLines: 0
affectedEmployees: 0
soc-trang delta: 0
bac-lieu delta: 0
totalDelta: 0
```

### Kiểm soát phạm vi
| Kiểm tra | Kết quả |
|----------|---------|
| 20 HĐ control ngoài 38 | **20/20 không đổi** |
| Spot-check 5 dòng đã sửa trên live | **5/5 đúng expPct/expAmt** |
| Kỳ lương khác | Không đụng HĐ ngoài 38 id; Kỳ 1/7 không trong danh sách update |

---

## 4. UAT bắt buộc

| Hạng mục | Kết quả |
|----------|---------|
| Body 60/75/90, CVG, Foot, Combo, CS, nhóm 20% × từng nhóm CN | PASS (matrix) |
| HĐ mới tính đúng | PASS ở tầng policy/invoice resolve; **cần deploy** để UI Production dùng code mới |
| 38 dòng cũ | PASS (audit mismatch=0) |
| HĐ ngoài phạm vi | PASS (20/20) |
| Tổng lương / NV khớp audit sau sửa | PASS (Δ=0 toàn kỳ) |
| Không ảnh hưởng kỳ khác | PASS (chỉ update đúng 38 id) |

---

## 5. Việc còn lại trước/ khi deploy

1. **Deploy code** lên Production (sau khi bạn xác nhận) — HĐ mới mới áp dụng body-75=0% và BL CS=30% qua policy.
2. Browser đã mở app: localStorage commission policy sẽ **re-seed** nhờ `POLICY_DATA_VERSION=3`.
3. Không cần tạo lại close cho 7 NV (chưa có close). Nếu sau này submit Kỳ 2/7 → snapshot sẽ lấy HH đã sửa.

## 6. Rủi ro đã xử lý / còn lại

- Đã sửa DB snapshot 38 dòng → lương live Kỳ 2/7 đúng ngay (không cần chờ deploy).
- Code chưa deploy → **HĐ tạo mới trên Production vẫn dùng bundle cũ** cho đến khi deploy.
- Kỳ đã approved: không gặp trong phạm vi 38 dòng lần này.
