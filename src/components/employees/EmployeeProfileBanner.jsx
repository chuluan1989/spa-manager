import {
  getEmployeeProfileBannerMessage,
  isEmployeeProfileLocked,
} from '../../utils/employeeProfilePolicy'

export default function EmployeeProfileBanner({ employee, onUpdateProfile }) {
  const message = getEmployeeProfileBannerMessage(employee)
  if (!message) return null

  const locked = isEmployeeProfileLocked(employee)
  const tone = locked ? 'danger' : 'warning'

  return (
    <div className={`employee-profile-banner employee-profile-banner--${tone}`} role="alert">
      <div className="employee-profile-banner__content">
        <span className="employee-profile-banner__icon" aria-hidden>⚠</span>
        <p>{message}</p>
      </div>
      <button type="button" className="employee-profile-banner__btn" onClick={onUpdateProfile}>
        Cập nhật ngay
      </button>
    </div>
  )
}
