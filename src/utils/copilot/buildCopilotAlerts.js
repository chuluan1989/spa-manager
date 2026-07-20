import { getInvoiceTicketRevenue, getInvoiceTips, formatCurrency } from '../invoice'
import { buildDrillDownSummary } from '../drillDownReport'
import { computeServiceReport } from '../report'
import { getBranchById, loadBranches } from '../../constants/branches'
import { getActiveEmployeesByBranch, getAllActiveEmployees } from '../employeeStorage'
import {
  COPILOT_DROP_PERCENT,
  COPILOT_PRIORITY,
  COPILOT_PRIORITY_RANK,
  COPILOT_SILENT_AFTER_TIME,
} from './copilotConstants'
import {
  computeTrend,
  filterInvoicesByDate,
  getLocalTimeHm,
  getPreviousPeriod,
} from './copilotTrends'

function branchLabel(branchId, fallback = '') {
  return getBranchById(branchId)?.name || fallback || branchId || 'Chi nhánh'
}

function sumTicket(invoices) {
  return (invoices ?? []).reduce((s, inv) => s + getInvoiceTicketRevenue(inv), 0)
}

function sumTips(invoices) {
  return (invoices ?? []).reduce((s, inv) => s + getInvoiceTips(inv), 0)
}

function sortAlerts(alerts) {
  return [...alerts].sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank
    if (b.severityScore !== a.severityScore) return b.severityScore - a.severityScore
    return String(a.title).localeCompare(String(b.title), 'vi')
  })
}

/**
 * @param {object} input
 * @param {string} input.today
 * @param {object[]} input.invoices
 * @param {object[]} input.expenses
 * @param {object[]} input.fixedCosts
 * @param {object[]} input.attendanceToday
 * @param {number} input.pendingEditCount
 * @param {boolean} input.payrollMonthLocked
 * @param {string} input.lockedMonthLabel
 * @param {number|null} input.kl1Incomplete
 * @param {string} input.kl1UnavailableReason
 * @param {string} [input.scopeBranchId] manager lock
 */
