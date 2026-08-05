# Báo cáo kiểm tra công thức % dịch vụ — Kỳ 2 tháng 7/2026

**Phạm vi:** Chỉ đọc (Production). Không sửa code/DB, không migration, không deploy.  
**Kỳ đối chiếu:** 2026-07-16 → 2026-07-31  
**Nguồn số:** `docs/uat-evidence/COMMISSION_FORMULA_JUL_P2_AUDIT.json`

## 1. Nguyên nhân gốc

Hai lệch so với công thức nghiệp vụ đã xác nhận:

### A. Body 75 tại nhóm tiered (Sóc Trăng) bị tính 20% thay vì 0%

- Trong code, nhóm 0% chỉ khai báo `body-60`, `body-90`, `foot`, `co-vai-gay` — **thiếu `body-75`**.
- Khi tạo hóa đơn, nếu % không lấy được từ bảng giá thì fallback policy → **default 20%**.
- Kỳ 2/7 tại Sóc Trăng: **36 dòng** `id=body-75`, tên `Body 75 75'`, `commissionPercent=20`, mỗi dòng ~45.800₫.
- Body 60 / Body 90 cùng kỳ lại đúng **0%** (vì có trong danh sách 0%).

### B. Chuyên sâu tại Bạc Liêu bị tính 20% thay vì 30%

- Nhóm Trà Vinh / Bạc Liêu / Vĩnh Long đang flat **20% tất cả**.
- **Không có** rule đặc biệt 30% cho Chuyên sâu Bạc Liêu trong code/DB.
- Kỳ 2/7: **2 dòng** Chuyên sâu Bạc Liêu snap 20% (đúng flat hiện tại, sai so với công thức mới).

### Ghi chú kiến trúc

- Production **không có bảng** `branch_commission_policies` (PGRST205) → policy chạy từ default code phía client.
- `branch_service_prices` hiện tại (Sóc Trăng) đã có `body-75 = 0%`, nhưng **snapshot trên hóa đơn cũ Kỳ 2/7 vẫn giữ 20%**.
- Payroll/`getInvoiceServiceCommission` **ưu tiên snapshot** `commissionAmount` trên dòng HĐ → không tự sửa khi đổi bảng giá.

## 2. File / hàm / bảng gây lỗi

| Vai trò | Vị trí |
|--------|--------|
| Nhóm CN + danh sách dịch vụ 0%/10% | `src/constants/commissionPolicyTypes.js` |
| Build policy mặc định | `src/constants/defaultCommissionPolicies.js` |
| Resolve % theo policy (ID + fuzzy tên) | `src/utils/commissionPolicyEngine.js` → `resolveCommissionPercent` |
| Ưu tiên % catalog/bảng giá, fallback policy | `src/utils/invoice.js` → `resolveLineCommissionPercent` |
| Payroll cộng HH từ snapshot HĐ | `src/utils/invoice.js` → `getInvoiceServiceCommission` (+ `preferSnapshot: true`) |
| Nhân viên hỗ trợ ×50% | `src/utils/payrollEngine.js` → `scaleCommission` |
| Seed % catalog | `src/constants/defaultPriceGroups.js` |
| Bảng giá runtime | `branch_service_prices` (`duration_id`, `commission_percent`) |
| Snapshot kỳ lương | `payroll_cycle_closes` (`billing_month`, `cycle`, `snapshot`) |
| Policy DB | `branch_commission_policies` — **không tồn tại trên Production** |

## 3. Công thức hệ thống đang dùng

### Nhóm tiered — `soc-trang`, `tram-spa`, `song-khoe-spa`

| Nhóm | Hệ thống hiện tại | Công thức đúng (user) |
|------|-------------------|------------------------|
| Body 60 | 0% | 0% |
| Body 75 | **Thiếu trong policy 0% → dễ ra 20%** | 0% |
| Body 90 | 0% | 0% |
| Cổ vai gáy | 0% | 0% |
| Foot | 0% | 0% |
| Combo 1/2/3 | 10% | 10% |
| Chuyên sâu | 10% | 10% |
| Còn lại | 20% | 20% |
| Tip | 100% (primary) | 100% |

### Nhóm flat 20% — `tra-vinh`, `bac-lieu`, `vinh-long`

| Nhóm | Hệ thống hiện tại | Công thức đúng (user) |
|------|-------------------|------------------------|
| Tất cả dịch vụ | 20% | 20% |
| Chuyên sâu Bạc Liêu | **20% (không có 30%)** | **30%** |
| Tip | 100% | 100% |

### Gia Lai (`gia-lai-1/2`)

Flat 40% — ngoài phạm vi bảng công thức user đưa (không thấy HĐ Kỳ 2/7 trong audit này).

## 4. Chi nhánh bị ảnh hưởng (Kỳ 2/7)

| Chi nhánh | HĐ | HĐ lệch | Δ (đúng − hiện tại) | Ý nghĩa |
|-----------|----|---------|---------------------|---------|
| Sóc Trăng | 183 | 36 | **−1.648.800** | Đang tính **dư** (Body 75) |
| Bạc Liêu | 109 | 2 | **+69.800** | Đang tính **thiếu** (Chuyên sâu) |
| Trạm Spa | 151 | 0 | 0 | Khớp |
| Trà Vinh | 120 | 0 | 0 | Khớp |
| Vĩnh Long | 154 | 0 | 0 | Khớp |
| Sống Khoẻ | 3 | 0 | 0 | Khớp |

