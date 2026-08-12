# Sống Khoẻ catalog Aug2026 — Preview UAT + báo cáo chờ duyệt cuối

| Field | Value |
|-------|-------|
| Branch | `song-khoe-spa` |
| Preview flag | `VITE_SONG_KHOE_CATALOG_PREVIEW=1` (local Vite) |
| Commit | **CHƯA** |
| Deploy | **CHƯA** |
| UAT form Invoice | **PASS** |
| Video | `docs/uat-evidence/song-khoe-price-aug2026/preview-uat-video/song-khoe-preview-uat-1786510141769.webm` |

## 15 dịch vụ sau apply (giá / % HH)

| # | serviceId | Tên | Giá | % HH | Thao tác |
|---|-----------|-----|----:|-----:|----------|
| 1 | body-60 | Massage Body 60 phút – không đá nóng | 190.000 | 0 | RENAME_LABEL (giá giữ) |
| 2 | body-75 | Massage Body 75 phút – đá nóng lưng | 230.000 | 0 | RENAME_LABEL (giá giữ) |
| 3 | body-90 | Massage Body 90 phút – đá nóng lưng + chân | 250.000 | 0 | RENAME_LABEL (giá giữ) |
| 4 | goi-sach | Gội đầu thư giãn 30 phút | 70.000 | 20 | RENAME_LABEL (giá giữ) |
| 5 | goi-duong-sinh | Gội đầu dưỡng sinh 60 phút | 130.000 | 20 | RENAME_LABEL (giá giữ) |
| 6 | cao-mat | Cạo mặt + lột mụn + đắp mặt nạ 30 phút | 50.000 | 20 | RENAME_LABEL (giá giữ) |
| 7 | chuyen-sau | Chuyên sâu 90 phút | 350.000 | 10 | RENAME_LABEL (giá giữ) |
| 8 | combo-1 | Combo 1 – Massage 60P + Gội đầu 30P | 260.000 | 10 | **INSERT** |
| 9 | combo-2 | Combo 2 – Massage 75P + Giác hơi | 280.000 | 10 | **INSERT** |
| 10 | combo-3 | Combo 3 – Massage 90P + Gội đầu 30P + Giác hơi | 370.000 | 10 | **INSERT** |
| 11 | foot | Massage chân 30 phút | 100.000 | 0 | RENAME_LABEL (giá giữ) |
| 12 | co-vai-gay | Trị liệu Cổ, Vai gáy 60 phút | 150.000 | 0 | RENAME_LABEL (giá giữ) |
| 13 | giac-hoi | Giác hơi / Cạo gió 30 phút | 50.000 | 20 | RENAME_LABEL (giá giữ) |
| 14 | dap-thuoc | Đắp thuốc thảo dược / Xông ngải cứu | 30.000 | 20 | **INSERT** |
| 15 | phong-don | Phụ thu phòng đơn | 40.000 | 20 | RENAME_LABEL (giá giữ) |

- **INSERT:** combo-1, combo-2, combo-3, dap-thuoc  
- **Chỉ đổi label:** 11 dịch vụ còn lại (không rewrite giá/%; không fake audit)  
- **Không đổi:** % HH / payrollEngine / hỗ trợ liên CN  

## Form Invoice (Preview)

| Check | Result |
|-------|--------|
| Đủ 15 dịch vụ, không trùng | PASS |
| Giá đúng (Body 60 = 190k, không 189k) | PASS |
| Combo 1/2/3 + Đắp thuốc hiện | PASS |
| Snapshot: servicePrice / % / commissionAmount | PASS (VD Combo1 260k · 10% · 26k; Đắp thuốc 30k · 20% · 6k) |
| branchId = song-khoe-spa | PASS |
| Cross-branch Trạm / Sóc Trăng reload, không leak giá SK | PASS |
| Catalog CN khác (local) không đổi cấu trúc | PASS |

## An toàn dữ liệu nghiệp vụ

| Check | Result |
|-------|--------|
| 38 HĐ Sống Khoẻ từ 01/08 | **Không đổi** (vẫn 38, 0 lệch giá) |
| HĐ trước 01/08 | Không đụng |
| Tips / payment / payroll / báo cáo lịch sử | Không rewrite HĐ |
| Giá CN khác (Sóc Trăng/Trạm/Bạc Liêu mẫu) | **Còn đúng** (189k / 160k / …) |

## CẢNH BÁO ĐỒNG BỘ (quan trọng)

Preview và Production **cùng một Supabase**. Trong phiên UAT local, `pushLocalToSupabase` / upsert catalog đã **ghi `branch_catalogs` + `branch_service_prices`** lúc `2026-08-12T04:48:46Z` (timestamp đồng loạt nhiều CN).

- Nội dung Sống Khoẻ sau ghi: **đúng** bảng giá mới + 4 dịch vụ INSERT + label chuẩn.  
- Spot-check giá CN khác: **không lệch** so với kỳ vọng.  
- **Không** sửa invoice.  

Đã bổ sung chặn: khi `VITE_SONG_KHOE_CATALOG_PREVIEW=1` thì **bỏ qua push** `serviceCatalogV2` (tránh lặp lại).

## File sẽ commit (khi được duyệt)

- `src/constants/defaultPriceGroups.js`
- `src/constants/catalogPriceSeeds.js`
- `src/utils/songKhoeCatalogAug2026Preview.js`
- `src/App.jsx`
- `src/utils/supabaseSync.js` (preview sticky + chặn push catalog)
- `scripts/audit-song-khoe-prices-aug2026-readonly.mjs`
- `scripts/apply-song-khoe-prices-aug2026.mjs`
- `scripts/playwright-song-khoe-catalog-preview-uat.mjs`
- `docs/uat-evidence/song-khoe-price-aug2026/`

## Quyết định chờ duyệt cuối

1. Chấp nhận catalog Sống Khoẻ đã có trên DB (đúng mục tiêu) hay cần rollback/label-only?  
2. **Commit** các file trên?  
3. **Deploy** production bundle (seed + guard)?  

**Hiện tại: CHƯA COMMIT · CHƯA DEPLOY thêm.**
