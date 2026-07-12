import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from './components/layout/Layout'
import EmployeeProfileBanner from './components/employees/EmployeeProfileBanner'
import UnsyncedInvoicesBanner from './components/invoice/UnsyncedInvoicesBanner'
import Payroll1NoticeModal from './components/payroll1/Payroll1NoticeModal'
import Payroll1StatusBanner from './components/payroll1/Payroll1StatusBanner'
import { useDataSyncVersion } from './hooks/useDataSyncVersion'
import {
  canAccessEmployeesPage,
  canAccessExpensesPage,
  canAccessCustomersPage,
  canAccessAttendancePage,
  canAccessSalaryPage,
  canAccessInvoicesPage,
  canAccessLegacySyncPage,
  canAccessMyProfilePage,
  canAccessPayroll1AdminPage,
  canAccessPayroll1CheckPage,
  canAccessSettingsPage,
  canAccessBranchesPage,
  canAccessServiceCatalogPage,
  canViewReport,
  getCurrentUserEmployeeId,
  getCurrentUserRole,
  isEmployee,
} from './constants/auth'
import Dashboard from './pages/Dashboard'
import AdminEmployees from './pages/AdminEmployees'
import AdminServices from './pages/AdminServices'
import Employees from './pages/Employees'
import Expenses from './pages/Expenses'
import Invoice from './pages/Invoice'
import Login from './pages/Login'
import MyProfile from './pages/MyProfile'
import Report from './pages/Report'
import Revenue from './pages/Revenue'
import Customers from './pages/Customers'
import Attendance from './pages/Attendance'
import Salary from './pages/Salary'
import LegacySync from './pages/LegacySync'
import Settings from './pages/Settings'
import AdminBranches from './pages/AdminBranches'
import Payroll1Check from './pages/Payroll1Check'
import Payroll1Admin from './pages/Payroll1Admin'
import EmployeeAttendanceLanding from './components/attendance/EmployeeAttendanceLanding'
import './components/employees/employee-profile-ui.css'
import { clearLegacySession, loadCurrentUser, saveCurrentUser, clearCurrentUser } from './utils/authStorage'
import { ensureCredentialsHashed, syncEmployeeCredentialsFromEmployees, syncMissingBranchCredentials, repairEmployeeCredentials } from './utils/credentialsStorage'
import { syncAllCustomBranchPricing, stripFlatBranchGroupedCatalog } from './utils/branchPricingStorage'
import { ensureServiceCatalogV2Migrated } from './utils/serviceCatalogV2Storage'
import { syncMissingDefaultBranches } from './utils/branchStorage'
import { repairBranchIdReferences } from './utils/branchIdIntegrity'
import { repairCanonicalBranchMapping } from './utils/canonicalBranchRepair'
import { getEmployeeById } from './utils/employeeStorage'
import { ROLES } from './constants/roles'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { runInitialSync, startAutoSync, notifyDataSynced } from './utils/supabaseSync'
import { loadEmployeePayroll1Status } from './utils/payroll1Service'
import { shouldShowPayroll1Notice } from './utils/payroll1Policy'

const PAGES = {
  dashboard: Dashboard,
  reports: Report,
  revenue: Revenue,
  invoices: Invoice,
  customers: Customers,
  attendance: Attendance,
  salary: Salary,
  'admin-employees': AdminEmployees,
  'admin-branches': AdminBranches,
  expenses: Expenses,
  'admin-services': AdminServices,
  employees: Employees,
  'legacy-sync': LegacySync,
  profile: MyProfile,
  settings: Settings,
  'payroll1-check': Payroll1Check,
  'payroll1-admin': Payroll1Admin,
}

function getDefaultPage(user) {
  if (user?.role === ROLES.EMPLOYEE) return 'invoices'
  return 'dashboard'
}

