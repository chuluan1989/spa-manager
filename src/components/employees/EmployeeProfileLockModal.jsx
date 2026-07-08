import { getEmployeeProfileLockMessage } from '../../utils/employeeProfilePolicy'

export default function EmployeeProfileLockModal({ onClose, onUpdateProfile }) {
  return (
    <div className="employee-profile-lock" role="dialog" aria-modal="true">
      <div className="employee-profile-lock__backdrop" onClick={onClose} />
      <div className="employee-profile-lock__panel">
        <h3>Hồ sơ chưa hoàn chỉnh</h3>
        <p>{getEmployeeProfileLockMessage()}</p>
        <footer>
          <button type="button" className="employee-profile-lock__secondary" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="employee-profile-lock__primary" onClick={onUpdateProfile}>
            Cập nhật hồ sơ
          </button>
        </footer>
      </div>
    </div>
  )
}
