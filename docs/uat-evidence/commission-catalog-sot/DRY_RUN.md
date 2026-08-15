# Dry-run đồng bộ % hoa hồng catalog — CHƯA GHI PRODUCTION

Generated: 2026-08-15T18:46:48.810Z

Nguồn: snapshot production read-only 16/08/2026. Script này không UPDATE `branch_service_prices`.

## Tổng (chi nhánh được phép sync)

| Metric | Số |
|--------|----|
| Dòng sẽ đổi | 31 |
| Dòng không đổi | 60 |
| Ambiguous | 0 |
| Gia Lai BLOCKED (đủ audit) | 68 |

## Gia Lai — BLOCKED

- Rule 40% chỉ có trong `src/constants/commissionPolicyTypes.js` (`FLAT_40_BRANCH_IDS`).
- UI catalog đang 0/10/20.
- Không thấy HĐ Gia Lai trong mẫu điều tra.
- **Không sync 40%** cho đến khi owner duyệt.

## Dòng sẽ đổi

| Chi nhánh | Dịch vụ | UI hiện tại | Rule chuẩn | Sau sync |
|---|---|---|---|---|
| bac-lieu | Body 60 (body-60) | 0 | 20 | 20 |
| bac-lieu | Body 75 (body-75) | 0 | 20 | 20 |
| bac-lieu | Body 90 (body-90) | 0 | 20 | 20 |
| bac-lieu | Chuyên sâu (chuyen-sau) | 29 | 30 | 30 |
| bac-lieu | Cổ vai gáy (co-vai-gay) | 0 | 20 | 20 |
| bac-lieu | Combo 1 (combo-1) | 10 | 20 | 20 |
| bac-lieu | Combo 2 (combo-2) | 10 | 20 | 20 |
| bac-lieu | Combo 3 (combo-3) | 10 | 20 | 20 |
| bac-lieu | Foot (foot) | 0 | 20 | 20 |
| bac-lieu | Xông hơi (xong-hoi) | 0 | 20 | 20 |
| soc-trang | Xông hơi (xong-hoi) | 0 | 20 | 20 |
| tra-vinh | Body 60 (body-60) | 0 | 20 | 20 |
| tra-vinh | Body 75 (body-75) | 0 | 20 | 20 |
| tra-vinh | Body 90 (body-90) | 0 | 20 | 20 |
| tra-vinh | Chuyên sâu (chuyen-sau) | 10 | 20 | 20 |
| tra-vinh | Cổ vai gáy (co-vai-gay) | 0 | 20 | 20 |
| tra-vinh | Combo 1 (combo-1) | 10 | 20 | 20 |
| tra-vinh | Combo 2 (combo-2) | 10 | 20 | 20 |
| tra-vinh | Combo 3 (combo-3) | 10 | 20 | 20 |
| tra-vinh | Foot (foot) | 0 | 20 | 20 |
| tra-vinh | Xông hơi (xong-hoi) | 0 | 20 | 20 |
| vinh-long | Body 60 (body-60) | 0 | 20 | 20 |
| vinh-long | Body 75 (body-75) | 0 | 20 | 20 |
| vinh-long | Body 90 (body-90) | 0 | 20 | 20 |
| vinh-long | Chuyên sâu (chuyen-sau) | 10 | 20 | 20 |
| vinh-long | Cổ vai gáy (co-vai-gay) | 0 | 20 | 20 |
| vinh-long | Combo 1 (combo-1) | 10 | 20 | 20 |
| vinh-long | Combo 2 (combo-2) | 10 | 20 | 20 |
| vinh-long | Combo 3 (combo-3) | 10 | 20 | 20 |
| vinh-long | Foot (foot) | 0 | 20 | 20 |
| vinh-long | Xông hơi (xong-hoi) | 0 | 20 | 20 |

## Dòng không đổi (rút gọn)

- tram-spa: 12 dòng đã đúng rule
- soc-trang: 15 dòng đã đúng rule
- song-khoe-spa: 15 dòng đã đúng rule
- bac-lieu: 6 dòng đã đúng rule
- tra-vinh: 6 dòng đã đúng rule
- vinh-long: 6 dòng đã đúng rule
