import { useMemo, useState } from 'react'
import { Settings, Search, ChevronLeft } from 'lucide-react'
import { getActiveBranches, getBranchById } from '../constants/branches'
import {
  canAccessEmployeesPage,
  canAccessSettingsPage,
  canAddEmployee,
  canChangeEmployeeBranch,
  canDeleteEmployee,
  canEditEmployee,
  canSelectBranch,
  getCurrentUserBranch,
  isAdmin,
} from '../constants/auth'
import { useEmployeeHubData } from '../hooks/useEmployeeHubData'
import { computeEmployeeListStats } from '../utils/employeeHubStats'
import {
  EMPLOYEE_STATUS,
  EMPLOYEE_STATUS_OPTIONS,
  getStatusLabel,
  isDefaultListEmployee,
  isEmployeeArchived,
} from '../utils/employeeStorage'
import { redactEmployeeForViewer } from '../utils/employeeVisibility'
import { formatCurrency } from '../utils/invoice'
import { getCurrentMonthValue } from '../utils/salaryReport'
import EmployeeHubDetail from '../components/employees/EmployeeHubDetail'
import EmployeeHubSettings from '../components/employees/EmployeeHubSettings'
import './EmployeeHub.css'

const ALL_BRANCHES = ''

function StatusBadge({ status }) {
  const tone =
    status === EMPLOYEE_STATUS.ACTIVE
      ? 'active'
      : status === EMPLOYEE_STATUS.ON_LEAVE
        ? 'leave'
        : status === EMPLOYEE_STATUS.ARCHIVED
          ? 'archived'
          : 'resigned'
  return <span className={`employee-hub-status employee-hub-status--${tone}`}>{getStatusLabel(status)}</span>
}

