# UAT — Chuyển ĐC Thu Hương → Ứng lương (hướng 2)

**Trạng thái: PASS local · CHƯA DEPLOY**

Lý do audit: *Chuyển khoản nhập nhầm từ Điều chỉnh khác sang Ứng lương theo ghi chú ngày 04/08.*

---

## Trước → Sau (Thu Hương · Bạc Liêu · 2026-08 Kỳ 1)

| Hạng mục | Trước | Sau | Δ |
|----------|------:|----:|--:|
| Thưởng | 500.000 | 500.000 | 0 |
| KPI | 0 | 0 | 0 |
| Phạt | 0 | 0 | 0 |
| Ứng lương | 0 | **500.000** | **+500.000** |
| Điều chỉnh khác | **500.000** | **0** | **−500.000** |
| Lương thực nhận | −65.400 | **−565.400** | **−500.000** |
| Doanh thu / Tips / HH | giữ | giữ | 0 |

## Xử lý dữ liệu

- Bản ghi ĐC cũ `payadj-1785867587565-martmn`: **amount → 0**, **không xóa**
- Thêm dòng Ứng lương mới (SET tổng 0 → 500.000)
- Audit: `payroll_adjustment` update · `payroll_field` · `migrate_other_to_advance`

## Kiểm tra bắt buộc

| Check | |
|-------|--|
| ĐC = 0 | PASS |
| Ứng +500.000 | PASS |
| Net −500.000 (so với trước chuyển, công thức 4 field) | PASS |
| Thưởng / KPI / Phạt / DT / Tips / HH không đổi | PASS |
| Legacy toàn hệ (Jul K1/K2 + Aug K1) ĐC ≠ 0 | **0** PASS |
| Bản ghi cũ vẫn còn (amount 0) | PASS |

## Evidence

`docs/uat-evidence/admin-payroll-board-local/set-totals/remove-other-adjustment/migrate-thu-huong/`

- `BEFORE.json` · `AFTER.json`
- `THU_HUONG_BEFORE_AFTER.csv`
- `MIGRATE_UAT_REPORT.json`

## Phạm vi code (đã sẵn sàng, chưa deploy)

Đã bỏ ĐC khỏi popup / ví / footer / Excel-PDF mới / nhập mới / công thức net.  
Lịch sử DB + audit vẫn truy vết.

## Lưu ý Production

So với **Production cũ** (còn cộng ĐC vào net ≈ 434.600): sau khi deploy **cả** bỏ ĐC khỏi công thức **và** chuyển sang Ứng, net ≈ **−565.400** → Δ khoảng **−1.000.000** so với prod cũ (mất +ĐC và thêm −Ứng đúng nghiệp vụ).

So với **local trước chuyển** (đã bỏ ĐC khỏi công thức): net giảm đúng **500.000** như yêu cầu UAT.

---

**Xin phép deploy Production** sau khi anh xác nhận số liệu trên.
