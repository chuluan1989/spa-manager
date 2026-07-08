import { useEffect, useMemo, useState } from 'react'
import Layout from './components/layout/Layout'
import EmployeeProfileBanner from './components/employees/EmployeeProfileBanner'
import EmployeeProfileLockModal from './components/employees/EmployeeProfileLockModal'
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
  canAccessSettingsPage,
  canViewReport,
  getCurrentUserEmployeeId,
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
import EmployeeAttendanceGate from './components/attendance/EmployeeAttendanceGate'
import './components/employees/employee-profile-ui.css'
import { clearLegacySession, loadCurrentUser, saveCurrentUser, clearCurrentUser } from './utils/authStorage'
import { ensureCredentialsHashed, syncEmployeeCredentialsFromEmployees, syncMissingBranchCredentials } from './utils/credentialsStorage'
import { syncAllCustomBranchPricing } from './utils/branchPricingStorage'
import { syncMissingDefaultBranches } from './utils/branchStorage'
import { getEmployeeById, syncMissingDefaultEmployees } from './utils/employeeStorage'
import { isEmployeeProfileLocked } from './utils/employeeProfilePolicy'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { runInitialSync, startAutoSync, notifyDataSynced } from './utils/supabaseSync'

const PAGES = {
  dashboard: Dashboard,
  reports: Report,
  revenue: Revenue,
  invoices: Invoice,
  customers: Customers,
  attendance: Attendance,
  salary: Salary,
  'admin-employees': AdminEmployees,
  expenses: Expenses,
  'admin-services': AdminServices,
  employees: Employees,
  'legacy-sync': LegacySync,
  profile: MyProfile,
  settings: Settings,
}

const EMPLOYEE_LOCKED_PAGES = new Set(['invoices', 'attendance'])

function getDefaultPage(user) {
  if (user?.role === 'admin' || user?.role === 'employee') return 'dashboard'
  return 'dashboard'
}

function canAccessPage(pageId) {
  if (pageId === 'employees') return canAccessEmployeesPage()
  if (pageId === 'admin-employees' || pageId === 'admin-services') return canAccessSettingsPage()
  if (pageId === 'settings') return canAccessSettingsPage()
  if (pageId === 'revenue') return canViewReport()
  if (pageId === 'invoices') return canAccessInvoicesPage()
  if (pageId === 'customers') return canAccessCustomersPage()
  if (pageId === 'attendance') return canAccessAttendancePage()
  if (pageId === 'salary') return canAccessSalaryPage()
  if (pageId === 'expenses') return canAccessExpensesPage()
  if (pageId === 'reports') return canViewReport()
  if (pageId === 'legacy-sync') return canAccessLegacySyncPage()
  if (pageId === 'profile') return canAccessMyProfilePage()
  return true
}

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    clearLegacySession()
    return loadCurrentUser()
  })
  const [activePage, setActivePage] = useState(() => getDefaultPage(loadCurrentUser()))
  const [authReady, setAuthReady] = useState(false)
  const [profileLockOpen, setProfileLockOpen] = useState(false)
  const syncVersion = useDataSyncVersion()

  useEffect(() => {
    let cancelled = false
    let stopSync = () => {}

    async function bootstrap() {
      clearLegacySession()
      syncMissingDefaultBranches()
      syncMissingDefaultEmployees()
      await Promise.all([ensureCredentialsHashed(), syncMissingBranchCredentials()])
      syncAllCustomBranchPricing()

      if (isSupabaseConfigured) {
        await runInitialSync()
      }

      await syncEmployeeCredentialsFromEmployees()
      notifyDataSynced(['employees', 'credentials'])

      if (cancelled) return
      setAuthReady(true)
      stopSync = startAutoSync({ skipInitialPull: true })
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
          setActivePage(getDefaultPage(user))
        }}
      />
    )
  }

  const handleNavigate = (pageId) => {
    if (!canAccessPage(pageId)) return
    if (isEmployee() && EMPLOYEE_LOCKED_PAGES.has(pageId) && isEmployeeProfileLocked(myEmployee)) {
      setProfileLockOpen(true)
      return
    }
    setActivePage(pageId)
  }

  const handleLogout = () => {
    clearCurrentUser()
    setCurrentUser(null)
  }

  const Page = PAGES[activePage] ?? (isEmployee() ? Dashboard : Invoice)

  return (
    <EmployeeAttendanceGate>
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
        <Page key={activePage} onNavigate={handleNavigate} />
      </Layout>

      {profileLockOpen && (
        <EmployeeProfileLockModal
          onClose={() => setProfileLockOpen(false)}
          onUpdateProfile={() => {
            setProfileLockOpen(false)
            setActivePage('profile')
          }}
        />
      )}
    </EmployeeAttendanceGate>
  )
}

export default App
