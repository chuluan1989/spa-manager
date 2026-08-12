# Audit bảng giá Sống Khoẻ (READ-ONLY)

| Field | Value |
|-------|-------|
| Branch ID | `song-khoe-spa` |
| Branch name | Sống Khoẻ Spa |
| Hiệu lực nghiệp vụ | 2026-08-01 |
| Credential | production_bundle |
| generatedAt | 2026-08-12T04:49:23.837Z |

## Giới hạn kiến trúc

**Không có `effective_from` / version giá theo ngày.**

- Cập nhật catalog → chỉ ảnh hưởng form HĐ mới (giá hiện tại).
- HĐ lịch sử giữ snapshot `price` / `servicePrice` / `commission*` trên từng line.
- Không tự xây kiến trúc versioning lớn trong lần này.

## Catalog hiện tại vs bảng giá mới

| serviceId | Hiện tại | Giá mới | Trạng thái | commission% (giữ) |
|-----------|---------:|--------:|------------|-------------------|
| body-60 | 190000 | 190000 | MATCH | 0 |
| body-75 | 230000 | 230000 | MATCH | 0 |
| body-90 | 250000 | 250000 | MATCH | 0 |
| goi-sach | 70000 | 70000 | MATCH | 20 |
| goi-duong-sinh | 130000 | 130000 | MATCH | 20 |
| cao-mat | 50000 | 50000 | MATCH | 20 |
| chuyen-sau | 350000 | 350000 | MATCH | 10 |
| combo-1 | 260000 | 260000 | MATCH | 10 |
| combo-2 | 280000 | 280000 | MATCH | 10 |
| combo-3 | 370000 | 370000 | MATCH | 10 |
| foot | 100000 | 100000 | MATCH | 0 |
| co-vai-gay | 150000 | 150000 | MATCH | 0 |
| giac-hoi | 50000 | 50000 | MATCH | 20 |
| dap-thuoc | 30000 | 30000 | MATCH | 20 |
| phong-don | 40000 | 40000 | MATCH | 20 |

## Hóa đơn 2026-08-01 → 2026-08-12

| Metric | Count |
|--------|------:|
| Tổng HĐ | 38 |
| HĐ khớp giá mới (mọi line map được) | 38 |
| HĐ còn line giá cũ / lệch | 0 |
| HĐ không map được service | 0 |
| Line lệch | 0 |
| Chênh lệch doanh thu nếu sửa hết line lệch | 0đ |
| HĐ lệch thuộc kỳ lương **approved** (KHÔNG tự sửa) | 0 |
| HĐ lệch có thể đề xuất sửa an toàn | 0 |

### Phân bố giá snapshot trên HĐ (01/08 → nay)

| serviceKey | Tên trên HĐ | Giá snapshot | Số line |
|------------|-------------|-------------:|--------:|
| body-60 | Body 60 60' | 190000 | 18 |
| phong-don | Phòng đơn | 40000 | 17 |
| giac-hoi | Giác hơi | 50000 | 12 |
| co-vai-gay | Cổ vai gáy | 150000 | 6 |
| body-75 | Body 75 75' | 230000 | 6 |
| body-90 | Body 90 90' | 250000 | 5 |
| chuyen-sau | Chuyên sâu | 350000 | 2 |
| foot | Foot | 100000 | 2 |
| goi-sach | Gội sạch | 70000 | 2 |

### Lệch theo dịch vụ

| serviceId | Giá mới | Số line lệch | Giá cũ (tần suất) | Δ doanh thu |
|-----------|--------:|-------------:|-------------------|------------:|
| — | — | 0 | — | 0 |

## Đề xuất tiếp theo (CHƯA APPLY)

1. Preview: cập nhật seed + `branch_service_prices` chỉ `song-khoe-spa` (chỉ `price`, giữ `commission_percent`).
2. UAT form HĐ Sống Khoẻ tải giá mới; đổi CN → catalog đúng.
3. HĐ `date < 2026-08-01`: **không đụng**.
4. HĐ `>= 2026-08-01` lệch + **không** approved: script map theo serviceId/name, chỉ sửa giá line, giữ tips/%/NV/CN, recompute commissionAmount + totals helper chuẩn.
5. HĐ lệch + kỳ **approved**: liệt kê cho Admin (adjustment/audit) — không tự sửa.

Chi tiết JSON: `/Users/chuluan/Spa-manager/docs/uat-evidence/song-khoe-price-aug2026/SONG_KHOE_PRICE_AUDIT_READONLY.json`
