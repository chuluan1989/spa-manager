# Kiểm tra trước khi sửa — Màn hình tổng lương

## 1. Component bảng tổng
- `src/components/salary/PayrollEmployeeList.jsx` (cột)
- Wired từ `src/pages/Salary.jsx` level `EMPLOYEES`

## 2. Hàm Lương thực nhận
- `computeNetSalary` + `computeEmployeePayrollRow` trong `src/utils/payrollEngine.js`
- Công thức engine (giữ nguyên, không đổi):  
  `baseSalary + commission + tips + bonus - reduction - penalty - advance + otherAdjustment`

## 3. Group hiện tại
- Roster: hybrid (CN hiện tại **hoặc** có phát sinh tại CN đang chọn)
- Số tiền trên dòng: **theo chi nhánh phát sinh** (`reportBranchFilter = branchId` khi không mở profile)

## 4. Vì sao hỗ trợ bị tách
- HĐ lưu `branchId` = nơi phục vụ
- List fetch/filter theo `record.branchId` → HH/tips hỗ trợ nằm ở CN phục vụ
- Profile set `employeeId` → `reportBranchFilter = ''` → tổng employee-wide

## 5. Chi tiết lấy tổng từ đâu
- Cùng `computeEmployeePayrollRow` / `stats.netSalary` trên `PayrollEmployeeProfile`
- Scope: toàn kỳ theo `employee_id` (mọi CN)

## 6. Tái sử dụng
- Có — dùng cùng `row.netSalary` employee-wide
- Hiển thị một lần dưới **chi nhánh nhân sự** (`employee.branchId`)
- Không tự cộng lại công thức khác
