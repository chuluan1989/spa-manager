import { useEffect, useMemo, useState } from 'react'
import Layout from './components/layout/Layout'
import UnsyncedInvoicesBanner from './components/invoice/UnsyncedInvoicesBanner'
import CompletionRemindBanner, {
  useCompletionRemindDismissed,
} from './components/common/CompletionRemindBanner'
import TodayAttendanceRemindBanner, {
  dismissTodayAttendanceRemind,
  isTodayAttendanceRemindDismissed,
} from './components/common/TodayAttendanceRemindBanner'
import PayrollCloseRemindBanner from './components/common/PayrollCloseRemindBanner'
import MissingAttendanceRemindBanner from './components/common/MissingAttendanceRemindBanner'
import { shouldShowPayrollCloseRemind } from './utils/payrollCycleClose/closeRemind'
import {
  consumeAppNavigate,
  setPayrollClosePrefill,
} from './utils/navigationPrefill'
import { migrateLocalInvoicesToSupabase } from './utils/invoiceLegacyMigrate'
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
import MandatoryPasswordChange from './components/account/MandatoryPasswordChange'
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
import OperationsCenter from './pages/OperationsCenter'
import OperationWorkflow from './pages/OperationWorkflow'
import { canAccessOpsCenter } from './utils/opsCenter/opsCenterAccess'
import { canAccessOperationWorkflow } from './utils/operationWorkflow/operationWorkflowAccess'
import './components/employees/employee-profile-ui.css'
import { clearLegacySession, loadCurrentUser, saveCurrentUser, clearCurrentUser } from './utils/authStorage'
import { ensureCredentialsHashed, syncEmployeeCredentialsFromEmployees, syncMissingBranchCredentials, repairEmployeeCredentials } from './utils/credentialsStorage'
import { syncAllCustomBranchPricing, stripFlatBranchGroupedCatalog } from './utils/branchPricingStorage'
import { ensureServiceCatalogV2Migrated } from './utils/serviceCatalogV2Storage'
import { syncMissingDefaultBranches } from './utils/branchStorage'
import { repairBranchIdReferences } from './utils/branchIdIntegrity'
import { repairCanonicalBranchMapping } from './utils/canonicalBranchRepair'
import { ROLES } from './constants/roles'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { runInitialSync, startAutoSync, notifyDataSynced } from './utils/supabaseSync'
import { loadEmployeePayroll1Status } from './utils/payroll1Service'
import { hasCheckedInToday, getServerAttendanceDate } from './utils/attendanceService'
import { getTodayDate } from './utils/invoiceStorage'