function canAccessPage(pageId) {
  if (pageId === 'employees') return canAccessEmployeesPage()
  if (pageId === 'admin-services') return canAccessServiceCatalogPage()
  if (pageId === 'settings') return canAccessSettingsPage()
  if (pageId === 'admin-branches') return canAccessBranchesPage()
  if (pageId === 'revenue') return canViewReport()
  if (pageId === 'invoices') return canAccessInvoicesPage()
  if (pageId === 'customers') return canAccessCustomersPage()
  if (pageId === 'attendance') return canAccessAttendancePage()
  if (pageId === 'salary') return canAccessSalaryPage()
  if (pageId === 'expenses') return canAccessExpensesPage()
  if (pageId === 'reports') return canViewReport()
  if (pageId === 'legacy-sync') return canAccessLegacySyncPage()
  if (pageId === 'profile') return canAccessMyProfilePage()
  if (pageId === 'payroll1-check') return canAccessPayroll1CheckPage()
  if (pageId === 'payroll1-admin') return canAccessPayroll1AdminPage()
  return true
}

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    clearLegacySession()
    return loadCurrentUser()
  })
  const [activePage, setActivePage] = useState(() => getDefaultPage(loadCurrentUser()))
  const [authReady, setAuthReady] = useState(false)
  const [attendanceGatePassed, setAttendanceGatePassed] = useState(() => {
    const user = loadCurrentUser()
    if (user?.role !== ROLES.EMPLOYEE) return true
    return false
  })
  const [attendanceCheckReady, setAttendanceCheckReady] = useState(() => {
    const user = loadCurrentUser()
    return user?.role !== ROLES.EMPLOYEE
  })
  const [payroll1Status, setPayroll1Status] = useState(null)
  const [showPayroll1Notice, setShowPayroll1Notice] = useState(false)
  const [payroll1ModalDismissed, setPayroll1ModalDismissed] = useState(false)
  const syncVersion = useDataSyncVersion()

  useEffect(() => {
    if (!authReady || !currentUser) return
    if (currentUser.role !== ROLES.EMPLOYEE) {
      setAttendanceGatePassed(true)
      setAttendanceCheckReady(true)
      return
    }
    setAttendanceCheckReady(true)
  }, [authReady, currentUser])

  useEffect(() => {
    if (!authReady || !currentUser || currentUser.role !== ROLES.EMPLOYEE) {
      setShowPayroll1Notice(false)
      setPayroll1Status(null)
      return
    }
    if (!attendanceGatePassed) return

    let cancelled = false
    async function loadNotice() {
      try {
        const status = await loadEmployeePayroll1Status(getCurrentUserEmployeeId())
        if (cancelled) return
        setPayroll1Status(status)
        // Không lưu "đã đọc" — chỉ ẩn popup trong phiên hiện tại sau khi user chọn Tiếp tục.
        const incomplete = shouldShowPayroll1Notice(status)
        setShowPayroll1Notice(incomplete && !payroll1ModalDismissed)
        if (status?.dataComplete) setPayroll1ModalDismissed(false)
      } catch (error) {
        console.warn('[payroll1] Không tải trạng thái thông báo:', error?.message)
      }
    }
    loadNotice()
    return () => { cancelled = true }
  }, [authReady, currentUser, attendanceGatePassed, syncVersion, activePage, payroll1ModalDismissed])

  const completeAttendanceGate = useCallback(() => {
    setAttendanceGatePassed(true)
    setActivePage('invoices')
  }, [])

  useEffect(() => {
    let cancelled = false
    let stopSync = () => {}

    async function bootstrap() {
      try {
        clearLegacySession()
        try {
          repairCanonicalBranchMapping()
        } catch (repairError) {
          console.warn('[Bootstrap] repairCanonicalBranchMapping:', repairError?.message)
        }
        syncMissingDefaultBranches()
        repairBranchIdReferences()
        stripFlatBranchGroupedCatalog()
        ensureServiceCatalogV2Migrated()
        await Promise.all([ensureCredentialsHashed(), syncMissingBranchCredentials()])
        await repairEmployeeCredentials()
        syncAllCustomBranchPricing()

        if (isSupabaseConfigured) {
          await runInitialSync()
        }

        await syncEmployeeCredentialsFromEmployees()
        notifyDataSynced(['employees', 'credentials'])
      } catch (error) {
        console.error('[Bootstrap] Lỗi khởi tạo — vẫn cho phép vào app:', error?.message ?? error)
      } finally {
        if (cancelled) return
        setAuthReady(true)
        stopSync = startAutoSync({ skipInitialPull: true })
      }
    }

    bootstrap()

    return () => {
      cancelled = true
      stopSync()
    }
  }, [])

  const myEmployee = useMemo(() => {
    if (!isEmployee()) return null
    return getEmployeeById(getCurrentUserEmployeeId())
  }, [currentUser, syncVersion, activePage])

  if (!authReady) {
    return (
      <div className="app-loading" style={{ padding: 24, textAlign: 'center', color: '#6b7280', background: '#f4f5f7', minHeight: '100vh' }}>
        Đang tải...
      </div>
    )
  }

  if (!currentUser) {
    return (
      <Login
        onLogin={(user) => {
          saveCurrentUser(user)
          setCurrentUser(user)
          setPayroll1ModalDismissed(false)
          if (user.role === ROLES.EMPLOYEE) {
            setAttendanceGatePassed(false)
            setAttendanceCheckReady(true)
            setShowPayroll1Notice(false)
          } else {
            setAttendanceGatePassed(true)
            setAttendanceCheckReady(true)
            setActivePage(getDefaultPage(user))
          }
        }}
      />
    )
  }

  if (isEmployee() && !attendanceCheckReady) {
    return (
      <div className="app-loading" style={{ padding: 24, textAlign: 'center', color: '#6b7280', background: '#f4f5f7', minHeight: '100vh' }}>
        Đang kiểm tra điểm danh...
      </div>
    )
  }

  if (isEmployee() && !attendanceGatePassed) {
    return <EmployeeAttendanceLanding onComplete={completeAttendanceGate} />
  }

  const handleNavigate = (pageId) => {
    if (!PAGES[pageId]) {
      console.warn('[nav] unknown page:', pageId)
      return
    }
    if (!canAccessPage(pageId)) {
      console.warn('[nav] access denied:', pageId, 'role=', getCurrentUserRole?.() ?? currentUser?.role)
      return
    }
    setActivePage(pageId)
  }

  const handleLogout = () => {
    clearCurrentUser()
    setCurrentUser(null)
    setAttendanceGatePassed(true)
    setAttendanceCheckReady(true)
    setShowPayroll1Notice(false)
    setPayroll1Status(null)
    setPayroll1ModalDismissed(false)
  }

  const Page = PAGES[activePage] ?? (isEmployee() ? Dashboard : Invoice)

  return (
    <Layout
      activeItem={activePage}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
      banner={isEmployee() && myEmployee ? (
        <EmployeeProfileBanner
          employee={myEmployee}
          onUpdateProfile={() => handleNavigate('profile')}
        />
      ) : null}
    >
      <UnsyncedInvoicesBanner
        user={currentUser}
        onSyncComplete={() => notifyDataSynced(['invoices'])}
      />
      {isEmployee() && payroll1Status && (
        <Payroll1StatusBanner
          status={payroll1Status}
          onNavigate={handleNavigate}
          onOpenTasks={() => {
            setPayroll1ModalDismissed(false)
            setShowPayroll1Notice(shouldShowPayroll1Notice(payroll1Status))
          }}
        />
      )}
      {showPayroll1Notice && (
        <Payroll1NoticeModal
          status={payroll1Status}
          onNavigate={(pageId) => {
            setPayroll1ModalDismissed(true)
            setShowPayroll1Notice(false)
            handleNavigate(pageId)
          }}
          onContinue={() => {
            setPayroll1ModalDismissed(true)
            setShowPayroll1Notice(false)
          }}
        />
      )}
      <Page key={activePage} onNavigate={handleNavigate} />
    </Layout>
  )
}

export default App
