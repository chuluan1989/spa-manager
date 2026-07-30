# UAT Evidence — Login Username/Password V2 (Final)

Generated: 2026-07-30T10:48:48.792Z

## Quy tắc

| Họ tên / Vai trò | Username | Mật khẩu mặc định |
| --- | --- | --- |
| Hồng Thương | `hongthuong` | `hongthuongvinhlong` |
| Thúy An | `thuyan` | `thuyansoctrang` |
| QL Trạm Spa | `tramspa` | `tramspa123` |

## Use cases

### UC-1: Quản lý chi nhánh đăng nhập (tramspa / tramspa123)

- **Kết quả:** PASS
- **Ghi chú:** branch=tram-spa, mustChangePassword=true
- **Bước:**
  1. Chọn QL CN
  1. Nhập tramspa
  1. Nhập tramspa123

### UC-2: Nhân viên đăng nhập theo họ tên (thanh / thanhtramspa)

- **Kết quả:** PASS

- **Bước:**
  1. Chọn NV
  1. Nhập thanh
  1. Nhập thanhtramspa

### UC-3: Đăng nhập lần đầu — bắt buộc đổi mật khẩu

- **Kết quả:** PASS
- **Ghi chú:** MK mới: thanhv2pass1 (test)
- **Bước:**
  1. Login MK mặc định
  1. mustChangePassword=true
  1. Đổi MK mới
  1. customPassword=true

### UC-3b: Sau đổi MK — login bằng mật khẩu mới

- **Kết quả:** PASS

- **Bước:**
  1. Login thanh / thanhv2pass1

### UC-4: Admin — Danh sách tài khoản (username, đã đổi MK, cập nhật MK)

- **Kết quả:** PASS
- **Ghi chú:** Thanh: thanh, đổi MK=true; QL: tramspa
- **Bước:**
  1. Settings → Tài khoản & phân quyền

### UC-5a: Admin — Reset Password nhân viên về mặc định

- **Kết quả:** PASS

- **Bước:**
  1. Reset MK mặc định → thanhtramspa
  1. customPassword=false

### UC-5b: Admin — Reset Password QL CN về mặc định

- **Kết quả:** PASS

- **Bước:**
  1. Reset MK mặc định → tramspa123

### UC-6: Thêm nhân viên mới — tự sinh account theo quy tắc V2

- **Kết quả:** PASS
- **Ghi chú:** {"username":"hongthuong","defaultPassword":"hongthuongvinhlong","mustChangePassword":true}
- **Bước:**
  1. Tạo Hồng Thương @ Vĩnh Long
  1. username=hongthuong
  1. MK=hongthuongvinhlong

### UC-6b: Nhân viên mới đăng nhập ngay sau tạo

- **Kết quả:** PASS

- **Bước:**
  1. Login hongthuong / hongthuongvinhlong

### UC-7: Admin — Khóa / Mở khóa (metadata trạng thái có trong danh sách)

- **Kết quả:** PASS

- **Bước:**
  1. Cột trạng thái đăng nhập: active | locked

### UC-8: Trùng tên — username tự thêm hậu tố (thuyan, thuyan2)

- **Kết quả:** PASS
- **Ghi chú:** thuyan, thuyan2
- **Bước:**
  1. Tạo 2 NV cùng tên Thúy An
  1. Username không trùng nhau

### UC-9: Đổi tên Hồ sơ — username giữ nguyên

- **Kết quả:** PASS

- **Bước:**
  1. Sửa tên Thúy An → Thúy An Nguyễn
  1. Username vẫn thuyan

### UC-10: Reset MK hàng loạt — báo succeeded/failed/skipped, không reset Admin

- **Kết quả:** PASS
- **Ghi chú:** ok=1 skip=1 fail=0
- **Bước:**
  1. Chọn NV → Reset
  1. Admin bị bỏ qua

### UC-11: Reset MK hàng loạt — theo chi nhánh (offline/local)

- **Kết quả:** PASS
- **Ghi chú:** employees=5
- **Bước:**
  1. Reset NV + QL CN chi nhánh — chỉ môi trường local

### UC-12: Reset MK hàng loạt — toàn hệ thống (offline/local)

- **Kết quả:** PASS
- **Ghi chú:** employees=46, branches=8
- **Bước:**
  1. Reset tất cả NV + QL — chỉ môi trường local; bị chặn trên Preview/Production

### UC-13: allocateEmployeeLoginUsername — gợi ý username không trùng

- **Kết quả:** PASS

- **Bước:**
  1. thuyan đã dùng → thuyan3


## Summary: 16 passed, 0 failed