export default function EmployeeHub({ adminMode = false }) {
  const allowed = adminMode ? canAccessSettingsPage() : canAccessEmployeesPage()

  const [selectedBranchId, setSelectedBranchId] = useState(() =>
    canSelectBranch() ? ALL_BRANCHES : getCurrentUserBranch(),
  )
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [month, setMonth] = useState(getCurrentMonthValue())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [mobileView, setMobileView] = useState('branches')

  const fetchBranchId = selectedBranchId || undefined
  const { employees, invoices, loading, error, reload } = useEmployeeHubData({
    branchId: fetchBranchId,
    month,
  })

  const branchOptions = useMemo(() => {
    const branches = getActiveBranches()
    if (canSelectBranch()) {
      return [{ id: ALL_BRANCHES, name: 'Tất cả chi nhánh' }, ...branches]
    }
    const mine = branches.filter((b) => b.id === getCurrentUserBranch())
    return mine.length ? mine : branches.filter((b) => b.id === getCurrentUserBranch())
  }, [])

  const statsMap = useMemo(
    () => computeEmployeeListStats(invoices, employees.map((e) => e.id), month),
    [employees, invoices, month],
  )

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((emp) => {
      if (statusFilter) {
        if (emp.status !== statusFilter) return false
      } else {
        const inDefaultList = isDefaultListEmployee(emp)
        const inArchiveList = showArchived && (
          isEmployeeArchived(emp) || emp.status === EMPLOYEE_STATUS.RESIGNED
        )
        if (!inDefaultList && !inArchiveList) return false
      }
      if (!q) return true
      const haystack = `${emp.name ?? ''} ${emp.phone ?? ''} ${emp.position ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [employees, search, statusFilter, showArchived])

  const selectedEmployee = useMemo(() => {
    const found = employees.find((e) => e.id === selectedEmployeeId)
    return found ? redactEmployeeForViewer(found) : null
  }, [employees, selectedEmployeeId])

  const showSettingsBtn =
    canAddEmployee() || canEditEmployee() || canChangeEmployeeBranch() || canDeleteEmployee()

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  const handleSelectBranch = (branchId) => {
    setSelectedBranchId(branchId)
    setSelectedEmployeeId('')
    setMobileView('list')
  }

  const handleSelectEmployee = (employeeId) => {
    setSelectedEmployeeId(employeeId)
    setMobileView('detail')
  }

  const handleSaved = () => {
    reload()
  }

  if (!allowed) {
    return (
      <div className="employee-hub employee-hub--denied">
        <h2>Không có quyền truy cập</h2>
      </div>
    )
  }

  return (
    <div className="employee-hub">
      {toast && <div className="employee-hub__toast">{toast}</div>}

      <header className="employee-hub__header">
        <div>
          <h1 className="employee-hub__title">Nhân viên</h1>
          <p className="employee-hub__subtitle">
            {adminMode
              ? 'Quản trị nhân sự theo chi nhánh — hồ sơ, doanh số và lương'
              : 'Quản lý nhân viên chi nhánh — hồ sơ, doanh số và lương'}
          </p>
        </div>
        <div className="employee-hub__header-actions">
          <label className="employee-hub__month">
            <span>Tháng</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          {showSettingsBtn && (
            <button
              type="button"
              className="employee-hub__settings-btn"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={18} aria-hidden />
              Cài đặt nhân viên
            </button>
          )}
        </div>
      </header>

      {error && <div className="employee-hub__error">{error}</div>}

      <div className="employee-hub__layout">
        <aside
          className={`employee-hub__branches ${mobileView === 'branches' ? 'employee-hub__panel--visible' : ''}`}
        >
          <h2 className="employee-hub__panel-title">Chi nhánh</h2>
          <ul className="employee-hub__branch-list">
            {branchOptions.map((branch) => (
              <li key={branch.id || 'all'}>
                <button
                  type="button"
                  className={`employee-hub__branch-btn ${selectedBranchId === branch.id ? 'is-active' : ''}`}
                  onClick={() => handleSelectBranch(branch.id)}
                >
                  {branch.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section
          className={`employee-hub__list ${mobileView === 'list' ? 'employee-hub__panel--visible' : ''}`}
        >
          <div className="employee-hub__list-toolbar">
            {mobileView !== 'branches' && (
              <button
                type="button"
                className="employee-hub__back"
                onClick={() => setMobileView('branches')}
              >
                <ChevronLeft size={18} aria-hidden />
                Chi nhánh
              </button>
            )}
            <h2 className="employee-hub__panel-title">
              {selectedBranchId
                ? getBranchById(selectedBranchId)?.name ?? 'Chi nhánh'
                : 'Tất cả chi nhánh'}
              <span className="employee-hub__count">{filteredEmployees.length} NV</span>
            </h2>
          </div>

          <div className="employee-hub__filters">
            <label className="employee-hub__search">
              <Search size={16} aria-hidden />
              <input
                type="search"
                placeholder="Tìm tên, SĐT..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Lọc trạng thái"
            >
              <option value="">Đang làm + Nghỉ phép</option>
              {EMPLOYEE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {isAdmin() && (
              <label className="employee-hub__archived-toggle">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                Hiện NV đã lưu trữ / nghỉ việc
              </label>
            )}
          </div>

          {loading ? (
            <p className="employee-hub__loading">Đang tải dữ liệu từ Supabase...</p>
          ) : filteredEmployees.length === 0 ? (
            <p className="employee-hub__empty">Không có nhân viên phù hợp</p>
          ) : (
            <ul className="employee-hub__employee-list">
              {filteredEmployees.map((emp) => {
                const stats = statsMap.get(emp.id)
                return (
                  <li key={emp.id}>
                    <button
                      type="button"
                      className={`employee-hub__employee-card ${selectedEmployeeId === emp.id ? 'is-active' : ''}`}
                      onClick={() => handleSelectEmployee(emp.id)}
                    >
                      <div className="employee-hub__employee-card-head">
                        <strong>{emp.name}</strong>
                        <StatusBadge status={emp.status} />
                      </div>
                      <div className="employee-hub__employee-card-meta">
                        <span>{emp.phone || '—'}</span>
                        {emp.position && <span>{emp.position}</span>}
                        {!selectedBranchId && (
                          <span>{getBranchById(emp.branchId)?.name ?? '—'}</span>
                        )}
                      </div>
                      <div className="employee-hub__employee-card-stats">
                        <div>
                          <span>Doanh thu tiền vé</span>
                          <strong>{formatCurrency(stats?.serviceRevenue ?? 0)}</strong>
                        </div>
                        <div>
                          <span>Tips</span>
                          <strong className="is-tips">{formatCurrency(stats?.tips ?? 0)}</strong>
                        </div>
                        <div>
                          <span>Hoa hồng</span>
                          <strong>{formatCurrency(stats?.serviceCommission ?? 0)}</strong>
                        </div>
                        <div>
                          <span>Lương</span>
                          <strong className="is-salary">{formatCurrency(stats?.totalSalary ?? 0)}</strong>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <aside
          className={`employee-hub__detail ${mobileView === 'detail' ? 'employee-hub__panel--visible' : ''}`}
        >
          {mobileView === 'detail' && (
            <button
              type="button"
              className="employee-hub__back"
              onClick={() => setMobileView('list')}
            >
              <ChevronLeft size={18} aria-hidden />
              Danh sách
            </button>
          )}
          <EmployeeHubDetail
            employee={selectedEmployee}
            invoices={invoices}
            month={month}
            onEdit={
              selectedEmployeeId &&
              canEditEmployee(employees.find((e) => e.id === selectedEmployeeId))
                ? () => setSettingsOpen(true)
                : undefined
            }
          />
        </aside>
      </div>

      <EmployeeHubSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        employees={employees}
        selectedEmployee={employees.find((e) => e.id === selectedEmployeeId) ?? null}
        onSaved={handleSaved}
        showToast={showToast}
      />
    </div>
  )
}
