# Báo cáo deploy — Payroll 4 hạng mục (bỏ Điều chỉnh khác)

**Trạng thái: ĐÃ DEPLOY — CHỜ ANH KIỂM TRA**

Không tự kết luận PASS nghiệp vụ. Anh cần kiểm tra trực tiếp trên Production.

---

## Commit / Build / URL

| Mục | Giá trị |
|-----|---------|
| Commit | `48ea9743dfe221f5a0681fb1374d76fd51c1ca8d` |
| Deployment ID (GitHub) | `5765203601` |
| Deployment ID (Vercel) | `BX8r27prRNp453595pphh7oYkyDm` |
| Asset JS | `/assets/index-C1ePrMqc.js` |
| Build status | **Ready** (success) |
| Production | https://www.khoespa.net.vn |
| Migration chạy lại | **Không** — không chạy lại `migrate-thu-huong-other-to-advance.mjs` |
| Rollback | **Không** chạy |

---

## Phạm vi đã deploy

- Popup **Sửa bảng lương**: chỉ Thưởng · KPI · Phạt · Ứng lương (SET tổng; cột Hiện tại = `payrollRow`)
- Ví / bảng / footer / Excel-PDF mới / nhập mới: **không** còn Điều chỉnh khác
- Công thức net: **không** cộng `otherAdjustment` (giữ `baseSalary` / `reduction` như engine hiện có)
- Audit + bản ghi legacy ĐC trong DB: **giữ** (profile có thể hiện legacy nếu còn dòng amount=0)

**Không** gồm: work-inbox, invoice-edit, backfill NV khác, sửa tháng 7, xóa audit, rollback.

---

## Thu Hương · Bạc Liêu · Aug K1 (đối chiếu Production)

| Hạng mục | Giá trị |
|----------|--------:|
| Thưởng | 500.000 |
| KPI | 0 |
| Phạt | 0 |
| Ứng lương | 500.000 |
| Điều chỉnh khác | 0 |
| Lương thực nhận | **−565.400** |

Δ so baseline trước cả gói: −500.000 (bỏ cộng ĐC) + −500.000 (thêm trừ Ứng) = **−1.000.000**.

**Chỉ duy nhất Thu Hương bị ảnh hưởng** (legacy OA ≠ 0 toàn hệ = 0).

Evidence data: `PROD_DATA_VERIFY_4FIELDS.json`

---

## Smoke Production (automation)

Script: `scripts/playwright-payroll-4fields-prod-smoke.mjs`  
Report: `docs/uat-evidence/admin-payroll-board-prod/PROD_SMOKE_4FIELDS_REPORT.json`  
Ảnh: `docs/uat-evidence/admin-payroll-board-prod/shots-4fields/`  
(Popup 4 hạng mục: `02-thu-huong-popup-4fields.png`)

| # | Kiểm tra | Kết quả automation |
|---|----------|-------------------|
| 1 | Popup chỉ 4 hạng mục | OK |
| 2 | Không “Điều chỉnh khác” trên ví/popup | OK |
| 3 | Thu Hương bind Hiện tại = bảng | OK |
| 4 | Thu Hương: Thưởng 500k · Ứng 500k · Net −565.400 | OK |
| 5 | Trúc Ly Jul K1: Phạt/Ứng khớp popup | OK |
| 6 | ≥5 NV khác popup 4 field | OK (Ly Ly, Bảo Trân, Kim Quyên, Thanh Thư, Thảo Cầm) |
| 7 | Legacy OA ≠ 0 toàn hệ | 0 (data verify) |
| 8 | QL / NV không thấy Sửa bảng lương | OK |
| 9 | Audit không nút Xóa | OK |

**Smoke automation: OK** — vẫn **chờ anh kiểm tra trực tiếp**. Không tự kết luận PASS.

---

## Anh kiểm tra trên Production

1. Hard refresh (Cmd+Shift+R) → asset `index-C1ePrMqc.js`
2. Admin → Lương → Bạc Liêu → Thu Hương → **Sửa bảng lương**
3. Xác nhận 4 hạng mục · không ĐC · số khớp · Net −565.400
4. Trúc Ly / vài NV khác · QL/NV không có nút sửa

Rollback chỉ khi anh xác nhận:  
`CONFIRM_ROLLBACK=1 npx vite-node --env-file=.env.development.local scripts/rollback-thu-huong-other-to-advance.mjs`
