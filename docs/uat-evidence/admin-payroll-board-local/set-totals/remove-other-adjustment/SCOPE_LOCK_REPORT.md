# Khóa phạm vi — bỏ “Điều chỉnh khác” khỏi vận hành

**Trạng thái: LOCAL UAT PASS — CHƯA DEPLOY — chờ anh duyệt deploy**

Đã chốt hướng 2: chuyển 500k Thu Hương ĐC → Ứng, rồi khóa ĐC khỏi vận hành.

Xem chi tiết chuyển: [`migrate-thu-huong/MIGRATE_UAT_REPORT.md`](./migrate-thu-huong/MIGRATE_UAT_REPORT.md)

---

## Thu Hương — sau chuyển (Aug K1 Bạc Liêu)

| | Trước chuyển | Sau chuyển |
|--|-------------:|-----------:|
| Thưởng | 500.000 | 500.000 |
| ĐC | 500.000 | **0** |
| Ứng | 0 | **500.000** |
| Net (công thức 4 field) | −65.400 | **−565.400** (Δ −500k) |

Bản ghi ĐC cũ giữ amount=0 (không xóa). Audit đầy đủ.

## Legacy toàn hệ sau xử lý

Jul K1 / Jul K2 / Aug K1: **0** nhân viên có ĐC ≠ 0.

## 4 hạng mục vận hành (local)

Popup / ví / footer / Excel-PDF mới / nhập mới / công thức net — không còn ĐC.

Bind audit 4 field: mismatch **0** (`POPUP_BIND_AUDIT_4FIELDS.csv`).

## Deploy

Chỉ deploy khi anh xác nhận UAT migrate + khóa phạm vi.
