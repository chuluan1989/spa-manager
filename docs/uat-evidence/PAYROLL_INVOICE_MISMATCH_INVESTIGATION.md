# ĐIỀU TRA KHẨN — Lương vs Hóa đơn (CHỈ ĐỌC)

**Thời điểm:** 2026-08-05  
**Phạm vi:** Không sửa code / DB / backfill / deploy  
**Kỳ:** Kỳ 1 + Kỳ 2 tháng 7/2026  
**Evidence:**  
- `docs/uat-evidence/LYLY_2026-07-31_INVOICE_PROBE.json`  
- `docs/uat-evidence/PAYROLL_VS_INVOICE_FULL_JUL_AUDIT.json`  
- `docs/uat-evidence/PAYROLL_VS_INVOICE_FULL_JUL_AUDIT.csv`

---

## 1. Nguyên nhân gốc (Ly Ly 31/07)

Có **hai lệch chồng lên nhau**, không phải nhân đôi HĐ trong DB.

### A. Ví lương / timeline tách mỗi HĐ thành nhiều dòng

`buildWalletTimeline` (`payrollEngine.js`) với mỗi hóa đơn tạo:

- 1 dòng **Hoa hồng** (nếu HH > 0)
- 1 dòng **Tips** (nếu tips > 0)

Ly Ly ngày 31/07:

| # | HĐ thật (DB) | CN | Tips | HH | Dòng ví |
|---|--------------|----|------|----|---------|
| 1 | `cc11027a-…` | Sóc Trăng | 111.000 | 0 | 1 (tips) |
| 2 | `fe70dd7f-…` | Sóc Trăng | 132.000 | 7.800 | 2 (tips+HH) |
| 3 | `e52884fb-…` | **Trạm Spa** | 900.000 | 48.000 | 2 (tips+HH) |
| | **Tổng** | | | | **5 dòng** |

→ **5 dòng trên bảng lương (tab Tổng quan / ví)** = 3 HĐ × (tips và/hoặc HH), không phải 5 HĐ.

### B. Khác phạm vi chi nhánh + HĐ backdate

- Màn **Hóa đơn** lọc CN Sóc Trăng ngày 31/07 → user thấy **2 HĐ** (đúng cho CN đó).
- Bảng lương (sau deploy employee-wide) lấy theo `employee_id` **mọi CN** → thêm HĐ Trạm Spa.
- HĐ Trạm Spa `e52884fb-…`: `date=2026-07-31` nhưng `created_at=2026-08-04` (tạo sau, gán ngày 31/07).

**Kết luận Ly Ly:** Không có HĐ trùng ID. Hệ thống không “bịa” 5 HĐ trong bảng `invoices`. Lệch cảm nhận đến từ (1) UI ví tách Tips/HH và (2) lương gộp đa CN / HĐ backdate ngoài danh sách CN đang xem.

---

## 2. Luồng dữ liệu bảng lương

```
invoices (Supabase, live)
   + attendance
   + payroll_adjustments
        │
        ▼
usePayrollData  →  fetch theo kỳ (fromDate–toDate trên cột date)
        │
        ▼
computePayrollReport / computeEmployeePayrollRow
   • Lọc HĐ: employee_id = NV OR support_employee_id = NV
   • HH: snapshot commissionAmount trên dòng dịch vụ (preferSnapshot)
   • Tips: invoice.tips (chỉ primary)
   • Không đọc payroll_cycle_closes.snapshot khi xem live
        │
        ├─► Bảng tổng: row.netSalary / invoiceCount
        └─► Chi tiết:
              • Tab Doanh thu: 1 dòng / 1 HĐ  (buildInvoiceRevenueList)
              • Tab Tổng quan ví: nhiều dòng / 1 HĐ (tips + HH tách)
```

| Câu hỏi | Kết quả |
|---------|---------|
| Lấy từ invoice live? | **Có** |
| Payroll snapshot close? | Chỉ khi xem phiếu đã chốt — live payroll **không** |
| Cache? | React state + realtime reload — không cache kỳ cũ riêng |
| Theo `date` hay `created_at`? | Lọc kỳ theo **`date`** (ngày HĐ) |

---

## 3. Checklist nguyên nhân (1–12)

| # | Giả thuyết | Kết quả Kỳ 1+2/7 |
|---|------------|------------------|
| 1 | Trùng HĐ (duplicate id) | **Không** — 0 duplicate |
| 2 | Cộng primary + support 2 lần cùng NV | **Không** — mỗi HĐ 1 lần / role |
| 3 | Join sai employee_id | **Không** — khớp id |
| 4 | Join sai invoice_item | N/A — services JSON trên HĐ |
| 5 | Cộng snapshot cũ | Live: **không** |
| 6 | Invoice draft | Không có cột draft trên schema prod đã đọc |
| 7 | Invoice đã xóa | Không thấy soft-delete column; đếm từ bảng hiện có |
| 8 | Edit nhiều lần nhân đôi | **Không** — 1 row / id |
| 9 | Lấy theo created_at thay date | Kỳ lọc theo **date**; HĐ backdate **vẫn vào kỳ** theo date |
| 10 | Cache cũ | Không phải root cause Ly Ly |
| 11 | Cộng kỳ khác | Không — trong from–to |
| 12 | HĐ chuyển NV | Không thấy nhân đôi |

