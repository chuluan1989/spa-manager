# UAT Login V2 — Production Flow

Generated: 2026-07-30T10:48:37.315Z

**UAT prefix:** `uat-login-v2-`

## Steps

- **0** Dọn tài khoản UAT cũ: PASS
- **1** Tạo 2 NV UAT cùng tên — username phân biệt: PASS (thuyan, thuyan2)
- **2** Đăng nhập MK mặc định: PASS (thuyan)
- **3** Bắt buộc đổi MK lần đầu: PASS
- **4** Đăng nhập lại bằng MK mới: PASS
- **5** Đổi tên hồ sơ — username không đổi: PASS (thuyan)
- **6** Admin đổi username thủ công: PASS (uathuyan)
- **7** Admin reset MK về mặc định: PASS (uathuyanvinhlong)
- **8** Đăng nhập MK mặc định sau reset: PASS
- **9** Bắt buộc đổi MK sau reset: PASS
- **10** Khóa tài khoản — không đăng nhập được: PASS (Tài khoản nhân viên đang bị khóa)
- **11** Mở khóa — đăng nhập được: PASS
- **12** Reset hàng loạt — chỉ UAT, bỏ qua NV thật: PASS (ok=2 skip=1 fail=0)
- **13** Chặn reset theo chi nhánh / toàn hệ thống trên live: PASS

## Summary: 14 passed, 0 failed
