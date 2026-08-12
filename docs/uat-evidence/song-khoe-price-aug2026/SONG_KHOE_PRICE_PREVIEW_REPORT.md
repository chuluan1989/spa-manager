# Cập nhật bảng giá Sống Khoẻ — báo cáo giai đoạn Preview (CHƯA commit / CHƯA deploy / CHƯA sửa production data)

| Field | Value |
|-------|-------|
| Branch ID (canonical) | `song-khoe-spa` |
| Branch name (DB) | Sống Khoẻ Spa |
| price_group_id | `song-khoe-spa` |
| Hiệu lực nghiệp vụ | **2026-08-01** |
| Audit | READ-ONLY — `docs/uat-evidence/song-khoe-price-aug2026/` |
| Commit / Deploy / Prod write | **CHƯA** |

## 1. Kiến trúc `effective_from`

**Hệ thống KHÔNG hỗ trợ version giá theo ngày** (`effective_from` / price history theo hiệu lực).

Giới hạn:

- Cập nhật catalog = giá hiện tại cho form HĐ mới.
- HĐ cũ giữ snapshot trên từng line (`price` / `servicePrice` / `%` / `commissionAmount`).
- Không tự xây kiến trúc versioning lớn trong lần này.

## 2. Code Preview đã chuẩn bị (local only)

| File | Thay đổi |
|------|----------|
| `src/constants/defaultPriceGroups.js` | Seed Sống Khoẻ: đủ 15 dịch vụ, giá mới, **giữ** `commissionPercent` (0/10/20) |
| `src/constants/catalogPriceSeeds.js` | Bổ sung map flat Combo / Đắp thuốc cho nhóm Sống Khoẻ |
| `scripts/audit-song-khoe-prices-aug2026-readonly.mjs` | Audit READ-ONLY HĐ + catalog |
| `scripts/apply-song-khoe-prices-aug2026.mjs` | Dry-run / apply có chặn production; chỉ `song-khoe-spa`; chỉ đổi `price`, giữ `%` |

**Không** đụng seed/giá: Sóc Trăng, Trạm Spa, Bạc Liêu, Trà Vinh, Vĩnh Long, Gia Lai, khác.

## 3. Catalog production hiện tại (READ-ONLY)

11 duration đang có — **giá đã khớp** bảng mới:

| serviceId | Giá DB | Giá yêu cầu | % hoa hồng (giữ) |
|-----------|-------:|------------:|-----------------:|
| body-60 | 190.000 | 190.000 | 0 |
| body-75 | 230.000 | 230.000 | 0 |
| body-90 | 250.000 | 250.000 | 0 |
| goi-sach | 70.000 | 70.000 | 20 |
| goi-duong-sinh | 130.000 | 130.000 | 20 |
| cao-mat | 50.000 | 50.000 | 20 |
| chuyen-sau | 350.000 | 350.000 | 10 |
| foot | 100.000 | 100.000 | 0 |
| co-vai-gay | 150.000 | 150.000 | 0 |
| giac-hoi | 50.000 | 50.000 | 20 |
| phong-don | 40.000 | 40.000 | 20 |

**Thiếu trong catalog** (cần thêm khi apply Preview/Prod sau duyệt):

| serviceId | Giá mới | % seed (không copy CN khác) |
|-----------|--------:|----------------------------:|
| combo-1 | 260.000 | 10 |
| combo-2 | 280.000 | 10 |
| combo-3 | 370.000 | 10 |
| dap-thuoc | 30.000 | 20 |

Tên hiển thị trên catalog hiện vẫn dạng ngắn (`Body 60`, `Gội sạch`…). Seed Preview đã đổi sang tên đầy đủ theo bảng giá mới — sẽ áp khi upsert `branch_catalogs` (chỉ CN này).

## 4. Audit HĐ `branchId=song-khoe-spa` & `date >= 2026-08-01`

| Metric | Kết quả |
|--------|--------:|
| Tổng HĐ | **38** |
| HĐ đúng giá mới (mọi line map được) | **38** |
| HĐ còn giá cũ / lệch | **0** |
| Line lệch | **0** |
| Δ doanh thu nếu sửa | **0đ** |
| HĐ lệch thuộc kỳ lương `approved` | **0** |

Phân bố snapshot (top): Body 60 @190k (18), Phòng đơn @40k (17), Giác hơi @50k (12), Cổ vai gáy @150k (6), Body 75 @230k (6), Body 90 @250k (5), …

→ **Không cần rewrite HĐ từ 01/08** cho đợt giá này.

## 5. HĐ `date < 2026-08-01`

**Không đụng** (giữ nguyên snapshot giá / % / commission / payroll).

## 6. Đề xuất phương án an toàn (chờ duyệt trước khi APPLY)

1. **Preview UAT**
   - Dry-run: `node --env-file=.env.preview.local scripts/apply-song-khoe-prices-aug2026.mjs`
   - Apply preview (khi có env tách / được phép): thêm 4 dịch vụ thiếu + rename label; upsert giá chỉ `song-khoe-spa`; **không** đổi `commission_percent` đang có.
2. **Form HĐ**
   - Chọn CN Sống Khoẻ → picker load catalog CN đó (không hard-code).
   - Đổi CN phục vụ → reload catalog theo `branchId` (flow hiện có).
3. **Production**
   - Chỉ sau UAT + duyệt chủ dự án.
   - Không sửa HĐ lịch sử; không sửa HĐ 01/08→nay (đã khớp).
4. Nếu sau này phát sinh HĐ lệch giá mới:
   - Map `serviceId`/tên → chỉ sửa giá line thuộc bảng Sống Khoẻ.
   - Giữ tips, paymentMethod, NV, branchId, **%**.
   - Recompute `commissionAmount` + totals bằng helper chuẩn.
   - HĐ thuộc kỳ `approved` → **liệt kê Admin**, không tự sửa.

## 7. Việc chưa làm (đúng theo yêu cầu)

- [ ] Commit
- [ ] Deploy
- [ ] Ghi production DB
- [ ] Sửa invoice bất kỳ
