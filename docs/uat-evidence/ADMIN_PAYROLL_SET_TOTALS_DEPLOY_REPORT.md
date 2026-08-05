# Báo cáo deploy — Admin Payroll SET totals

**Trạng thái: ĐÃ DEPLOY — CHỜ ANH KIỂM TRA**

Không tự kết luận PASS nghiệp vụ. Anh cần kiểm tra trực tiếp trên Production.

---

## Commit / Build / URL

| Mục | Giá trị |
|-----|---------|
| Commit | `b1b09ba1083f359a518da45745a67939bfbf2505` |
| Deployment ID (GitHub) | `5760477227` |
| Deployment ID (Vercel) | `dpl_5cTMYe8KZ8d558NLUi8kMKRKJppy` |
| Asset JS | `/assets/index-DAjg_2MZ.js` |
| Build status | **Ready** (success) |
| Production | https://www.khoespa.net.vn |
| Migration | **Không có** — không chạy migration |

---

## Phạm vi đã deploy

- Toolbar Admin chỉ còn: **Sửa bảng lương** · **Đối soát Excel** · **Tóm tắt PDF** (bỏ nút KPI riêng)
- Popup **Sửa bảng lương** = SET giá trị tổng: Thưởng · KPI · Phạt · Ứng lương · Điều chỉnh khác
- KPI ngang hàng, nhận +, −, 0
- Admin nhập số cuối cùng muốn thấy (không cộng chồng dòng phát sinh)
- Audit chỉ field đổi: cũ / mới / chênh lệch tác động lương / lý do / người / thời gian
- **Không** nút Xóa audit

**Không** gồm: work-inbox, invoice-edit, backfill, sửa HĐ, công thức HH, tháng 7, snapshot/close ngoài thao tác người dùng.

---

## Smoke Production (Aug UAT — Ly Ly · Kỳ 1)

Script: `scripts/playwright-admin-payroll-board-prod-smoke.mjs`  
Evidence: `docs/uat-evidence/admin-payroll-board-prod/PROD_SMOKE_SET_TOTALS_REPORT.json`  
Ảnh: `docs/uat-evidence/admin-payroll-board-prod/shots-set-totals/`

| # | Kiểm tra | Kết quả |
|---|----------|---------|
| 1 | Toolbar 3 nút, không KPI riêng | PASS |
| 2 | Popup SET (Hạng mục / Hiện tại / Mới) | PASS |
| 3 | Phạt 600k → 200k · net +400k · reload | PASS |
| 4 | Thưởng 0 → 500k · net +500k | PASS |
| 5 | KPI 0 → +300k → −200k → 0 | PASS |
| 6 | Ứng 1.000k → 700k · net +300k | PASS |
| 7 | ĐC 0 → −100k · net −100k | PASS |
| 8 | DT / Tips / HH không đổi | PASS |
| 9 | Reload giữ đúng · bảng tổng/chi tiết net nhất quán | PASS |
| 10 | Audit không Xóa + “Chênh lệch tác động lương” | PASS |
| 11 | Hoàn tác SET về 0 (baseline 1.569.400, giữ audit) | PASS |
| 12 | QL / NV không thấy Sửa bảng lương | PASS |

**Smoke automation: OK** — vẫn **chờ anh kiểm tra trực tiếp**.

### Dữ liệu (Ly Ly · 08/2026 · Kỳ 1)

| Thời điểm | Net | Ghi chú |
|-----------|-----|--------|
| Baseline trước smoke | 1.569.400 | DT 2.525.000 · Tips 1.435.000 · HH 134.400 |
| Sau các test SET | 1.069.400 | Thưởng 500k · Phạt 200k · Ứng 700k · ĐC −100k · KPI 0 |
| Sau hoàn tác | **1.569.400** | Tất cả hạng mục SET = 0; audit giữ |

Hoàn tác bằng SET về 0 trên **Sửa bảng lương** (có lý do audit). **Không xóa** lịch sử.

### Tháng 7

Smoke **không sửa** tháng 7 / dữ liệu vận hành July.

---

## Anh kiểm tra trên Production

1. Hard refresh (Cmd+Shift+R) → asset `index-DAjg_2MZ.js`
2. Admin → Lương → Ly Ly (hoặc NV khác kỳ 8) → **Sửa bảng lương**
3. Xác nhận form SET dễ hiểu, nhập số cuối đúng ý
4. Reload vẫn giữ · Net đúng · DT/Tips/HH không đổi · Audit rõ
5. QL / NV không thấy nút sửa

Khi anh OK → báo “PASS Production”. Khi chưa → báo lỗi cụ thể.
