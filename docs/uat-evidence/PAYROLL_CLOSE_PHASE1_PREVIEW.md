# Preview — Phase 1: điều kiện chốt lương + Cần xử lý

## Đã làm

### A. Chấm công khi chốt
- Chỉ kiểm tra `fromDate`–`toDate` của kỳ đang gửi
- Ngoại lệ **Kỳ 1 tháng 07/2026** (mọi CN): không bắt buộc đủ chấm công
- Kỳ 2/07 chỉ 16–31/07
- Loại ngày trước `startDate` / sau `endDate`
- `MissingAttendanceRemindBanner` chỉ nhắc kỳ đang đến hạn chưa gửi

### B. 3 xác nhận trước gửi
Checkbox bắt buộc trên panel chốt; nút **Gửi bảng chốt lương** chỉ bật khi đủ điều kiện + đủ 3 tick.

### C. Gửi chốt
- 3 xác nhận lưu trong snapshot
- Phiếu `submitted`/`resubmitted` = **một task chung** (Admin + QL cùng thấy một bản ghi)

### D–E. Tab **Cần xử lý** (Công việc)
- Unhide menu Công việc cho Admin
- Bộ đếm: tổng / bảng lương chờ / sửa chấm công / mới hôm nay
- Deep-link: Lương (đúng NV/tháng/kỳ) hoặc Chấm công → Yêu cầu chỉnh sửa

## Chưa làm (Phase 2)
Yêu cầu sửa hóa đơn / queue duyệt HĐ.

## UAT local
```bash
npx vite-node scripts/verify-payroll-close-phase1-uat.mjs
```

Chưa commit · chưa deploy — chờ UAT người dùng.
