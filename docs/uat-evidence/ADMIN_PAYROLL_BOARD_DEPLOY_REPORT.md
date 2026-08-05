# Báo cáo deploy — Admin Payroll Board

**Trạng thái: ĐÃ DEPLOY — CHỜ ANH KIỂM TRA**

Không tự kết luận hoàn thành nghiệp vụ. Anh cần kiểm tra trực tiếp nút và thao tác trên Production.

---

## Commit / Build / URL

| Mục | Giá trị |
|-----|---------|
| Commit (feature) | `857531c8adc7fcd05e83f8ee42d76e5ec4927255` |
| Commit (build fix) | `9999ae0ca8af42b559f6c323a484a197499cf60a` |
| Deployment ID (GitHub) | `5759353677` |
| Deployment ID (Vercel) | `dpl_F9oaqhqUDXsTPmVniLgcHDf5Ftf8` |
| Asset JS | `/assets/index-D7HF_zY6.js` |
| Build status | **Ready** (success) |
| Production | https://www.khoespa.net.vn |
| Migration | **Không có** — không chạy migration |

Deploy lần 1 (`857531c` / `dpl_BofveD1u…`) **fail build** do import WIP `notifyPayrollSourceChanged`. Đã sửa dùng `invalidateCloseAfterSourceChange` đã có trên main → `9999ae0` Ready.

---

## Phạm vi đã deploy

- Toolbar Admin: KPI · Sửa bảng lương · (Đối soát Excel / Tóm tắt PDF giữ nguyên)
- KPI ± / 0 + lý do + preview
- Sửa bảng lương: KPI / thưởng / phạt / ứng / điều chỉnh ± + lý do + preview
- Audit cấu trúc (`payroll_field`) — **không nút Xóa**
- KPI vào net lương (`payrollEngine`)
- Skip ghi lại dòng không đổi khi lưu board

**Không** gồm: work-inbox, invoice-edit, backfill, sửa HĐ, công thức HH, tháng 7, xóa audit.

---

## Smoke Production (Aug UAT — Ly Ly P1)

Script: `scripts/playwright-admin-payroll-board-prod-smoke.mjs`  
Evidence: `docs/uat-evidence/admin-payroll-board-prod/PROD_SMOKE_REPORT.json`  
Cleanup: `PROD_CLEANUP_REPORT.json` + `shots/`

| # | Kiểm tra | Kết quả |
|---|----------|---------|
| 1 | Admin thấy KPI + Sửa bảng lương | PASS |
| 2 | KPI +100.000 → net +100.000 (1.669.400) | PASS |
| 3 | KPI −100.000 → net đúng (1.469.400) | PASS |
| 4 | KPI 0 → loại tác động, audit còn | PASS |
| 5 | Sửa thưởng/phạt/ứng/ĐC → net đúng sau reload (1.609.400) | PASS |
| 6 | DT / Tips / HH không đổi | PASS |
| 7 | Bảng tổng = chi tiết (net khớp kỳ vọng) | PASS |
| 8 | QL / NV UAT không thấy hai nút | PASS |
| 9 | Kỳ chốt: hai nút disabled | PASS |
| 10 | Audit không Xóa + meta cấu trúc | PASS |

**Smoke 10/10 PASS** (trước hoàn tác).

### Dữ liệu trước / test / sau hoàn tác (Ly Ly · 08/2026 · Kỳ 1)

| Thời điểm | Net | KPI | Ghi chú |
|-----------|-----|-----|--------|
| Trước smoke | 1.569.400 | 0 | DT 2.525.000 · Tips 1.435.000 · HH 134.400 |
| Sau multi test | 1.609.400 | 0 | +40k thưởng −10k phạt −5k ứng +15k ĐC |
| Sau hoàn tác | **1.569.400** | **0** | Thưởng/phạt/ứng/ĐC = 0; audit giữ |

Hoàn tác bằng đưa amount → 0 trên Sửa bảng lương + KPI 0 (có lý do audit). **Không xóa** bản ghi lịch sử.

Lần revert trong smoke script đầu bị race (đọc dòng edit board quá sớm → 0 dòng). Đã chạy cleanup riêng: `PROD_CLEANUP_REPORT.json` → `ok: true`.

### Tháng 7

Chỉ mở xem UI tháng 7 trong smoke — **không sửa**. Không backfill / không đụng kỳ vận hành July.

---

## Ảnh Production

Thư mục: `docs/uat-evidence/admin-payroll-board-prod/shots/`

- `toolbar.png` — hai nút Admin
- `kpi-100000.png` / `kpi--100000.png` / `kpi-0.png` — popup KPI
- `edit-board.png` — popup Sửa bảng lương
- `audit.png` — Nhật ký (không Xóa)
- `manager.png` — QL không thấy nút
- `after-cleanup.png` — sau hoàn tác

---

## Xác nhận kỹ thuật

1. Build Ready; asset mới trên `www.khoespa.net.vn`.
2. Không migration.
3. Smoke 10/10 PASS; dữ liệu UAT Aug đã hoàn tác sạch.
4. Không ảnh hưởng thao tác ghi tháng 7 trong quy trình này.

**ĐÃ DEPLOY — CHỜ ANH KIỂM TRA**
