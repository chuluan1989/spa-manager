import ChangePasswordForm from './ChangePasswordForm'
import './MandatoryPasswordChange.css'

/**
 * Bắt buộc đổi mật khẩu lần đăng nhập đầu (hoặc sau reset về mặc định).
 * Không có nút Hủy / Đăng xuất — phải hoàn tất trước khi vào app.
 */
export default function MandatoryPasswordChange({ user, onComplete, showToast }) {
  const mode = user.role === 'admin'
    ? 'admin'
    : user.role === 'branch_manager'
      ? 'branch'
      : 'employee'

  return (
    <div className="mandatory-password">
      <div className="mandatory-password__card">
        <h1>Đổi mật khẩu bắt buộc</h1>
        <p>
          Đây là lần đăng nhập đầu tiên (hoặc tài khoản vừa được reset).
          Vui lòng đặt mật khẩu mới trước khi tiếp tục sử dụng hệ thống.
        </p>
        <ChangePasswordForm
          mode={mode}
          employeeId={user.employeeId ?? ''}
          branchId={user.branch ?? ''}
          showToast={showToast}
          onSuccess={onComplete}
        />
      </div>
    </div>
  )
}
