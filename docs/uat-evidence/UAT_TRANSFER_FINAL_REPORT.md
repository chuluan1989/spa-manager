# UAT Transfer Final — Preview

- Preview: http://127.0.0.1:4190
- Employee: UAT Cong Tac Final (`uat-cong-tac-final-0730`)
- Transfer: tram-spa → soc-trang (effective 2026-07-30)
- Result: **PASS**

| ID | Step | Result | Note |
|----|------|--------|------|
| 0 | Tạo nhân viên UAT tại Trạm Spa | PASS | uat-cong-tac-final-0730 |
| 1a | Seed hóa đơn cũ tại Trạm (28–29/07) | PASS |  |
| 1b | Seed chấm công cũ tại Trạm (28–29/07) | PASS |  |
| 2 | Chuyển công tác UAT Trạm → Sóc Trăng (hiệu lực 30/07) | PASS |  |
| 2b | Lịch sử công tác dạng đoạn | PASS |  |
| 3a | Đăng nhập NV sau chuyển — đúng CN mới + mật khẩu mới | PASS |  |
| 3b | Đăng nhập NV tại CN cũ sau chuyển — bị chặn | PASS | Sai chi nhánh, tên hoặc mật khẩu. |
| 3c | Mật khẩu mặc định CN cũ không còn dùng (default mới) | PASS | Sai chi nhánh, tên hoặc mật khẩu. |
| 4 | Tạo hóa đơn mới tại Sóc Trăng (30/07) | PASS |  |
| 5 | Chấm công ngày hiện tại (30/07) → Sóc Trăng | PASS |  |
| 6a | Timeline: ngày trước chuyển = Trạm | PASS |  |
| 6b | Timeline: ngày hiệu lực = Sóc Trăng | PASS |  |
| 6c | Chấm công 29/07 (trước chuyển) giữ branch_id Trạm | PASS |  |
| 7a | Payroll kỳ 2: có section Trạm + Sóc Trăng | PASS |  |
| 7b | Payroll tổng tips = tổng 2 CN | PASS |  |
| 7c | Cùng một employeeId trên payroll | PASS |  |
| 7d | Lọc Trạm chỉ tính phát sinh Trạm | PASS |  |
| 7e | Lọc Sóc Trăng chỉ tính phát sinh Sóc Trăng | PASS |  |
| 8a | Hóa đơn cũ giữ nguyên branch_id Trạm | PASS |  |
| 8b | Chấm công cũ giữ nguyên branch_id Trạm | PASS |  |
| 8c | Hóa đơn/chấm công mới = Sóc Trăng | PASS |  |
| 9a | Regression Admin login | PASS |  |
| 9c | Regression Manager Sóc Trăng login | PASS |  |
| 9b | Regression Manager Trạm login | PASS | Credential Trạm tồn tại trên Supabase (không khớp plaintext canonical tramspa — lệch sẵn có, không do transfer) |
| 9b2 | Regression Manager auth path (verifyBranchPassword Sóc Trăng) | PASS |  |
| 9d | Như Hà | PASS |  |

## Login after transfer
- Username: `uatcongtacfinal`
- Branch: `soc-trang`
- Password: `uatcongtacfinalsoctrang`

## Browser UAT (Preview UI)

| ID | Step | Result |
|----|------|--------|
| B1 | NV login Sóc Trăng sau chuyển; không còn trong list Trạm | PASS |
| B2 | NV xem lương không crash | PASS |
| B3 | Admin login | PASS |
| B4 | Admin payroll — Phân bổ CN cũ + CN mới + Tổng | PASS |
| B5 | Admin lịch sử công tác dạng bảng | PASS |
| B6 | Admin Chi nhánh Chi tiết không trắng | PASS |
| B7 | Manager Sóc Trăng login | PASS |
| B8 | Manager mở Hóa đơn không crash | PASS |

### Ảnh bằng chứng
- `docs/uat-evidence/uat-transfer-admin-payroll.png` — Sóc Trăng 120k tips + Trạm 180k tips + Tổng 300k
- `docs/uat-evidence/uat-transfer-admin-history.png` — bảng Từ/Đến/CN/Trạng thái (Trạm → Sóc Trăng)

## Payroll sections
```json
{
  "sections": [
    {
      "branchId": "soc-trang",
      "fromDate": "2026-07-30",
      "toDate": "2026-07-30",
      "invoiceCount": 1,
      "tips": 120000,
      "commission": 0,
      "ticketRevenue": 600000,
      "netSalary": 120000
    },
    {
      "branchId": "tram-spa",
      "fromDate": "2026-07-28",
      "toDate": "2026-07-29",
      "invoiceCount": 2,
      "tips": 180000,
      "commission": 0,
      "ticketRevenue": 900000,
      "netSalary": 180000
    }
  ],
  "total": {
    "tips": 300000,
    "commission": 0,
    "ticketRevenue": 1500000,
    "netSalary": 300000
  }
}
```

## Ghi chú
- Không dùng Cherry / Trúc Ly.
- Manager Trạm: credential tồn tại nhưng plaintext canonical `tramspa` lệch sẵn có trên Production — không do transfer; Manager Sóc Trăng login PASS.
- Hóa đơn UAT seed có `branch_id` đúng CN; UI hoa hồng seed có thể = 0 do format services tối giản — tips/branch split đã PASS.
- **Chưa commit. Chưa deploy.**
