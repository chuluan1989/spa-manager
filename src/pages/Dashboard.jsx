import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DrillDownExplorer from '../components/drilldown/DrillDownExplorer'
import BusinessCopilot from '../components/copilot/BusinessCopilot'
import OperationWorkflowDashStrip from '../components/operationWorkflow/OperationWorkflowDashStrip'
import CrmGrowthDashStrip from '../components/crmGrowth/CrmGrowthDashStrip'
import { useBusinessCopilotData } from '../hooks/useBusinessCopilotData'
import { consumeDrillDownPrefill, setDrillDownPrefill } from '../utils/navigationPrefill'
import { isAdmin, isEmployee } from '../constants/auth'
import { getActiveBranches, getBranchById } from '../constants/branches'
import { getTodayDate } from '../utils/invoiceStorage'
import { fetchMergedInvoices } from '../utils/invoiceDataFetcher'
import { fetchAttendanceFiltered, subscribeAttendanceChanges } from '../repositories/attendanceRepository'
import { subscribeInvoicesChanges } from '../repositories/invoicesRepository'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { subscribeToDataSync } from '../utils/supabaseSync'
import { useDataSyncVersion } from '../hooks/useDataSyncVersion'
import { getAllActiveEmployees } from '../utils/employeeStorage'
import { formatCurrency, getInvoicePayment, getInvoiceTips } from '../utils/invoice'
import { countUniqueCustomers } from '../utils/drillDownReport'
import { loadDailyTargetsForDate } from '../utils/operationWorkflow/dailyTargetStorage'
import '../components/copilot/BusinessCopilot.css'
import './Dashboard.css'

const CEO_EMPLOYEE_TOP = 10
const CEO_AUTO_REFRESH_MS = 60_000

function resolveEmployeesPage() {
  return isAdmin() ? 'admin-employees' : 'employees'
}

function formatDisplayDate(isoDate) {
  if (!isoDate) return '—'
  const [y, m, d] = String(isoDate).split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return new Date(y, m - 1, d).toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })
}

function sumInvoiceRevenue(invoices = []) {
  return invoices.reduce((sum, inv) => sum + getInvoicePayment(inv), 0)
}

function sumInvoiceTips(invoices = []) {
  return invoices.reduce((sum, inv) => sum + getInvoiceTips(inv), 0)
}

function formatRevenue(value) {
  if (!value || value <= 0) return 'Chưa phát sinh doanh thu'
  return formatCurrency(value)
}

function formatCount(value) {
  if (!value || value <= 0) return '—'
  return String(value)
}

function formatSharePercent(value, total) {
  if (!total || total <= 0 || !value || value <= 0) return '—'
  return `${Math.round((value / total) * 1000) / 10}%`
}

function computeTargetPercentNumeric(revenue, target) {
  if (!target || target <= 0) return null
  if (!revenue || revenue <= 0) return 0
  return Math.round((revenue / target) * 1000) / 10
}

function formatTargetPercent(revenue, target) {
  const pct = computeTargetPercentNumeric(revenue, target)
  if (pct == null) return '—'
  return `${pct}%`
}

function resolveBranchStatus(revenue, dayTarget) {
  const pct = computeTargetPercentNumeric(revenue, dayTarget)

  if (!revenue || revenue <= 0) {
    return { tone: 'red', label: '🔴 Chưa phát sinh' }
  }

  if (pct == null) {
    return { tone: 'yellow', label: '🟡 Chậm' }
  }

  if (pct >= 80) {
    return { tone: 'green', label: '🟢 Đạt' }
  }

  if (pct >= 30) {
    return { tone: 'yellow', label: '🟡 Chậm' }
  }

  return { tone: 'red', label: '🔴 Chưa phát sinh' }
}

function formatAvgPerCustomer(revenue, customers) {
  if (!customers) return '—'
  return formatCurrency(revenue / customers)
}

