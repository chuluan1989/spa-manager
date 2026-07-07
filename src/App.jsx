import { useEffect, useState } from 'react'
import Layout from './components/layout/Layout'
import {
  canAccessEmployeesPage,
  canAccessExpensesPage,
  canAccessInvoicesPage,
  canAccessMyProfilePage,
  canAccessSettingsPage,
  canViewReport,
  getCurrentUserEmployeeId,
  isEmployee,
} from './constants/auth'
import Dashboard from './pages/Dashboard'
import Employees from './pages/Employees'
import Expenses from './pages/Expenses'
import Invoice from './pages/Invoice'
import Landing from './pages/Landing'
import Login from './pages/Login'
import MyProfile from './pages/MyProfile'
import Report from './pages/Report'
import Settings from './pages/Settings'
import { clearLegacySession, loadCurrentUser, saveCurrentUser, clearCurrentUser } from './utils/authStorage'
import { ensureCredentialsHashed, syncMissingBranchCredentials } from './utils/credentialsStorage'
import { syncAllCustomBranchPricing } from './utils/branchPricingStorage'
import { syncMissingDefaultBranches } from './utils/branchStorage'
import { getEmployeeById, isEmployeeProfileComplete } from './utils/employeeStorage'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { runInitialSync, startAutoSync } from './utils/supabaseSync'

const PAGES = {
  dashboard: Dashboard,
  invoices: Invoice,
  expenses: Expenses,
  employees: Employees,
  reports: Report,
  profile: MyProfile,
  settings: Settings,
}

function getDefaultPage(user) {
  if (user?.role === 'employee') return 'dashboard'
  return 'invoices'
}

function canAccessPage(pageId) {
  if (pageId === 'employees') return canAccessEmployeesPage()
  if (pageId === 'settings') return canAccessSettingsPage()
  if (pageId === 'invoices') return canAccessInvoicesPage()
  if (pageId === 'expenses') return canAccessExpensesPage()
  if (pageId === 'reports') return canViewReport()
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
  const [profileTick, setProfileTick] = useState(0)
  const [authView, setAuthView] = useState('landing')

  useEffect(() => {
    let cancelled = false
    let stopSync = () => {}

    async function bootstrap() {
      clearLegacySession()
      syncMissingDefaultBranches()
      await Promise.all([ensureCredentialsHashed(), syncMissingBranchCredentials()])
      syncAllCustomBranchPricing()

      // Nếu đã cấu hình Supabase: CHỜ đồng bộ dữ liệu mới nhất về trước khi
      // vào app, để Supabase thực sự là nguồn dữ liệu chính mỗi lần mở app
      // — không phải chờ vòng polling nền mới thấy dữ liệu từ thiết bị
      // khác. Có timeout để mất mạng không treo màn hình loading mãi (khi
      // đó tạm dùng cache LocalStorage, Realtime/polling sẽ tự bù sau).
      if (isSupabaseConfigured) {
        await runInitialSync()
      }

      if (cancelled) return
      setAuthReady(true)

      // Tiếp tục đồng bộ liên tục: Realtime (gần như tức thời) + polling dự
      // phòng. Không gọi lại migrate/pull lần đầu vì runInitialSync() đã
      // làm rồi ở trên.
      stopSync = startAutoSync({ skipInitialPull: true })
    }

    bootstrap()

    return () => {
      cancelled = true
      stopSync()
    }
  }, [])

  if (!authReady) {
    return (
      <div className="app-loading" style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
        Đang tải...
      </div>
    )
  }

  if (!currentUser) {
    if (authView === 'landing') {
      return <Landing onStart={() => setAuthView('login')} />
    }

    return (
      <Login
        onBack={() => setAuthView('landing')}
        onLogin={(user) => {
          saveCurrentUser(user)
          setCurrentUser(user)
          setActivePage(getDefaultPage(user))
        }}
      />
    )
  }

  if (isEmployee()) {
    const myEmployee = getEmployeeById(getCurrentUserEmployeeId())
    if (!isEmployeeProfileComplete(myEmployee)) {
      return (
        <div className="app-onboarding" style={{ padding: 24 }}>
          <MyProfile
            key={profileTick}
            mandatory
            onCompleted={() => setProfileTick((tick) => tick + 1)}
          />
        </div>
      )
    }
  }

  const handleNavigate = (pageId) => {
    if (!canAccessPage(pageId)) return
    setActivePage(pageId)
  }

  const handleLogout = () => {
    clearCurrentUser()
    setCurrentUser(null)
    setAuthView('landing')
  }

  const Page = PAGES[activePage] ?? (isEmployee() ? Dashboard : Invoice)

  return (
    <Layout
      activeItem={activePage}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
    >
      <Page key={activePage} />
    </Layout>
  )
}

export default App