const PAGES = {
  dashboard: Dashboard,
  'ops-center': OperationsCenter,
  'operation-workflow': OperationWorkflow,
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
  if (user?.role === ROLES.EMPLOYEE) return 'attendance'
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
  if (pageId === 'ops-center') return canAccessOpsCenter()
  if (pageId === 'operation-workflow') return canAccessOperationWorkflow()
  return true
}

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    clearLegacySession()
    return loadCurrentUser()
  })
  const [activePage, setActivePage] = useState(() => getDefaultPage(loadCurrentUser()))
  const [authReady, setAuthReady] = useState(false)
  const [completionStatus, setCompletionStatus] = useState(null)
  const [todayCheckedIn, setTodayCheckedIn] = useState(null)
  const [todayServerDate, setTodayServerDate] = useState(() => getTodayDate())
  const [todayRemindDismissed, setTodayRemindDismissed] = useState(false)
  const [payrollCloseRemind, setPayrollCloseRemind] = useState(null)
  const [payrollCloseRemindChecklist, setPayrollCloseRemindChecklist] = useState(null)
  const [payrollCloseRemindCollapsed, setPayrollCloseRemindCollapsed] = useState(false)
  const [payrollCloseSyncing, setPayrollCloseSyncing] = useState(false)
  const [missingAttendRemindKey, setMissingAttendRemindKey] = useState(0)
  const syncVersion = useDataSyncVersion()
  const employeeId = currentUser?.role === ROLES.EMPLOYEE ? getCurrentUserEmployeeId() : ''
  const [remindDismissed, dismissRemind] = useCompletionRemindDismissed(employeeId)

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
      }
      if (!cancelled) {
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

  // Chỉ tải trạng thái để banner nhắc — không khóa Hóa đơn, không popup.
  useEffect(() => {
    if (!authReady || !currentUser || currentUser.role !== ROLES.EMPLOYEE) {
      setCompletionStatus(null)
      setTodayCheckedIn(null)
      setPayrollCloseRemind(null)
      setPayrollCloseRemindChecklist(null)
      setPayrollCloseRemindCollapsed(false)
      return
    }

    let cancelled = false
    async function loadStatus() {
      try {
        const empId = getCurrentUserEmployeeId()
        const [status, server, checked] = await Promise.all([
          loadEmployeePayroll1Status(empId),
          getServerAttendanceDate().catch(() => ({ date: getTodayDate() })),
          hasCheckedInToday(empId).catch(() => true),
        ])
        if (cancelled) return
        const today = server?.date || getTodayDate()
        setCompletionStatus(status)
        setTodayServerDate(today)
        setTodayCheckedIn(Boolean(checked))
        setTodayRemindDismissed(isTodayAttendanceRemindDismissed(empId, today))

        const closeCheck = await shouldShowPayrollCloseRemind({
          employeeId: empId,
          todayDate: today,
          user: currentUser,
        }).catch(() => ({ show: false, target: null, checklist: null }))
        if (cancelled) return
        if (closeCheck?.show && closeCheck.target) {
          const next = closeCheck.target
          setPayrollCloseRemind((prev) => {
            if (
              !prev
              || prev.billingMonth !== next.billingMonth
              || prev.cycle !== next.cycle
            ) {
              setTimeout(() => setPayrollCloseRemindCollapsed(false), 0)
            }
            return next
          })
          setPayrollCloseRemindChecklist(closeCheck.checklist ?? null)
        } else {
          setPayrollCloseRemind(null)
          setPayrollCloseRemindChecklist(null)
          setPayrollCloseRemindCollapsed(false)
        }
      } catch (error) {
        console.warn('[completion-remind] Không tải trạng thái nhắc:', error?.message)
        if (!cancelled) {
          setCompletionStatus(null)
          setTodayCheckedIn(null)
          setPayrollCloseRemind(null)
          setPayrollCloseRemindChecklist(null)
        }
      }
    }
    loadStatus()
    return () => { cancelled = true }
  }, [authReady, currentUser, syncVersion, activePage])

  const showRemind = useMemo(
    () => {
      void currentUser
      void syncVersion
      return Boolean(
        isEmployee()
        && completionStatus
        && !completionStatus.dataComplete
        && !remindDismissed,
      )
    },
    [completionStatus, remindDismissed, currentUser, syncVersion],
  )

  const showTodayAttendanceRemind = useMemo(
    () => {
      void currentUser
      void syncVersion
      return Boolean(
        isEmployee()
        && todayCheckedIn === false
        && !todayRemindDismissed
        && activePage !== 'attendance',
      )
    },
    [todayCheckedIn, todayRemindDismissed, currentUser, syncVersion, activePage],
  )

  const showPayrollCloseRemind = useMemo(
    () => {
      void currentUser
      void syncVersion
      return Boolean(
        isEmployee()
        && payrollCloseRemind
        && activePage !== 'salary',
      )
    },
    [payrollCloseRemind, currentUser, syncVersion, activePage],
  )

  useEffect(() => {
    function onNavigateRequest() {
      const pageId = consumeAppNavigate()
      if (!pageId || !PAGES[pageId]) return
      if (!canAccessPage(pageId)) return
      setActivePage(pageId)
    }
    window.addEventListener('spa-app-navigate', onNavigateRequest)
    return () => window.removeEventListener('spa-app-navigate', onNavigateRequest)
  }, [])

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
          if (!user.mustChangePassword) {
            setActivePage(getDefaultPage(user))
          }
        }}
      />
    )
  }

  const handleMandatoryPasswordComplete = () => {
    const updated = { ...currentUser, mustChangePassword: false }
    saveCurrentUser(updated)
    setCurrentUser(updated)
    setActivePage(getDefaultPage(updated))
  }

  if (currentUser.mustChangePassword) {
    return (
      <MandatoryPasswordChange
        user={currentUser}
        onComplete={handleMandatoryPasswordComplete}
      />
    )
  }

  const handleLogout = () => {
    clearCurrentUser()
    setCurrentUser(null)
    setCompletionStatus(null)
    setTodayCheckedIn(null)
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

  const handleCompleteNow = () => {
    if (!completionStatus?.profileComplete) {
      handleNavigate('profile')
      return
    }
    if (!completionStatus?.attendanceComplete) {
      handleNavigate('attendance')
      return
    }
  }

  const Page = PAGES[activePage] ?? (isEmployee() ? Attendance : Invoice)

  return (
    <Layout
      activeItem={activePage}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
    >
      {showTodayAttendanceRemind && (
        <TodayAttendanceRemindBanner
          onCheckInNow={() => handleNavigate('attendance')}
          onDismiss={() => {
            dismissTodayAttendanceRemind(employeeId, todayServerDate)
            setTodayRemindDismissed(true)
          }}
        />
      )}
      {isEmployee() && (
        <MissingAttendanceRemindBanner
          key={`${syncVersion}-${missingAttendRemindKey}`}
          onGoAttendance={() => handleNavigate('attendance')}
          onDismiss={() => setMissingAttendRemindKey((n) => n + 1)}
        />
      )}
      {showPayrollCloseRemind && payrollCloseRemind && (
        <PayrollCloseRemindBanner
          cycleLabel={payrollCloseRemind.cycleLabel}
          rangeLabel={payrollCloseRemind.rangeLabel}
          checklist={payrollCloseRemindChecklist}
          collapsed={payrollCloseRemindCollapsed}
          syncing={payrollCloseSyncing}
          onExpand={() => setPayrollCloseRemindCollapsed(false)}
          onCollapse={() => setPayrollCloseRemindCollapsed(true)}
          onGoAttendance={() => handleNavigate('attendance')}
          onSyncNow={async () => {
            setPayrollCloseSyncing(true)
            try {
              const result = await migrateLocalInvoicesToSupabase(currentUser)
              if (!result?.success) {
                throw new Error(result?.error || result?.message || 'Đồng bộ thất bại.')
              }
              notifyDataSynced(['invoices'])
            } finally {
              setPayrollCloseSyncing(false)
            }
          }}
          onOpenSalary={() => {
            setPayrollClosePrefill({
              billingMonth: payrollCloseRemind.billingMonth,
              cycle: payrollCloseRemind.cycle,
            })
            handleNavigate('salary')
          }}
        />
      )}
      {showRemind && (
        <CompletionRemindBanner
          status={completionStatus}
          onCompleteNow={handleCompleteNow}
          onDismiss={dismissRemind}
        />
      )}
      <UnsyncedInvoicesBanner
        user={currentUser}
        onSyncComplete={() => notifyDataSynced(['invoices'])}
      />
      <Page key={activePage} onNavigate={handleNavigate} />
    </Layout>
  )
}

export default App
