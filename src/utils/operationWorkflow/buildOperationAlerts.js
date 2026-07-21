import { getInvoicePayment, getInvoiceTips } from '../invoice'
import { countUniqueCustomers } from '../drillDownReport'
import { getBranchTaskProgress } from './dailyTaskStorage'
import { PRIORITY } from './operationWorkflowConstants'

function avg(values) {
  const nums = values.filter((v) => Number.isFinite(v))
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function customerKey(invoice) {
  const phone = (invoice.customerPhone ?? '').replace(/\D/g, '')
  const name = (invoice.customerName ?? '').trim().toLowerCase()
  if (phone) return `phone:${phone}`
  if (name) return `name:${name}`
  return `inv:${invoice.id}`
}

function dayRevenue(invoices, date) {
  return (invoices ?? [])
    .filter((inv) => inv.date === date)
    .reduce((sum, inv) => sum + getInvoicePayment(inv), 0)
}

function dayRequestedRate(invoices, date) {
  const day = (invoices ?? []).filter((inv) => inv.date === date)
  const customers = countUniqueCustomers(day)
  if (!customers) return null
  const keys = new Set()
  for (const inv of day) {
    if (!inv.customerRequested) continue
    keys.add(customerKey(inv))
  }
  return (keys.size / customers) * 100
}

function dayTips(invoices, date) {
  return (invoices ?? [])
    .filter((inv) => inv.date === date)
    .reduce((sum, inv) => sum + getInvoiceTips(inv), 0)
}

/**
 * Rule-based operation alerts (Dashboard). No notifications.
 */
export function buildOperationAlerts({
  today,
  branches = [],
  employees = [],
  invoices = [],
  attendanceToday = [],
  lookbackDates = [],
}) {
  const alerts = []
  const dates = lookbackDates.filter((d) => d && d !== today)

  for (const branch of branches) {
    const branchInvoices = invoices.filter((inv) => inv.branchId === branch.id)
    const todayRev = dayRevenue(branchInvoices, today)
    const hist = dates.map((d) => dayRevenue(branchInvoices, d))
    const baseline = avg(hist)
    if (baseline > 0 && todayRev < baseline * 0.7) {
      const pct = Math.round((todayRev / baseline) * 100)
      alerts.push({
        id: `rev-low-${branch.id}`,
        priority: PRIORITY.HIGH,
        branchId: branch.id,
        title: `${branch.name} doanh thu thấp`,
        detail: `Hôm nay ${pct}% trung bình ${dates.length} ngày gần đây.`,
        type: 'revenue_below_avg',
      })
    }

    const todayRate = dayRequestedRate(branchInvoices, today)
    const histRates = dates.map((d) => dayRequestedRate(branchInvoices, d)).filter((v) => v != null)
    const avgRate = avg(histRates)
    if (avgRate > 0 && todayRate != null && todayRate < avgRate * 0.7) {
      alerts.push({
        id: `req-drop-${branch.id}`,
        priority: PRIORITY.MEDIUM,
        branchId: branch.id,
        title: `${branch.name} khách yêu cầu giảm`,
        detail: `Tỷ lệ YC hôm nay ${todayRate.toFixed(1)}% vs TB ${avgRate.toFixed(1)}%.`,
        type: 'requested_drop',
      })
    }

    const todayTip = dayTips(branchInvoices, today)
    const tipHist = dates.map((d) => dayTips(branchInvoices, d))
    const tipAvg = avg(tipHist)
    if (tipAvg > 0 && todayTip < tipAvg * 0.7) {
      alerts.push({
        id: `tips-drop-${branch.id}`,
        priority: PRIORITY.MEDIUM,
        branchId: branch.id,
        title: `${branch.name} tips giảm`,
        detail: `Tips hôm nay thấp hơn trung bình gần đây.`,
        type: 'tips_drop',
      })
    }

    const task = getBranchTaskProgress(branch.id, today)
    if (task.done === 0 && (todayRev > 0 || attendanceToday.some((a) => a.branchId === branch.id))) {
      alerts.push({
        id: `task-none-${branch.id}`,
        priority: PRIORITY.MEDIUM,
        branchId: branch.id,
        title: `${branch.name} chưa cập nhật công việc`,
        detail: `Chưa tick Daily Task nào hôm nay (0/${task.total}).`,
        type: 'tasks_missing',
      })
    } else if (task.incomplete.length > 0 && task.percent < 50) {
      alerts.push({
        id: `task-low-${branch.id}`,
        priority: PRIORITY.LOW,
        branchId: branch.id,
        title: `${branch.name} công việc còn dở`,
        detail: `Đã làm ${task.done}/${task.total} việc trong ngày.`,
        type: 'tasks_incomplete',
      })
    }
  }

  for (const emp of employees) {
    const hasAttendance = attendanceToday.some((a) => a.employeeId === emp.id)
    const hasInvoice = invoices.some((inv) => inv.date === today && inv.employeeId === emp.id)
    if (hasAttendance && !hasInvoice) {
      alerts.push({
        id: `no-cust-${emp.id}`,
        priority: PRIORITY.MEDIUM,
        branchId: emp.branchId,
        employeeId: emp.id,
        title: `${emp.name} chưa có khách`,
        detail: 'Đã chấm công hôm nay nhưng chưa có hóa đơn.',
        type: 'employee_no_customer',
      })
    }
  }

  const order = { high: 0, medium: 1, low: 2 }
  return alerts.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9))
}

/**
 * CEO Action Panel items — "Cần xử lý hôm nay".
 */
export function buildCeoActionItems(alerts = [], { limit = 12 } = {}) {
  return (alerts ?? []).slice(0, limit).map((alert) => ({
    id: alert.id,
    priority: alert.priority,
    title: alert.title,
    detail: alert.detail,
    branchId: alert.branchId,
    employeeId: alert.employeeId,
    type: alert.type,
  }))
}
