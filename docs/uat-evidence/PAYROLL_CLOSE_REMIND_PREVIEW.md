# Preview — Nhắc chốt kỳ lương (continuous)

Quy tắc kỳ (giữ nguyên):
- Kỳ 1: 01–15, chốt từ ngày 17 cùng tháng
- Kỳ 2: 16–cuối tháng, chốt từ ngày 02 tháng sau

## Hành vi nhắc

| Ngày | Kỳ nhắc (cửa sổ chính) | Ghi chú |
|------|------------------------|---------|
| 17 cùng tháng | Kỳ 1 tháng đó | Bắt đầu nhắc |
| 18… cuối tháng | Kỳ 1 | Tiếp tục đến khi gửi |
| 02 tháng sau | Kỳ 2 tháng trước | Bắt đầu nhắc |
| 03…16 | Kỳ 2 tháng trước | Tiếp tục đến khi gửi |

Ẩn khi `submitted` / `resubmitted` / `approved`. Hiện lại khi `returned`.

## UI

- Banner: checklist Tour / Chấm công / Lương dự kiến / Gửi chốt
- CTA chính: **Kiểm tra & Chốt kỳ lương** → trang Lương (prefill kỳ)
- Thu gọn: chỉ lần xem hiện tại; reload / login lại vẫn hiện nếu chưa gửi
- Panel Lương: checklist + liên kết Tour / Chấm công + khóa nút gửi khi thiếu

## UAT

```bash
npx vite-node scripts/verify-payroll-close-remind-uat.mjs
```

Cases: 17, 18, 02, 05, submitted/approved ẩn, returned hiện, thiếu công / hóa đơn chưa đồng bộ khóa gửi.