function groupByBranch(items = []) {
  const groups = new Map()
  for (const item of items) {
    const branchId = item.branchId || 'unknown'
    if (!groups.has(branchId)) {
      groups.set(branchId, {
        branchId,
        branchName: item.branchName || getBranchById(branchId)?.name || '—',
        items: [],
      })
    }
    groups.get(branchId).items.push(item)
  }
  return [...groups.values()]
    .filter((group) => group.items.length > 0)
    .sort((a, b) => a.branchName.localeCompare(b.branchName, 'vi'))
}

function BranchGroupedList({ groups, tone = '' }) {
  return (
    <div className="ceo-dash__branch-groups">
      {groups.map((group) => (
        <div key={group.branchId} className="ceo-dash__branch-group">
          <h3>{group.branchName}</h3>
          <ul className={tone ? `ceo-dash__branch-list ceo-dash__branch-list--${tone}` : 'ceo-dash__branch-list'}>
            {group.items.map((item) => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function CeoDashboard() {
  const today = getTodayDate()
  const syncVersion = useDataSyncVersion()
  const hasPayloadRef = useRef(false)
  const backgroundRefreshRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [payload, setPayload] = useState(null)
  const [showAllEmployees, setShowAllEmployees] = useState(false)

  const reload = useCallback((background = false) => {
    backgroundRefreshRef.current = background
    setRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    hasPayloadRef.current = Boolean(payload)
  }, [payload])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const isBackground = backgroundRefreshRef.current

      if (!isBackground) {
        setLoading(true)
        setError('')
      }

      try {
        if (!isSupabaseConfigured) {
          throw new Error('Supabase chưa cấu hình. Không thể tải tổng quan.')
        }

        const [invoiceResult, attendance] = await Promise.all([
          fetchMergedInvoices({ fromDate: today, toDate: today }),
          fetchAttendanceFiltered({ date: today }),
        ])

        if (cancelled) return

        const invoices = Array.isArray(invoiceResult)
          ? invoiceResult
          : (invoiceResult?.invoices ?? [])

        setPayload({
          invoices: invoices.filter((inv) => inv.date === today),
          attendance: attendance ?? [],
        })
        setError('')
      } catch (err) {
        if (!cancelled && !hasPayloadRef.current) {
          setError(err?.message ?? 'Không thể tải tổng quan.')
          setPayload(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          backgroundRefreshRef.current = false
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [today, refreshKey, syncVersion])

  useEffect(() => subscribeToDataSync(() => reload(true)), [reload])

  useEffect(() => {
    const unsubInvoices = subscribeInvoicesChanges(() => reload(true))
    const unsubAttendance = subscribeAttendanceChanges(() => reload(true))
    return () => {
      unsubInvoices?.()
      unsubAttendance?.()
    }
  }, [reload])

  useEffect(() => {
    const timer = setInterval(() => reload(true), CEO_AUTO_REFRESH_MS)
    return () => clearInterval(timer)
  }, [reload])

  const snapshot = useMemo(() => {
    const invoicesToday = payload?.invoices ?? []
    const attendanceToday = payload?.attendance ?? []
    const branches = getActiveBranches()
    const employees = getAllActiveEmployees()
    const targetRows = loadDailyTargetsForDate(today)
    const targetsByEmployeeId = new Map(targetRows.map((row) => [row.employeeId, row]))

    const totalRevenue = sumInvoiceRevenue(invoicesToday)
    const completedCustomers = countUniqueCustomers(invoicesToday)
    const pendingPaymentCustomers = invoicesToday.filter((inv) => inv.paymentMethod === 'transfer').length

    const branchRows = branches.map((branch) => {
      const branchInvoices = invoicesToday.filter((inv) => inv.branchId === branch.id)
      const revenue = sumInvoiceRevenue(branchInvoices)
      const customers = countUniqueCustomers(branchInvoices)
      const dayTarget = employees
        .filter((emp) => emp.branchId === branch.id)
        .reduce((sum, emp) => sum + (Number(targetsByEmployeeId.get(emp.id)?.revenue) || 0), 0)
      const status = resolveBranchStatus(revenue, dayTarget)

      return {
        id: branch.id,
        name: branch.name || branch.id,
        revenue,
        customers,
        dayTarget,
        targetPercent: formatTargetPercent(revenue, dayTarget),
        statusLabel: status.label,
        statusTone: status.tone,
      }
    }).sort((a, b) => b.revenue - a.revenue)

    const employeeRows = employees.map((emp) => {
      const empInvoices = invoicesToday.filter((inv) => inv.employeeId === emp.id)
      const revenue = sumInvoiceRevenue(empInvoices)
      return {
        id: emp.id,
        name: emp.name,
        branchName: getBranchById(emp.branchId)?.name || '—',
        revenue,
        tourCount: empInvoices.length,
        tips: sumInvoiceTips(empInvoices),
        revenueShare: formatSharePercent(revenue, totalRevenue),
      }
    }).sort((a, b) => b.revenue - a.revenue)

    const attendedIds = new Set(attendanceToday.map((row) => row.employeeId))
    const invoicedIds = new Set(invoicesToday.map((inv) => inv.employeeId))

    const notCheckedIn = employees
      .filter((emp) => !attendedIds.has(emp.id))
      .map((emp) => ({
        id: emp.id,
        name: emp.name,
        branchId: emp.branchId,
        branchName: getBranchById(emp.branchId)?.name || '—',
      }))

    const checkedInNoTour = employees
      .filter((emp) => attendedIds.has(emp.id) && !invoicedIds.has(emp.id))
      .map((emp) => ({
        id: emp.id,
        name: emp.name,
        branchId: emp.branchId,
        branchName: getBranchById(emp.branchId)?.name || '—',
      }))

    const zeroRevenueBranches = branchRows.filter((row) => row.revenue <= 0)

    return {
      totalRevenue,
      servingNow: checkedInNoTour.length,
      completedCustomers,
      pendingPaymentCustomers,
      branchRows,
      employeeRows,
      notCheckedInByBranch: groupByBranch(notCheckedIn),
      checkedInNoTourByBranch: groupByBranch(checkedInNoTour),
      notCheckedInCount: notCheckedIn.length,
      checkedInNoTourCount: checkedInNoTour.length,
      zeroRevenueBranches,
    }
  }, [payload, today])

  const visibleEmployeeRows = showAllEmployees
    ? snapshot.employeeRows
    : snapshot.employeeRows.slice(0, CEO_EMPLOYEE_TOP)

  if (loading && !payload) {
    return (
      <div className="erp-page ceo-dash">
        <p className="ceo-dash__date">{formatDisplayDate(today)}</p>
        <p className="ceo-dash__status">Đang tải…</p>
      </div>
    )
  }

  const showDataError = Boolean(error && !payload)

  return (
    <div className="erp-page ceo-dash">
      <p className="ceo-dash__date">
        {formatDisplayDate(today)}
        {loading ? <span className="ceo-dash__refresh"> · cập nhật…</span> : null}
      </p>

      {showDataError ? (
        <p className="ceo-dash__banner-error">{error}</p>
      ) : null}

      <p className="ceo-dash__hero" aria-label="Doanh thu hôm nay">
        <span>Doanh thu hôm nay:</span>
        <strong>{formatRevenue(snapshot.totalRevenue)}</strong>
      </p>

      <section className="ceo-dash__section" aria-labelledby="ceo-branch-revenue">
        <h2 id="ceo-branch-revenue">Doanh thu theo chi nhánh</h2>
        <div className="ceo-dash__table-wrap">
          <table className="ceo-dash__table ceo-dash__table--branch">
            <thead>
              <tr>
                <th className="is-num is-stt">STT</th>
                <th>Chi nhánh</th>
                <th className="is-num">Doanh thu</th>
                <th className="is-num">Mục tiêu</th>
                <th className="is-num">%</th>
                <th>Trạng thái</th>
                <th className="is-num is-hide-sm">Khách</th>
                <th className="is-num is-hide-sm">TB/khách</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.branchRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="ceo-dash__empty">Chưa có chi nhánh hoạt động.</td>
                </tr>
              ) : (
                snapshot.branchRows.map((row, index) => (
                  <tr key={row.id} className={`ceo-dash__row--${row.statusTone}`}>
                    <td className="is-num is-stt">{index + 1}</td>
                    <td>{row.name}</td>
                    <td className="is-num">{formatRevenue(row.revenue)}</td>
                    <td className="is-num">{row.dayTarget > 0 ? formatCurrency(row.dayTarget) : '—'}</td>
                    <td className="is-num">{row.targetPercent}</td>
                    <td className="ceo-dash__status-cell">{row.statusLabel}</td>
                    <td className="is-num is-hide-sm">{formatCount(row.customers)}</td>
                    <td className="is-num is-hide-sm">{formatAvgPerCustomer(row.revenue, row.customers)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p
        className={`ceo-dash__alerts ${snapshot.zeroRevenueBranches.length > 0 ? 'ceo-dash__alerts--red' : 'ceo-dash__alerts--ok'}`}
        aria-label="Cảnh báo chi nhánh"
      >
        {snapshot.zeroRevenueBranches.length > 0 ? (
          <>
            <strong>Cảnh báo:</strong>
            {' '}
            {snapshot.zeroRevenueBranches.map((branch) => branch.name).join(' · ')}
            {' '}
            — chưa phát sinh doanh thu
          </>
        ) : (
          '✅ Hôm nay tất cả chi nhánh đều phát sinh doanh thu.'
        )}
      </p>

      <div className="ceo-dash__grid">
        <section className="ceo-dash__section" aria-labelledby="ceo-not-checked-in">
          <h2 id="ceo-not-checked-in">
            Chưa điểm danh
            {snapshot.notCheckedInCount > 0 ? (
              <span className="ceo-dash__count">{snapshot.notCheckedInCount}</span>
            ) : null}
          </h2>
          {snapshot.notCheckedInCount === 0 ? (
            <p className="ceo-dash__ok-line">✅ Tất cả nhân viên đã điểm danh.</p>
          ) : (
            <BranchGroupedList groups={snapshot.notCheckedInByBranch} tone="yellow" />
          )}
        </section>

        <section className="ceo-dash__section" aria-labelledby="ceo-no-tour">
          <h2 id="ceo-no-tour">
            Đã điểm danh, chưa có tour
            {snapshot.checkedInNoTourCount > 0 ? (
              <span className="ceo-dash__count">{snapshot.checkedInNoTourCount}</span>
            ) : null}
          </h2>
          {snapshot.checkedInNoTourCount === 0 ? (
            <p className="ceo-dash__ok-line">✅ Tất cả nhân viên đã có tour.</p>
          ) : (
            <BranchGroupedList groups={snapshot.checkedInNoTourByBranch} tone="orange" />
          )}
        </section>
      </div>

      <section className="ceo-dash__section" aria-labelledby="ceo-employee-revenue">
        <div className="ceo-dash__section-head">
          <h2 id="ceo-employee-revenue">Top {CEO_EMPLOYEE_TOP} doanh thu nhân viên</h2>
          {snapshot.employeeRows.length > CEO_EMPLOYEE_TOP ? (
            <button
              type="button"
              className="ceo-dash__link-btn"
              onClick={() => setShowAllEmployees((open) => !open)}
            >
              {showAllEmployees ? 'Thu gọn' : 'Xem tất cả'}
            </button>
          ) : null}
        </div>
        <div className="ceo-dash__table-wrap">
          <table className="ceo-dash__table ceo-dash__table--employee">
            <thead>
              <tr>
                <th>Tên</th>
                <th className="is-hide-sm">Chi nhánh</th>
                <th className="is-num">Doanh thu</th>
                <th className="is-num">Tỷ lệ</th>
                <th className="is-num is-hide-sm">Tour</th>
                <th className="is-num is-hide-sm">Tips</th>
              </tr>
            </thead>
            <tbody>
              {visibleEmployeeRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="ceo-dash__empty">Chưa có nhân viên đang hoạt động.</td>
                </tr>
              ) : (
                visibleEmployeeRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td className="is-hide-sm">{row.branchName}</td>
                    <td className="is-num">{formatRevenue(row.revenue)}</td>
                    <td className="is-num">{row.revenueShare}</td>
                    <td className="is-num is-hide-sm">{formatCount(row.tourCount)}</td>
                    <td className="is-num is-hide-sm">{row.tips > 0 ? formatCurrency(row.tips) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="ceo-dash__guest-line" aria-label="Khách hôm nay">
        <span>👥 Hôm nay</span>
        <span>Đang phục vụ <strong>{formatCount(snapshot.servingNow)}</strong></span>
        <span>Hoàn thành <strong>{formatCount(snapshot.completedCustomers)}</strong></span>
        <span>Chờ thanh toán <strong>{formatCount(snapshot.pendingPaymentCustomers)}</strong></span>
      </p>
    </div>
  )
}

function ManagerDashboard({ onNavigate }) {
  const [exploreOpen, setExploreOpen] = useState(false)
  const [explorePrefill, setExplorePrefill] = useState(() => consumeDrillDownPrefill())
  const [exploreKey, setExploreKey] = useState(0)
  const copilot = useBusinessCopilotData()

  const handleAction = useCallback((cta) => {
    if (!cta?.pageId) return
    let pageId = cta.pageId
    if (pageId === 'employees') pageId = resolveEmployeesPage()

    if (pageId === 'dashboard' && cta.drillPrefill) {
      setDrillDownPrefill(cta.drillPrefill)
      setExplorePrefill(cta.drillPrefill)
      setExploreKey((k) => k + 1)
      setExploreOpen(true)
      return
    }

    if (typeof onNavigate === 'function') {
      onNavigate(pageId)
    }
  }, [onNavigate])

  return (
    <div className="erp-page">
      <OperationWorkflowDashStrip onNavigate={onNavigate} />
      <CrmGrowthDashStrip onNavigate={onNavigate} />

      <BusinessCopilot
        loading={copilot.loading}
        error={copilot.error}
        brief={copilot.brief}
        alerts={copilot.alerts}
        opportunities={copilot.opportunities}
        performance={copilot.performance}
        onAction={handleAction}
        onReload={copilot.reload}
      />

      <section className="copilot-explore" aria-label="Explore">
        <button
          type="button"
          className="copilot-explore__toggle"
          aria-expanded={exploreOpen}
          onClick={() => setExploreOpen((open) => !open)}
        >
          {exploreOpen ? 'Thu gọn chi tiết ▴' : 'Xem chi tiết & biểu đồ (Explore) ▾'}
        </button>
        {exploreOpen ? (
          <div className="copilot-explore__body">
            <DrillDownExplorer
              key={exploreKey}
              title="Chi tiết Tổng quan"
              rootLabel="Tổng quan"
              hidePageHeader
              initialPrefill={explorePrefill}
              onNavigate={onNavigate}
            />
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default function Dashboard({ onNavigate }) {
  if (isEmployee()) {
    const explorePrefill = consumeDrillDownPrefill()
    return (
      <DrillDownExplorer
        title="Tổng quan"
        rootLabel="Tổng quan"
        hidePageHeader
        initialPrefill={explorePrefill}
        onNavigate={onNavigate}
      />
    )
  }

  if (isAdmin()) {
    return <CeoDashboard />
  }

  return <ManagerDashboard onNavigate={onNavigate} />
}
