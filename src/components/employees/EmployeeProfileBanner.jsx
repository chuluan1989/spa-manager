import { getEmployeeProfileBannerMessage } from '../../utils/employeeProfilePolicy'

export default function EmployeeProfileBanner({ employee, onUpdateProfile }) {
  const message = getEmployeeProfileBannerMessage(employee)
  if (!message) return null

  return (
    <div className="employee-profile-banner" role="alert">
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
