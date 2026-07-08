import { useEffect, useMemo, useState } from 'react'
import Layout from './components/layout/Layout'
import EmployeeProfileBanner from './components/employees/EmployeeProfileBanner'
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
  canAccessBranchesPage,
  canAccessServiceCatalogPage,
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
import AdminBranches from './pages/AdminBranches'
import EmployeeAttendanceLanding from './components/attendance/EmployeeAttendanceLanding'
import './components/employees/employee-profile-ui.css'
import { clearLegacySession, loadCurrentUser, saveCurrentUser, clearCurrentUser } from './utils/authStorage'
import { ensureCredentialsHashed, syncEmployeeCredentialsFromEmployees, syncMissingBranchCredentials, repairEmployeeCredentials } from './utils/credentialsStorage'
import { syncAllCustomBranchPricing, stripFlatBranchGroupedCatalog } from './utils/branchPricingStorage'
import { ensureServiceCatalogV2Migrated } from './utils/serviceCatalogV2Storage'
import { syncMissingDefaultBranches } from './utils/branchStorage'
import { repairBranchIdReferences } from './utils/branchIdIntegrity'
import { repairCanonicalBranchMapping } from './utils/canonicalBranchRepair'
import { getEmployeeById, syncMissingDefaultEmployees } from './utils/employeeStorage'
import { ROLES } from './constants/roles'
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
  'admin-branches': AdminBranches,
  expenses: Expenses,
  'admin-services': AdminServices,
  employees: Employees,
  'legacy-sync': LegacySync,
  profile: MyProfile,
  settings: Settings,
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
  const syncVersion = useDataSyncVersion()

  useEffect(() => {
    if (!authReady || !currentUser) return
    if (currentUser.role !== ROLES.EMPLOYEE) {
      setAttendanceGatePassed(true)
      setAttendanceCheckReady(true)
      return
    }
    setAttendanceGatePassed(false)
    setAttendanceCheckReady(true)
  }, [authReady, currentUser])

  useEffect(() => {
    let cancelled = false
    let stopSync = () => {}

    async function bootstrap() {
      clearLegacySession()
      repairCanonicalBranchMapping()
      syncMissingDefaultBranches()
      repairBranchIdReferences()
      syncMissingDefaultEmployees()
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
          if (user.role === ROLES.EMPLOYEE) {
            setAttendanceGatePassed(false)
            setAttendanceCheckReady(true)
          } else {
            setAttendanceGatePassed(true)
            setAttendanceCheckReady(true)
            setActivePage(getDefaultPage(user))
          }
        }}
      />
    )
  }

  const completeAttendanceGate = () => {
    setAttendanceGatePassed(true)
    setActivePage('invoices')
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
    if (!canAccessPage(pageId)) return
    setActivePage(pageId)
  }

  const handleLogout = () => {
    clearCurrentUser()
    setCurrentUser(null)
    setAttendanceGatePassed(true)
    setAttendanceCheckReady(true)
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
      <Page key={activePage} onNavigate={handleNavigate} />
    </Layout>
  )
}

export default App
