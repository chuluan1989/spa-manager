import { useMemo, useState } from 'react'
import { getBranchById } from '../../constants/branches'
import {
  canViewEmployeeAvatar,
  canViewEmployeeBankInfo,
  canViewEmployeeCccd,
  canViewEmployeeCurrentAddress,
  canViewEmployeeEmergencyContact,
  canViewEmployeeNote,
  canViewEmployeePersonalInfo,
  canViewEmployeePosition,
} from '../../constants/auth'
import {
  getEmployeeProfileStatus,
  getGenderLabel,
  getStatusLabel,
} from '../../utils/employeeStorage'
import {
  getAuditActionLabel,
  loadEmployeeAuditLogs,
} from '../../utils/employeeAuditLog'
import { getEmployeeLifetimeStats } from '../../utils/employeeStats'
import { formatCurrency } from '../../utils/invoice'
import EmployeeAvatar from './EmployeeAvatar'
import './EmployeeProfileDetail.css'

function Value({ value, placeholder = 'Chưa cập nhật' }) {
  if (!value || !String(value).trim()) {
    return <span className="employee-detail__empty">{placeholder}</span>
  }
  return <span>{value}</span>
}

function Row({ label, value, placeholder }) {
  return (
    <div className="employee-detail__row">
      <span className="employee-detail__row-label">{label}</span>
      <div className="employee-detail__row-value">
        <Value value={value} placeholder={placeholder} />
      </div>
    </div>
  )
}

function Thumb({ label, src, onOpen }) {
  return (
    <div className="employee-detail__thumb-wrap">
      <span className="employee-detail__row-label">{label}</span>
      {src ? (
        <button type="button" className="employee-detail__thumb-btn" onClick={() => onOpen(src, label)}>
          <img src={src} alt={label} className="employee-detail__thumb" />
        </button>
      ) : (
        <div className="employee-detail__thumb employee-detail__thumb--empty">Chưa có ảnh</div>
      )}
    </div>
  )
}

