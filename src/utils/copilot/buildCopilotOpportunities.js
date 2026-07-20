import { getInvoiceTicketRevenue, getInvoiceTips, formatCurrency } from '../invoice'
import { computeServiceReport, computeTopEmployeesByServiceCount, computeTopEmployeesByRevenue } from '../report'
import { buildCustomerProfiles } from '../customerAnalytics'
import { CUSTOMER_SEGMENTS } from '../../constants/customerTypes'
import { getBranchById, loadBranches } from '../../constants/branches'
import { COPILOT_GROW_PERCENT } from './copilotConstants'
import {
  computeTrend,
  filterInvoicesByDate,
  getPreviousPeriod,
  parseInvoiceHour,
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

function weakestBranchIds(todayInvoices, branches, excludeId, limit = 2) {
  const rows = branches
    .filter((b) => b.id !== excludeId)
    .map((b) => ({
      id: b.id,
      name: branchLabel(b.id, b.name),
      revenue: sumTicket(todayInvoices.filter((i) => i.branchId === b.id)),
    }))
    .sort((a, b) => a.revenue - b.revenue)
  return rows.slice(0, limit)
}

/**
 * @param {object} input
 */
export function buildCopilotOpportunities(input) {
  const {
    today,
    invoices = [],
    crmInvoices = [],
    scopeBranchId = '',
  } = input

  const yesterday = getPreviousPeriod(today, today).fromDate
  const todayInvoices = filterInvoicesByDate(invoices, today, today)
  const yesterdayInvoices = filterInvoicesByDate(invoices, yesterday, yesterday)
  const branches = loadBranches().filter((b) => b?.id)
  const scopedBranches = scopeBranchId
    ? branches.filter((b) => b.id === scopeBranchId)
    : branches

  const opportunities = []

  // O1 — branch growth
  for (const branch of scopedBranches) {
    const cur = sumTicket(todayInvoices.filter((i) => i.branchId === branch.id))
    const prev = sumTicket(yesterdayInvoices.filter((i) => i.branchId === branch.id))
    if (prev <= 0) continue
    const trend = computeTrend(cur, prev)
    if (trend.direction !== 'up' || trend.percent < COPILOT_GROW_PERCENT) continue
    const name = branchLabel(branch.id, branch.name)
    const targets = weakestBranchIds(todayInvoices, branches, branch.id)
    const targetNames = targets.map((t) => t.name).filter(Boolean)
    opportunities.push({
      id: `O1-${branch.id}`,
      type: 'BRANCH_GROW',
      rankScore: 1000 + trend.percent,
      title: `${name}: DT tiền vé +${trend.percent}% so với hôm qua`,
      evidence: `Hôm nay ${formatCurrency(cur)} · Hôm qua ${formatCurrency(prev)}`,
      why: `Tăng ≥ ${COPILOT_GROW_PERCENT}% — tín hiệu bán vượt nhịp.`,
      scaleTo: targetNames.length
        ? `Nhân rộng sang: ${targetNames.join(', ')}`
        : 'Nhân rộng checklist ca sang chi nhánh đang yếu hơn',
      actionSteps: [
        `Gọi Quản lý ${name} hỏi checklist ca`,
        ...(targetNames[0] ? [`Gọi Quản lý ${targetNames[0]} để áp dụng`] : []),
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

  // O2 — hot service
  {
    const servicesToday = computeServiceReport(
      scopeBranchId ? todayInvoices.filter((i) => i.branchId === scopeBranchId) : todayInvoices,
    )
    const servicesYday = computeServiceReport(
      scopeBranchId ? yesterdayInvoices.filter((i) => i.branchId === scopeBranchId) : yesterdayInvoices,
    )
    const ydayMap = new Map(servicesYday.map((s) => [s.serviceId || s.serviceName, s]))
    let best = null
    for (const row of servicesToday) {
      const prev = ydayMap.get(row.serviceId || row.serviceName)
      if (!prev || prev.ticketRevenue <= 0) continue
      const trend = computeTrend(row.ticketRevenue, prev.ticketRevenue)
      if (trend.direction !== 'up' || trend.percent < COPILOT_GROW_PERCENT) continue
      if (!best || trend.percent > best.percent) {
        best = { row, percent: trend.percent, prev }
      }
    }
    if (best) {
      opportunities.push({
        id: `O2-${best.row.serviceId || best.row.serviceName}`,
        type: 'SERVICE_GROW',
        rankScore: 900 + best.percent,
        title: `Dịch vụ “${best.row.serviceName}” đang tăng +${best.percent}%`,
        evidence: `Hôm nay ${formatCurrency(best.row.ticketRevenue)} · Hôm qua ${formatCurrency(best.prev.ticketRevenue)}`,
        why: `DT dịch vụ tăng ≥ ${COPILOT_GROW_PERCENT}% so với hôm qua.`,
        scaleTo: 'Ưu tiên bán tại các chi nhánh chưa đẩy mạnh dịch vụ này',
        actionSteps: [`Nhắc NV ưu tiên bán “${best.row.serviceName}” hôm nay`],
        callHint: '',
        cta: { label: 'Mở Báo cáo', pageId: 'reports' },
      })
    }
  }

  // O3 — employee tips ratio or services/invoice (today)
  {
    const pool = scopeBranchId
      ? todayInvoices.filter((i) => i.branchId === scopeBranchId)
      : todayInvoices
    const byTips = computeTopEmployeesByRevenue(pool)
      .map((row) => {
        const tips = Number(row.tips ?? 0)
        const ticket = Number(row.ticketRevenue ?? 0)
        const ratio = ticket > 0 ? tips / ticket : (tips > 0 ? 1 : 0)
        return { ...row, tips, ticket, ratio, score: tips }
      })
      .filter((r) => r.tips > 0)
      .sort((a, b) => b.tips - a.tips)

    const bySvc = computeTopEmployeesByServiceCount(pool)
      .map((row) => ({
        ...row,
        avgSvc: row.invoiceCount > 0 ? row.serviceCount / row.invoiceCount : 0,
      }))
      .filter((r) => r.invoiceCount >= 2 && r.avgSvc >= 1.5)
      .sort((a, b) => b.avgSvc - a.avgSvc)

    const tipStar = byTips[0]
    if (tipStar && tipStar.employeeName) {
      opportunities.push({
        id: `O3-tips-${tipStar.employeeId || tipStar.employeeName}`,
        type: 'EMP_TIPS',
        rankScore: 800 + tipStar.tips / 1000,
        title: `${tipStar.employeeName}: tips cao nhất hôm nay`,
        evidence: `Tips ${formatCurrency(tipStar.tips)} · DT vé ${formatCurrency(tipStar.ticket)}`,
        why: 'Proxy đo được từ hóa đơn — không phải chỉ số upsell.',
        scaleTo: 'Chia sẻ cách phục vụ sang chi nhánh / ca tips thấp hơn',
        actionSteps: [`Nhờ ${tipStar.employeeName} chia sẻ ca với quản lý chi nhánh`],
        callHint: tipStar.employeeName,
        cta: { label: 'Mở Nhân viên', pageId: 'employees' },
      })
    }

    const svcStar = bySvc[0]
    if (
      svcStar
      && svcStar.employeeName
      && (!tipStar || (svcStar.employeeId || svcStar.employeeName) !== (tipStar.employeeId || tipStar.employeeName))
    ) {
      opportunities.push({
        id: `O3-svc-${svcStar.employeeId || svcStar.employeeName}`,
        type: 'EMP_SVC_PER_INV',
        rankScore: 750 + svcStar.avgSvc * 10,
        title: `${svcStar.employeeName}: ${svcStar.avgSvc.toFixed(1)} DV/hóa đơn hôm nay`,
        evidence: `${svcStar.serviceCount} dịch vụ / ${svcStar.invoiceCount} hóa đơn`,
        why: 'Số DV trên HĐ cao hơn trung bình tối thiểu 1.5 (proxy, không gọi upsell).',
        scaleTo: 'Chia sẻ cách tư vấn DV sang chi nhánh đang yếu',
        actionSteps: [`Nhờ ${svcStar.employeeName} chia sẻ cách bán kèm dịch vụ`],
        callHint: svcStar.employeeName,
        cta: { label: 'Mở Nhân viên', pageId: 'employees' },
      })
    }
  }

  // O4 — peak hour (today)
  {
    const pool = scopeBranchId
      ? todayInvoices.filter((i) => i.branchId === scopeBranchId)
      : todayInvoices
    const hours = new Map()
    let total = 0
    for (const inv of pool) {
      const hour = parseInvoiceHour(inv.invoiceTime)
      if (hour == null) continue
      const rev = getInvoiceTicketRevenue(inv)
      hours.set(hour, (hours.get(hour) ?? 0) + rev)
      total += rev
    }
    if (total > 0 && hours.size > 0) {
      let bestHour = 0
      let bestRev = 0
      for (const [h, rev] of hours) {
        if (rev > bestRev) {
          bestRev = rev
          bestHour = h
        }
      }
      const pct = Math.round((bestRev / total) * 100)
      if (pct >= 20) {
        const end = String(bestHour + 1).padStart(2, '0')
        const start = String(bestHour).padStart(2, '0')
        opportunities.push({
          id: `O4-hour-${bestHour}`,
          type: 'PEAK_HOUR',
          rankScore: 700 + pct,
          title: `Khung giờ ${start}:00–${end}:00 chiếm ${pct}% DT hôm nay`,
          evidence: `Σ DT tiền vé khung giờ ${formatCurrency(bestRev)} / ${formatCurrency(total)}`,
          why: 'Phân bố theo invoiceTime — chỉ là tín hiệu giờ đông, không suy ra thiếu người.',
          scaleTo: 'Bố trí nhân sự đúng khung giờ đỉnh tại các chi nhánh',
          actionSteps: ['Nhắc quản lý bố trí người đúng giờ đỉnh'],
          callHint: '',
          cta: { label: 'Mở Chấm công', pageId: 'attendance' },
        })
      }
    }
  }

  // O5 — best returnRate / LOYAL by branch (from CRM invoices)
  {
    const profiles = buildCustomerProfiles(crmInvoices?.length ? crmInvoices : invoices)
    const branchStats = new Map()
    for (const branch of scopedBranches.length ? scopedBranches : branches) {
      branchStats.set(branch.id, {
        id: branch.id,
        name: branchLabel(branch.id, branch.name),
        total: 0,
        returned: 0,
        loyal: 0,
      })
    }
    for (const c of profiles) {
      const bid = c.primaryBranchId
      if (!bid || !branchStats.has(bid)) continue
      if (scopeBranchId && bid !== scopeBranchId) continue
      const row = branchStats.get(bid)
      row.total += 1
      if (c.visitCount >= 2) row.returned += 1
      if (c.segment === CUSTOMER_SEGMENTS.LOYAL) row.loyal += 1
    }
    const ranked = [...branchStats.values()]
      .filter((r) => r.total >= 5)
      .map((r) => ({
        ...r,
        returnRate: Math.round((r.returned / r.total) * 100),
        loyalRate: Math.round((r.loyal / r.total) * 100),
      }))
      .sort((a, b) => b.returnRate - a.returnRate || b.loyalRate - a.loyalRate)

    const best = ranked[0]
    const worst = ranked[ranked.length - 1]
    if (best && best.returnRate > 0) {
      opportunities.push({
        id: `O5-${best.id}`,
        type: 'RETURN_RATE',
        rankScore: 850 + best.returnRate,
        title: `${best.name}: tỷ lệ khách quay lại ${best.returnRate}%`,
        evidence: `${best.returned}/${best.total} KH visit≥2 · LOYAL ${best.loyal} (${best.loyalRate}%)`,
        why: 'Tính từ hồ sơ khách (visitCount / segment LOYAL) theo chi nhánh chính.',
        scaleTo: worst && worst.id !== best.id
          ? `Học quy trình giữ khách → ${worst.name} (return ${worst.returnRate}%)`
          : 'Giữ vững quy trình chăm sóc khách tại chi nhánh này',
        actionSteps: ['Mở Khách hàng lọc LOYAL theo chi nhánh'],
        callHint: `Quản lý ${best.name}`,
        branchId: best.id,
        branchName: best.name,
        cta: { label: 'Mở Khách hàng', pageId: 'customers' },
      })
    }
  }

  // O6 — AT_RISK list
  {
    const profiles = buildCustomerProfiles(crmInvoices?.length ? crmInvoices : invoices)
    const atRisk = profiles.filter((c) => {
      if (c.segment !== CUSTOMER_SEGMENTS.AT_RISK) return false
      if (scopeBranchId && c.primaryBranchId !== scopeBranchId) return false
      return true
    })
    if (atRisk.length > 0) {
      opportunities.push({
        id: 'O6-at-risk',
        type: 'AT_RISK',
        rankScore: 820 + Math.min(atRisk.length, 50),
        title: `${atRisk.length} khách nguy cơ mất (AT_RISK)`,
        evidence: 'Segment AT_RISK: ≥90 ngày không quay lại (CRM hiện có)',
        why: 'Giữ khách = bảo vệ doanh thu tương lai.',
        scaleTo: 'Giao gọi theo chi nhánh của từng khách',
        actionSteps: ['Mở Khách hàng → lọc Nguy cơ mất khách', 'Giao quản lý/NV gọi hôm nay'],
        callHint: '',
        cta: { label: 'Mở Khách hàng', pageId: 'customers' },
      })
    }
  }

  // O7 — tips up
  {
    const tipToday = sumTips(scopeBranchId
      ? todayInvoices.filter((i) => i.branchId === scopeBranchId)
      : todayInvoices)
    const tipYday = sumTips(scopeBranchId
      ? yesterdayInvoices.filter((i) => i.branchId === scopeBranchId)
      : yesterdayInvoices)
    const trend = computeTrend(tipToday, tipYday)
    if (trend.direction === 'up' && trend.percent >= COPILOT_GROW_PERCENT && tipYday > 0) {
      const scopeName = scopeBranchId ? branchLabel(scopeBranchId) : 'Toàn hệ thống'
      opportunities.push({
        id: 'O7-tips-up',
        type: 'TIPS_UP',
        rankScore: 880 + trend.percent,
        title: `Tips ${scopeName} +${trend.percent}% so với hôm qua`,
        evidence: `Hôm nay ${formatCurrency(tipToday)} · Hôm qua ${formatCurrency(tipYday)}`,
        why: `Tips tăng ≥ ${COPILOT_GROW_PERCENT}% — tín hiệu phục vụ tích cực.`,
        scaleTo: 'Nhân rộng hành vi ca tips cao sang chi nhánh tips thấp hơn',
        actionSteps: ['Xem chi nhánh/NV tips cao và chia sẻ'],
        callHint: '',
        cta: { label: 'Mở Hóa đơn', pageId: 'invoices' },
      })
    }
  }

  return opportunities.sort((a, b) => b.rankScore - a.rankScore || String(a.title).localeCompare(String(b.title), 'vi'))
}