export function buildCopilotAlerts(input) {
  const {
    today,
    invoices = [],
    expenses = [],
    fixedCosts = [],
    attendanceToday = [],
    pendingEditCount = 0,
    payrollMonthLocked = false,
    lockedMonthLabel = '',
    kl1Incomplete = null,
    kl1UnavailableReason = '',
    scopeBranchId = '',
    now = new Date(),
  } = input

  const yesterday = getPreviousPeriod(today, today).fromDate
  const todayInvoices = filterInvoicesByDate(invoices, today, today)
  const yesterdayInvoices = filterInvoicesByDate(invoices, yesterday, yesterday)
  const alerts = []

  const branches = loadBranches().filter((b) => b?.id)
  const scopedBranches = scopeBranchId
    ? branches.filter((b) => b.id === scopeBranchId)
    : branches

  const localHm = getLocalTimeHm(now)
  const pastSilentTime = localHm >= COPILOT_SILENT_AFTER_TIME

  // R1 — branch silent
  if (pastSilentTime) {
    for (const branch of scopedBranches) {
      const branchToday = todayInvoices.filter((inv) => inv.branchId === branch.id)
      let lastTime = ''
      for (const inv of branchToday) {
        const t = String(inv.invoiceTime ?? '').trim()
        if (t && t !== '—' && t > lastTime) lastTime = t
      }
      const fullySilent = branchToday.length === 0
        || !branchToday.some((inv) => {
          const t = String(inv.invoiceTime ?? '').trim()
          return t && t !== '—' && t >= COPILOT_SILENT_AFTER_TIME
        })

      if (!fullySilent) continue

      const name = branchLabel(branch.id, branch.name)
      alerts.push({
        id: `R1-${branch.id}`,
        type: 'BRANCH_SILENT',
        priority: COPILOT_PRIORITY.P0,
        priorityRank: COPILOT_PRIORITY_RANK.P0,
        severityScore: 1000 + (branchToday.length === 0 ? 100 : 50),
        title: `${name}: chưa phát sinh hóa đơn sau ${COPILOT_SILENT_AFTER_TIME}`,
        evidence: branchToday.length === 0
          ? `0 hóa đơn ngày ${today}`
          : `Hóa đơn gần nhất hôm nay: ${lastTime || '—'} (trước ${COPILOT_SILENT_AFTER_TIME})`,
        why: 'Không có giao dịch sau mốc giờ vận hành — rủi ro mất doanh thu trong ngày.',
        actionSteps: [
          `Gọi Quản lý ${name}`,
          'Kiểm tra ca có mặt và có khách không',
          'Mở Hóa đơn chi nhánh nếu cần ghi nhận',
        ],
        callHint: `Quản lý ${name}`,
        branchId: branch.id,
        branchName: name,
        cta: { label: 'Mở Hóa đơn', pageId: 'invoices' },
      })
    }
  }

  // R2 — not checked in
  const activeEmployees = scopeBranchId
    ? getActiveEmployeesByBranch(scopeBranchId)
    : getAllActiveEmployees()
  const activeIds = new Set(activeEmployees.map((e) => e.id).filter(Boolean))
  const checkedIds = new Set()
  for (const row of attendanceToday) {
    if (row.employeeId && activeIds.has(row.employeeId)) checkedIds.add(row.employeeId)
  }
  const missing = activeEmployees.filter((e) => e.id && !checkedIds.has(e.id))
  if (missing.length > 0) {
    const byBranch = new Map()
    for (const emp of missing) {
      const bid = emp.branchId || 'unknown'
      byBranch.set(bid, (byBranch.get(bid) ?? 0) + 1)
    }
    let topBranchId = ''
    let topCount = 0
    for (const [bid, count] of byBranch) {
      if (count > topCount) {
        topCount = count
        topBranchId = bid
      }
    }
    const topName = branchLabel(topBranchId)
    const detail = [...byBranch.entries()]
      .map(([bid, count]) => `${branchLabel(bid)} ${count}`)
      .join(' · ')

    alerts.push({
      id: 'R2-attendance-gap',
      type: 'ATT_GAP',
      priority: COPILOT_PRIORITY.P0,
      priorityRank: COPILOT_PRIORITY_RANK.P0,
      severityScore: 900 + missing.length,
      title: `${missing.length} nhân viên chưa chấm công hôm nay`,
      evidence: detail || `${missing.length}/${activeIds.size} active chưa có bản ghi`,
      why: 'Thiếu chấm công → mất kiểm soát ca và dữ liệu công trước giờ cao điểm.',
      actionSteps: [
        topBranchId ? `Gọi Quản lý ${topName}` : 'Kiểm tra danh sách chưa chấm',
        'Yêu cầu chấm công ngay',
      ],
      callHint: topBranchId ? `Quản lý ${topName}` : '',
      branchId: topBranchId || scopeBranchId || '',
      branchName: topName,
      cta: { label: 'Mở Chấm công', pageId: 'attendance' },
    })
  }

  // R3 — branch revenue drop
  for (const branch of scopedBranches) {
    const cur = sumTicket(todayInvoices.filter((i) => i.branchId === branch.id))
    const prev = sumTicket(yesterdayInvoices.filter((i) => i.branchId === branch.id))
    if (prev <= 0 && cur <= 0) continue
    const trend = computeTrend(cur, prev)
    if (trend.direction !== 'down' || trend.percent < COPILOT_DROP_PERCENT) continue
    const name = branchLabel(branch.id, branch.name)
    alerts.push({
      id: `R3-${branch.id}`,
      type: 'BRANCH_REV_DROP',
      priority: COPILOT_PRIORITY.P1,
      priorityRank: COPILOT_PRIORITY_RANK.P1,
      severityScore: trend.percent,
      title: `${name}: DT tiền vé −${trend.percent}% so với hôm qua`,
      evidence: `Hôm nay ${formatCurrency(cur)} · Hôm qua ${formatCurrency(prev)}`,
      why: `Giảm ≥ ${COPILOT_DROP_PERCENT}% so với ngày trước — cần can thiệp trong ngày.`,
      actionSteps: [
        `Gọi Quản lý ${name}`,
        'Mở chi tiết chi nhánh trên Tổng quan',
        'So sánh dịch vụ bán chạy với chi nhánh đang tăng (nếu có)',
      ],
      callHint: `Quản lý ${name}`,
      branchId: branch.id,
      branchName: name,
      cta: {
        label: 'Xem chi nhánh',
        pageId: 'dashboard',
        drillPrefill: {
          level: 'employee',
          filters: { fromDate: today, toDate: today, branchId: branch.id },
        },
      },
    })
  }

  // R4 — tips drop (system or scoped branch)
  {
    const tipToday = sumTips(scopeBranchId
      ? todayInvoices.filter((i) => i.branchId === scopeBranchId)
      : todayInvoices)
    const tipYday = sumTips(scopeBranchId
      ? yesterdayInvoices.filter((i) => i.branchId === scopeBranchId)
      : yesterdayInvoices)
    const trend = computeTrend(tipToday, tipYday)
    if (trend.direction === 'down' && trend.percent >= COPILOT_DROP_PERCENT && tipYday > 0) {
      const scopeName = scopeBranchId ? branchLabel(scopeBranchId) : 'Toàn hệ thống'
      alerts.push({
        id: 'R4-tips-drop',
        type: 'SYS_TIPS_DROP',
        priority: COPILOT_PRIORITY.P1,
        priorityRank: COPILOT_PRIORITY_RANK.P1,
        severityScore: trend.percent,
        title: `Tips ${scopeName} −${trend.percent}% so với hôm qua`,
        evidence: `Hôm nay ${formatCurrency(tipToday)} · Hôm qua ${formatCurrency(tipYday)}`,
        why: `Tips giảm ≥ ${COPILOT_DROP_PERCENT}% — tín hiệu trải nghiệm / ca phục vụ.`,
        actionSteps: [
          scopeBranchId ? `Gọi Quản lý ${scopeName}` : 'Xác định chi nhánh tips thấp nhất hôm nay',
          'Kiểm tra ca và hóa đơn có tips',
        ],
        callHint: scopeBranchId ? `Quản lý ${scopeName}` : '',
        branchId: scopeBranchId || '',
        branchName: scopeName,
        cta: { label: 'Mở Hóa đơn', pageId: 'invoices' },
      })
    }
  }

  // R5 — negative profit (month-to-date in loaded range using month filters)
  {
    const monthStart = `${today.slice(0, 7)}-01`
    const monthInvoices = filterInvoicesByDate(invoices, monthStart, today)
    const monthExpenses = (expenses ?? []).filter((e) => {
      const d = e?.date ?? ''
      return d >= monthStart && d <= today
        && (!scopeBranchId || e.branchId === scopeBranchId)
    })
    const filters = {
      fromDate: monthStart,
      toDate: today,
      branchId: scopeBranchId || '',
    }
    const summary = buildDrillDownSummary(
      scopeBranchId ? monthInvoices.filter((i) => i.branchId === scopeBranchId) : monthInvoices,
      monthExpenses,
      filters,
      null,
      fixedCosts,
    )
    if (Number(summary.profit) < 0) {
      alerts.push({
        id: 'R5-neg-profit',
        type: 'NEG_PROFIT',
        priority: COPILOT_PRIORITY.P1,
        priorityRank: COPILOT_PRIORITY_RANK.P1,
        severityScore: Math.abs(Number(summary.profit)),
        title: 'Lợi nhuận tháng đến nay đang âm',
        evidence: `LN ${formatCurrency(summary.profit)} · DT ${formatCurrency(summary.actualRevenue)} · CP ${formatCurrency(summary.expenses)} (lương proxy = HH + tips)`,
        why: 'Đang bán nhưng lợi nhuận proxy âm — cần rà chi phí.',
        actionSteps: ['Mở Chi phí kỳ này', 'Xem Báo cáo lợi nhuận'],
        callHint: '',
        branchId: scopeBranchId || '',
        cta: { label: 'Mở Chi phí', pageId: 'expenses' },
      })
    }
  }

  // R6 — service drop (today vs yesterday by service revenue)
  {
    const servicesToday = computeServiceReport(todayInvoices)
    const servicesYday = computeServiceReport(yesterdayInvoices)
    const ydayMap = new Map(servicesYday.map((s) => [s.serviceId || s.serviceName, s]))
    for (const row of servicesToday) {
      const key = row.serviceId || row.serviceName
      const prev = ydayMap.get(key)
      if (!prev || prev.ticketRevenue <= 0) continue
      const trend = computeTrend(row.ticketRevenue, prev.ticketRevenue)
      if (trend.direction !== 'down' || trend.percent < COPILOT_DROP_PERCENT) continue
      // Only flag if it was material yesterday
      if (prev.ticketRevenue < 200000) continue
      alerts.push({
        id: `R6-${key}`,
        type: 'SERVICE_DROP',
        priority: COPILOT_PRIORITY.P1,
        priorityRank: COPILOT_PRIORITY_RANK.P1,
        severityScore: trend.percent,
        title: `Dịch vụ “${row.serviceName}”: DT −${trend.percent}% so với hôm qua`,
        evidence: `Hôm nay ${formatCurrency(row.ticketRevenue)} · Hôm qua ${formatCurrency(prev.ticketRevenue)} (${row.count} vs ${prev.count} lượt)`,
        why: `DV có DT hôm qua đáng kể đang giảm ≥ ${COPILOT_DROP_PERCENT}%.`,
        actionSteps: ['So với dịch vụ đang tăng', 'Nhắc ưu tiên bán DV còn sức'],
        callHint: '',
        cta: { label: 'Mở Báo cáo', pageId: 'reports' },
      })
    }
  }

  // R7 — pending attendance edits
  if (pendingEditCount > 0) {
    alerts.push({
      id: 'R7-pending-edits',
      type: 'ATT_EDIT_PENDING',
      priority: COPILOT_PRIORITY.P2,
      priorityRank: COPILOT_PRIORITY_RANK.P2,
      severityScore: pendingEditCount,
      title: `${pendingEditCount} yêu cầu sửa chấm công đang chờ`,
      evidence: `${pendingEditCount} pending`,
      why: 'Chưa duyệt → dữ liệu công/lương có thể sai.',
      actionSteps: ['Mở Chấm công và duyệt hoặc ủy quyền'],
      callHint: '',
      cta: { label: 'Mở Chấm công', pageId: 'attendance' },
    })
  }

  // R8 — payroll lock / KL1
  if (payrollMonthLocked) {
    alerts.push({
      id: 'R8-payroll-lock',
      type: 'PAY_LOCK',
      priority: COPILOT_PRIORITY.P2,
      priorityRank: COPILOT_PRIORITY_RANK.P2,
      severityScore: 10,
      title: `Kỳ lương ${lockedMonthLabel || today.slice(0, 7)} đang khóa`,
      evidence: `isPayrollMonthLocked(${lockedMonthLabel || today.slice(0, 7)})`,
      why: 'Thao tác lương bị khóa — xử lý nếu đang tới hạn chi.',
      actionSteps: ['Mở trang Lương để kiểm tra'],
      callHint: '',
      cta: { label: 'Mở Lương', pageId: 'salary' },
    })
  }
  if (kl1Incomplete != null && kl1Incomplete > 0) {
    alerts.push({
      id: 'R8-kl1',
      type: 'KL1_INCOMPLETE',
      priority: COPILOT_PRIORITY.P2,
      priorityRank: COPILOT_PRIORITY_RANK.P2,
      severityScore: kl1Incomplete,
      title: `${kl1Incomplete} dòng KL1 chưa hoàn thiện`,
      evidence: `dataComplete !== true × ${kl1Incomplete}`,
      why: 'KL1 chưa đủ dữ liệu — ảnh hưởng tổng hợp kỳ lương 1.',
      actionSteps: ['Mở KL1 tổng hợp'],
      callHint: '',
      cta: { label: 'Mở KL1', pageId: 'payroll1-admin' },
    })
  } else if (kl1UnavailableReason) {
    // no alert — KL1 off is not an actionable fire
  }

  return sortAlerts(alerts)
}