function formatDateTime(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRate(value) {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  if (Number.isNaN(num)) return String(value)
  return `${num}%`
}

const STATUS_BADGE_TONE = {
  complete: 'success',
  missing_cccd: 'danger',
  missing_bank: 'warning',
  incomplete: 'warning',
}

export default function EmployeeProfileDetail({
  employee,
  forceAdminFields = false,
  showStats = true,
  onEdit,
  onClose,
}) {
  const [lightbox, setLightbox] = useState(null)

  const showContact = forceAdminFields || canViewEmployeePersonalInfo()
  const showCurrentAddress = forceAdminFields || canViewEmployeeCurrentAddress()
  const showEmergencyContact = forceAdminFields || canViewEmployeeEmergencyContact()
  const showCccd = forceAdminFields || canViewEmployeeCccd()
  const showBankInfo = forceAdminFields || canViewEmployeeBankInfo()
  const showAvatar = forceAdminFields || canViewEmployeeAvatar()
  const showNote = forceAdminFields || canViewEmployeeNote()
  const showPosition = forceAdminFields || canViewEmployeePosition()

  const hasContactTab = showContact || showCurrentAddress || showEmergencyContact
  const hasImagesTab = showAvatar

  const tabs = useMemo(() => {
    const list = [{ id: 'basic', label: 'Cơ bản' }]
    if (hasContactTab) list.push({ id: 'contact', label: 'Liên hệ' })
    if (showCccd) list.push({ id: 'cccd', label: 'CCCD' })
    if (showBankInfo) list.push({ id: 'bank', label: 'Ngân hàng' })
    if (hasImagesTab) list.push({ id: 'images', label: 'Hình ảnh' })
    if (showStats) list.push({ id: 'stats', label: 'Vận hành' })
    if (forceAdminFields) list.push({ id: 'audit', label: 'Nhật ký' })
    return list
  }, [hasContactTab, showCccd, showBankInfo, hasImagesTab, showStats, forceAdminFields])

  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? 'basic')
  const currentTab = tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0]?.id

  const branch = getBranchById(employee?.branchId)
  const profileStatus = forceAdminFields ? getEmployeeProfileStatus(employee) : null
  const stats = showStats ? getEmployeeLifetimeStats(employee?.id) : null
  const branchHistory = Array.isArray(employee?.branchHistory) ? employee.branchHistory : []
  const auditLogs = forceAdminFields && employee?.id
    ? loadEmployeeAuditLogs({ employeeId: employee.id, limit: 50 })
    : []

  if (!employee) return null

  return (
    <div className="employee-detail">
      <div className="employee-detail__header">
        {showAvatar && (
          <EmployeeAvatar name={employee.name} avatar={employee.avatar} size="lg" />
        )}
        <div className="employee-detail__header-info">
          <h3 className="employee-detail__name">{employee.name || 'Chưa cập nhật'}</h3>
          <div className="employee-detail__meta">
            <span className={`employee-detail__status employee-detail__status--${employee.status}`}>
              {getStatusLabel(employee.status)}
            </span>
            {showPosition && employee.position && (
              <span className="employee-detail__meta-item">{employee.position}</span>
            )}
            {branch?.name && <span className="employee-detail__meta-item">{branch.name}</span>}
            {profileStatus && (
              <span className={`employee-detail__badge employee-detail__badge--${STATUS_BADGE_TONE[profileStatus.key]}`}>
                {profileStatus.label}
              </span>
            )}
          </div>
        </div>
        {onEdit && (
          <button type="button" className="employee-detail__edit-btn" onClick={onEdit}>
            Sửa hồ sơ
          </button>
        )}
      </div>

      <div className="employee-detail__tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`employee-detail__tab${currentTab === tab.id ? ' employee-detail__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="employee-detail__body">
        {currentTab === 'basic' && (
          <div className="employee-detail__section">
            <Row label="Mã nhân viên" value={employee.id} />
            <Row label="Họ và tên" value={employee.name} />
            <Row label="Chi nhánh" value={branch?.name} />
            {showPosition && <Row label="Chức vụ" value={employee.position} />}
            <Row label="Trạng thái" value={getStatusLabel(employee.status)} />
            <Row label="Ngày bắt đầu làm việc" value={employee.startDate} />
            {forceAdminFields && <Row label="Ngày nghỉ việc" value={employee.endDate} />}
            {forceAdminFields && <Row label="Mức hoa hồng" value={formatRate(employee.commissionRate)} />}
            {forceAdminFields && <Row label="Tỷ lệ lương" value={formatRate(employee.salaryRate)} />}
            <Row label="Số điện thoại" value={employee.phone} />
            {showNote && <Row label="Ghi chú" value={employee.note} />}
          </div>
        )}

        {currentTab === 'contact' && (
          <div className="employee-detail__section">
            <Row label="Số điện thoại" value={employee.phone} />
            {showContact && <Row label="Email" value={employee.email} />}
            {showContact && <Row label="Ngày sinh" value={employee.dateOfBirth} />}
            {showContact && <Row label="Giới tính" value={getGenderLabel(employee.gender)} />}
            {showCurrentAddress && <Row label="Địa chỉ hiện tại" value={employee.currentAddress} />}
            {showEmergencyContact && (
              <>
                <Row label="Người liên hệ khẩn cấp" value={employee.emergencyContactName} />
                <Row label="SĐT người liên hệ" value={employee.emergencyContactPhone} />
              </>
            )}
          </div>
        )}

        {currentTab === 'cccd' && (
          <div className="employee-detail__section">
            <Row label="Số CCCD" value={employee.cccd} />
            <Row label="Ngày cấp" value={employee.cccdIssueDate} />
            <Row label="Nơi cấp" value={employee.cccdIssuePlace} />
            <Row label="Địa chỉ trên CCCD" value={employee.cccdAddress} />
            <div className="employee-detail__thumbs">
              <Thumb label="Ảnh CCCD mặt trước" src={employee.cccdFrontImage} onOpen={(src, label) => setLightbox({ src, label })} />
              <Thumb label="Ảnh CCCD mặt sau" src={employee.cccdBackImage} onOpen={(src, label) => setLightbox({ src, label })} />
            </div>
          </div>
        )}

        {currentTab === 'bank' && (
          <div className="employee-detail__section">
            <Row label="Tên ngân hàng" value={employee.bankName} />
            <Row label="Chủ tài khoản" value={employee.bankAccountHolder} />
            <Row label="Số tài khoản" value={employee.bankAccount} />
          </div>
        )}

        {currentTab === 'images' && (
          <div className="employee-detail__section">
            <div className="employee-detail__thumbs">
              <Thumb label="Ảnh chân dung" src={employee.avatar} onOpen={(src, label) => setLightbox({ src, label })} />
            </div>
            <p className="employee-detail__hint">Ảnh hồ sơ khác: Chưa có</p>
          </div>
        )}

        {currentTab === 'stats' && (
          <div className="employee-detail__section">
            <div className="employee-detail__stats-grid">
              <div className="employee-detail__stat">
                <span className="employee-detail__stat-label">Doanh thu tiền vé</span>
                <span className="employee-detail__stat-value">{formatCurrency(stats?.revenue)}</span>
              </div>
              <div className="employee-detail__stat">
                <span className="employee-detail__stat-label">Tổng số tour</span>
                <span className="employee-detail__stat-value">{stats?.invoiceCount ?? 0}</span>
              </div>
              <div className="employee-detail__stat">
                <span className="employee-detail__stat-label">Tổng tips</span>
                <span className="employee-detail__stat-value">{formatCurrency(stats?.tips)}</span>
              </div>
              <div className="employee-detail__stat">
                <span className="employee-detail__stat-label">Tổng hoa hồng</span>
                <span className="employee-detail__stat-value">{formatCurrency(stats?.commission)}</span>
              </div>
              <div className="employee-detail__stat employee-detail__stat--highlight">
                <span className="employee-detail__stat-label">Tổng lương</span>
                <span className="employee-detail__stat-value">{formatCurrency(stats?.totalSalary)}</span>
              </div>
            </div>
            <div className="employee-detail__history">
              <h4 className="employee-detail__history-title">Lịch sử chi nhánh</h4>
              {branchHistory.length === 0 ? (
                <p className="employee-detail__hint">Chỉ làm việc tại chi nhánh hiện tại.</p>
              ) : (
                <ul className="employee-detail__history-list">
                  {branchHistory.map((entry, index) => (
                    <li key={`${entry.branchId}-${index}`}>
                      <strong>{entry.effectiveDate || entry.transferDate || formatDateTime(entry.changedAt).slice(0, 10)}</strong>
                      {' — '}
                      {entry.fromBranchName || entry.branchName || entry.branchId}
                      {' → '}
                      {entry.toBranchName || '—'}
                      {entry.approver && <> · Duyệt: {entry.approver}</>}
                      {entry.reason && <> · {entry.reason}</>}
                    </li>
                  ))}
                  <li>{branch?.name} — hiện tại</li>
                </ul>
              )}
            </div>
          </div>
        )}

        {currentTab === 'audit' && (
          <div className="employee-detail__section">
            {auditLogs.length === 0 ? (
              <p className="employee-detail__hint">Chưa có nhật ký thao tác.</p>
            ) : (
              <ul className="employee-detail__audit-list">
                {auditLogs.map((entry) => (
                  <li key={entry.id}>
                    <strong>{formatDateTime(entry.createdAt)}</strong>
                    <span>{getAuditActionLabel(entry.action)}</span>
                    <em>{entry.details}</em>
                    <span className="employee-detail__audit-actor">{entry.actorName}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {lightbox && (
        <div className="employee-detail__lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox.src} alt={lightbox.label} />
        </div>
      )}

      {onClose && (
        <div className="employee-detail__actions">
          <button type="button" className="employee-detail__close-btn" onClick={onClose}>
            Đóng
          </button>
        </div>
      )}
    </div>
  )
}