## 5. Dịch vụ bị tính sai

1. **`body-75` / `Body 75 75'` tại Sóc Trăng** — snap 20%, đúng 0% (36 dòng).
2. **`chuyen-sau` / `Chuyên sâu` tại Bạc Liêu** — snap 20%, đúng 30% (2 dòng).

Các biến thể tên quan sát được: `Body 60 60'`, `Body 75 75'`, `Body 90 90'`, `Cổ Vai Gáy 60'`, `Combo 1 1'`, `Combo 2 120'`… Nhận diện **chính theo `id`** (`body-75`, `chuyen-sau`); tên được normalize + `includes` khi fallback policy.

## 6–8. Nguồn dữ liệu lương & snapshot

- **Bảng lương / payrollEngine:** lấy HH từ **snapshot trên từng dòng hóa đơn** (`commissionPercent` / `commissionAmount`), không tính lại từ catalog mỗi lần mở.
- **Kỳ chốt `payroll_cycle_closes`:** đóng băng thêm một snapshot tổng lúc submit (`billing_month=2026-07`, `cycle=period2`).
- Kỳ 2/7 Production hiện có **1** close `submitted` (không nằm trong 7 NV bị lệch Body 75 / Chuyên sâu).
- **Nếu chỉ sửa công thức code/bảng giá:** HĐ cũ **không tự đổi**; lương live vẫn theo snapshot HĐ cũ. Close đã submit/approved **không tự tính lại**.
- Muốn kỳ cũ đúng: phải **backfill snapshot HĐ** và/hoặc **tạo lại / điều chỉnh close**.

## 9. Thống kê Kỳ 2/7

| Chỉ số | Giá trị |
|--------|---------|
| Tổng hóa đơn | 720 |
| Tổng dòng dịch vụ | 1.059 |
| Dòng lệch | 38 |
| Hóa đơn lệch | 38 |
| Nhân viên lệch | **7** |
| Tổng Δ (primary + support×50%) | **−1.579.000** (net: hệ thống đang dư so với công thức đúng) |

## 10. Bảng đối chiếu nhân viên lệch

`delta = lương dịch vụ đúng − lương dịch vụ hiện tại`  
(âm = đang trả dư; dương = đang trả thiếu)

| Nhân viên | CN | HĐ | HH hiện tại | HH đúng | Chênh lệch |
|-----------|----|----|-------------|---------|------------|
| Chị 7 | Sóc Trăng (+CN khác) | 46 | 909.800 | 360.200 | **−549.600** |
| Bảo Trân | Sóc Trăng (+CN khác) | 33 | 659.700 | 339.100 | **−320.600** |
| Ly Ly | Sóc Trăng (+Trạm) | 46 | 782.400 | 507.600 | **−274.800** |
| Kim Quyên | Sóc Trăng | 28 | 488.400 | 213.600 | **−274.800** |
| Thuý An | Sóc Trăng | 18 | 381.000 | 152.000 | **−229.000** |
| Thảo Cầm | Bạc Liêu | 33 | 1.691.800 | 1.726.700 | **+34.900** |
| Kim Yến | Bạc Liêu | 31 | 1.283.000 | 1.317.900 | **+34.900** |

File CSV đầy đủ: `docs/uat-evidence/COMMISSION_FORMULA_JUL_P2_EMPLOYEES.csv`

## Phương án sửa đề xuất (chưa làm)

1. **Code policy:** thêm `body-75` + token tên `body 75` vào nhóm 0% tiered.
2. **Rule Bạc Liêu:** Chuyên sâu = 30% (policy riêng hoặc `branch_service_prices`).
3. **Đồng bộ bảng giá flat CN:** mọi dịch vụ TV/BL/VL = 20% (tránh seed STANDARD 0/10 đè lên flat); BL Chuyên sâu = 30%.
4. **Backfill Kỳ 2/7 (nếu được duyệt):** recalc `commissionPercent`/`commissionAmount` trên 38 dòng lệch; sau đó đối chiếu lại payroll / close.
5. **Quy trình close:** kỳ đã submit/approved cần quy trình điều chỉnh tường minh, không “âm thầm” đổi snapshot.

## Rủi ro

- Sửa chỉ code → kỳ cũ vẫn sai trên HĐ đã lưu.
- Backfill HĐ → đổi số lương hiển thị / đã chốt; cần audit trail.
- Nếu ưu tiên `branch_service_prices` hiện tại của Bạc Liêu (Body = 0%, Chuyên sâu = 10%) thay vì flat 20%/30% → **sai nặng hơn** so với công thức user.
- Support 50% sẽ nhân theo HH đã sửa.
- Tip không nằm trong lệch này (vẫn 100% primary).

---

**Kết luận:** Lỗi xác nhận được. Nguyên nhân chính Kỳ 2/7 là **Body 75 thiếu trong nhóm 0%** (Sóc Trăng tính dư ~1,65tr) và **thiếu rule Chuyên sâu 30% Bạc Liêu** (tính thiếu ~70k). Chờ duyệt mới sửa.