**Có vấn đề nghiệp vụ/UI thật:**  
- Ví lương hiển thị **số dòng ≠ số HĐ**.  
- Lương **đa CN** trong khi màn HĐ thường **1 CN**.  
- HĐ **backdate** vẫn vào lương theo `date`.

---

## 4. Toàn hệ Kỳ 1 + Kỳ 2 tháng 7

| Kỳ | Số HĐ | NV có phát sinh | Duplicate ID | invoiceCount lương = số HĐ unique |
|----|-------|-----------------|--------------|-----------------------------------|
| Kỳ 1 (01–15) | 628 | 28 | 0 | **28/28 khớp** |
| Kỳ 2 (16–31) | 720 | 29 | 0 | **29/29 khớp** |

NV có HĐ **nhiều CN** (lương gộp, màn HĐ 1 CN sẽ thấy ít hơn): **6** ở Kỳ 2  
(Bảo Trân, Cherry, Chị 7, Ly Ly, Trúc Ly, UAT Cong Tac Final).

Ngày 31/07: **20 NV** có `số dòng ví > số HĐ` (cùng cơ chế tách Tips/HH) — gồm Ly Ly (3 HĐ → 5 dòng).

File CSV đầy đủ: `PAYROLL_VS_INVOICE_FULL_JUL_AUDIT.csv`.

---

## 5. Ly Ly — đối chiếu chi tiết 31/07

### HĐ trong DB (primary)

| Mark | ID | CN | Khách | Dịch vụ | Tips | HH | created_at |
|------|----|----|-------|---------|------|----|------------|
| ✔ (ST) | cc11027a-… | soc-trang | A b | Body 60 | 111.000 | 0 | 31/07 |
| ✔ (ST) | fe70dd7f-… | soc-trang | A b | Body 75 + Đắp thuốc | 132.000 | 7.800 | 31/07 |
| ✖ dư so với view CN ST / backdate | e52884fb-… | tram-spa | ádfgffasdgf | Combo1+2+Body60 | 900.000 | 48.000 | **04/08** (date=31/07) |

### “5 hóa đơn” trên lương

| Dòng ví | HĐ nguồn | Loại | Đánh dấu |
|---------|----------|------|----------|
| 1 | cc11027a | Tips | ✔ đúng HĐ1 |
| 2–3 | fe70dd7f | HH + Tips | ✔ đúng HĐ2 (2 dòng) |
| 4–5 | e52884fb | HH + Tips | ✖ dư nếu chỉ tính 2 HĐ ST; ✔ nếu chấp nhận HĐ Trạm backdate |

Tab **Doanh thu** sẽ ghi **“3 hóa đơn”** (đúng số HĐ), không phải 5.

---

## 6. Nút “Sửa bảng lương”

| Kiểm tra | Kết quả |
|----------|---------|
| Có nút tên “Sửa bảng lương”? | **Không** — chưa implement |
| Có nút liên quan? | Chỉ `+ Thêm phát sinh` khi `canManagePayroll()` và chưa chốt, ở màn **PROFILE** |
| Bị ẩn permission? | Không phải ẩn nút “Sửa bảng lương”; **feature chưa có** |
| Lỗi UI? | Không |

---

## 7. Báo cáo tổng hợp

### 1. Nguyên nhân gốc
1. UI ví lương đếm **dòng Tips/HH** như thể nhiều HĐ.  
2. Lương employee-wide **gồm CN khác**; màn HĐ CN chính chỉ 2.  
3. Thêm HĐ Trạm Spa **backdate** 31/07 tạo ngày 4/8.

### 2. Số NV “sai” theo nghĩa duplicate/cộng trùng engine
**0** (Kỳ 1+2) — `invoiceCount` = số HĐ unique.

### 3. Số HĐ “sai” (duplicate)
**0**.

### 4. Kỳ bị ảnh hưởng (hiểu nhầm UI / đa CN)
Cả **Kỳ 1 và Kỳ 2** (cùng cơ chế ví).  
Đa CN rõ ở **Kỳ 2** (6 NV).

### 5. Danh sách NV dễ hiểu nhầm (đa CN Kỳ 2)
Bảo Trân, Cherry, Chị 7, **Ly Ly**, Trúc Ly, UAT Cong Tac Final.

### 6. Danh sách HĐ Ly Ly liên quan lệch 31/07
3 HĐ ở mục 5; HĐ lệch phạm vi: `e52884fb-d7eb-4295-817b-dc63469ad680`.

### 7. Đề xuất sửa / trạng thái

1. **UI ví lương:** ✅ Group Tips + HH theo `invoiceId` (một nhóm = một hóa đơn).  
2. **UI phạm vi:** ✅ Chú thích rõ trên Lương (toàn bộ thu nhập NV) và Hóa đơn (theo bộ lọc / CN hiện tại).  
3. **Backdate / kỳ lương:** ✅ Giữ chính sách hiện tại — lọc theo **`date` (ngày phục vụ)**. Không đổi engine sang `created_at` trừ khi chủ dự án yêu cầu đánh giá ảnh hưởng riêng.  
4. **Đối chiếu HĐ ↔ lương:** đã làm rõ bằng chú thích phạm vi (mục 2).  
5. **Nút “Sửa bảng lương”:** chưa có — thiết kế riêng khi duyệt.

---

**Cam kết lần này:** Chỉ sửa giao diện / copy. Không đổi dữ liệu, không backfill, không sửa DB / công thức engine.
