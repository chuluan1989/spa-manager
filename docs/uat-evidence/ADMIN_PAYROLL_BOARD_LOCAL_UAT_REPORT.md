# Báo cáo UAT local — Admin Payroll Board (KPI / Sửa bảng lương)

**Trạng thái: CHƯA PASS — CHƯA xin phép deploy Production**

Ngày kiểm tra: 2026-08-05  
Môi trường: Vite local `http://127.0.0.1:5173/` + dữ liệu thực Supabase (Production DB)  
Tài khoản: Admin (`admin123`)

> Không kết luận PASS. Báo cáo này ghi nhận kiểm tra trực tiếp trên app local, không dùng mock UI.

---

## 1. Hiển thị toolbar

| Kiểm tra | Kết quả |
|---|---|
| Thứ tự [KPI] → [Sửa bảng lương] → [Đối soát Excel] → [Tóm tắt PDF] | **Đạt** (Admin, chi tiết nhân viên) |
| Admin thấy KPI + Sửa bảng lương | **Đạt** |
| Quản lý chi nhánh không thấy | **Chưa xác nhận trên UI** (đăng nhập `soctrang` / `soctrang123` báo *Sai mật khẩu*; code chỉ gắn `adminActions` khi `isAdmin()`) |
| Nhân viên không thấy | **Chưa chạy trên UI** (cùng lý do role-login) |
| Nút không bị che/tràn | **Đạt sau sửa CSS** (`Salary.css`: toolbar flex + wrap). Ảnh: `admin-payroll-board-local/uat-toolbar-aug-unlocked.png` |

---

## 2. Nút KPI (Ly Ly · 08/2026 Kỳ 1 · **chưa chốt**)

| Bước | Kết quả |
|---|---|
| Trước | Lương thực nhận **1.569.400** · KPI **0** · DT 2.525.000 · HH 134.400 · Tips 1.435.000 |
| Preview +100.000 | Cũ 1.569.400 → Mới 1.669.400 · Chênh **+100.000** |
| Lý do bắt buộc | Có field required |
| Hủy | **Đạt** — không đổi dữ liệu |
| Lưu +100.000 | **Đạt** — KPI 100.000 · Lương thực nhận **1.669.400** · ví có dòng KPI |
| DT / Tips / HH sau lưu | **Không đổi** |
| KPI âm −100.000 | **Chưa chạy** |
| KPI = 0 | Modal **từ chối lưu** (`Nhập số KPI khác 0`) — không khớp checklist “nhập KPI bằng 0” theo nghĩa lưu số 0 |

Ảnh:

- `uat-kpi-popup-preview-plus100k.png`
- `uat-lyly-after-kpi-plus100k.png`

**Lưu ý dữ liệu:** Đã ghi KPI +100.000 thật vào Supabase cho Ly Ly kỳ 08/2026 P1 (lý do: `UAT local — KPI +100000 trước deploy`). Cần quyết định giữ hoặc xóa/revert trước Production business use.

---

## 3. Sửa bảng lương

**Chưa chạy** từng trường (KPI / Thưởng / Phạt / Ứng / Điều chỉnh / Ghi chú) và multi-field.

---

## 4. Kỳ đã chốt (07/2026 Kỳ 2)

| Kiểm tra | Kết quả |
|---|---|
| Badge / nút Mở khóa | **Có** nút `Mở khóa` |
| KPI + Sửa bảng lương khi đang chốt | **disabled** |
| Mở khóa bắt buộc lý do | Code dùng `window.prompt('Lý do mở khóa lương:')` — **chưa bấm mở khóa** (tránh sửa kỳ đã chốt trên DB thật) |
| Không sửa âm thầm kỳ chốt | Nút disabled — **đạt mức UI**; chưa thử bypass |

Ảnh: `uat-july-locked-kpi-disabled.png`

---

## 5. Audit

Sau lưu KPI, tab **Nhật ký** có:

- action `create · payroll_adjustment`
- thời gian, editor Admin, lý do
- snippet JSON (id, date, note, type…)

| Yêu cầu checklist | Kết quả |
|---|---|
| Nhân viên / kỳ / trường / cũ / mới / chênh / lý do / người / thời gian | **Một phần** — UI chưa hiển thị có cấu trúc đủ 9 trường (chủ yếu JSON + reason) |
| Reload còn lịch sử | **Chưa reload lại sau save** trong phiên này (sau save đã thấy ngay) |
| Audit không sửa/xóa từ UI | **Chưa đạt đủ** — tab Nhật ký vẫn có nút **Xóa** trên dòng *adjustment* (Admin), xóa khoản lương kèm lý do |

Ảnh: `uat-audit-nhat-ky-kpi.png`

---

## 6. Nhân viên đi hỗ trợ (Ly Ly)

| Kiểm tra | Kết quả |
|---|---|
| Lương thực nhận gồm nhiều CN | Note UI + số tổng > số CN đang xem — **đạt quan sát** |
| Danh sách HĐ theo CN đang xem | Note + list chỉ ST — **đạt quan sát** |
| Bảng tổng = chi tiết sau KPI | KPI hiện cả header và block CN; net +100k — **đạt với case +100k** |
| Bảo Trân | **Chưa chạy** |

---

## 7. Video

**Chưa có** video liên tục. Browser automation không quay video; cần quay tay hoặc Playwright record.

---

## 8. Tổng hợp trước deploy

| Mục | Trạng thái |
|---|---|
| 1 Toolbar | Một phần (role QL/NV chưa chứng minh UI) |
| 2 KPI | Một phần (+100k + Hủy; thiếu âm/0/reload đầy đủ) |
| 3 Sửa bảng lương | Chưa |
| 4 Kỳ đã chốt | UI khóa đạt; chưa test mở khóa end-to-end |
| 5 Audit | Một phần; còn nút Xóa adjustment |
| 6 Hỗ trợ liên CN | Một phần (Ly Ly) |
| 7 Video | Thiếu |
| 8 Gói bằng chứng đủ | **Chưa đủ** |

### Kết luận

**CHƯA PASS. Không xin phép deploy Production.**

### Việc còn lại bắt buộc

1. Quay video liên tục đủ 10 bước checklist.  
2. Hoàn tất KPI âm / (quyết định hành vi KPI = 0) + reload.  
3. UAT đủ “Sửa bảng lương” từng trường + multi.  
4. Đăng nhập thật QL chi nhánh + Nhân viên, chụp không có KPI/Sửa.  
5. (Tuỳ chọn có kiểm soát) mở khóa kỳ đã chốt → sửa → audit → khóa lại.  
6. Sửa/làm rõ audit UI + chính sách nút Xóa vs yêu cầu “audit không xóa”.  
7. Quyết định revert KPI UAT của Ly Ly 08/2026 P1.
