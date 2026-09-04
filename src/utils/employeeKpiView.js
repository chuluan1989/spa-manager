import { KPI_STATUS } from '../constants/kpiPolicy'
import { KPI_GROUPS } from '../constants/kpiPolicy'
import { classifyKpiServiceLine, isKpiMain90Line, KPI_MAIN_90_TOKENS } from './kpiServiceClassifier'

export function monthBounds(monthYm) {
  const [y, m] = String(monthYm || '').split('-').map(Number)
  if (!y || !m) return { fromDate: '', toDate: '' }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return {
    fromDate: `${y}-${mm}-01`,
    toDate: `${y}-${mm}-${String(last).padStart(2, '0')}`,
  }
}

export function currentMonthYm(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  return `${y}-${m}`
}

export function formatMonthLabel(monthYm) {
  const [y, m] = String(monthYm || '').split('-')
  if (!y || !m) return monthYm || '—'
  return `THÁNG ${Number(m)}/${y}`
}

export function formatKpiPercent(rate) {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(rate * 100 >= 10 || rate === 0 ? 0 : 1)}%`
}

export function formatTargetPercent(target) {
  if (target == null || !Number.isFinite(Number(target))) return '—'
  return `${Math.round(Number(target) * 100)}%`
}

export function kpiStatusLabel(status) {
  if (status === KPI_STATUS.MET) return 'Đạt'
  if (status === KPI_STATUS.NOT_MET) return 'Chưa đạt'
  if (status === KPI_STATUS.INSUFFICIENT_DATA) return 'Chưa đủ dữ liệu'
  if (status === KPI_STATUS.NOT_APPLICABLE) return 'Không áp dụng'
  if (status === KPI_STATUS.NO_POLICY) return 'Chưa có chính sách KPI kỳ này'
  return status || '—'
}

export const KPI_GROUP_LABELS = {
  [KPI_GROUPS.MAIN]: 'DV chính',
  [KPI_GROUPS.ADDON]: 'DV phụ',
  [KPI_GROUPS.ADVANCED]: 'Chuyên sâu',
  [KPI_GROUPS.COMBO]: 'Combo',
  [KPI_GROUPS.UNMAPPED]: 'Chưa map',
}

export const EMPLOYEE_KPI_CARD_DEFS = [
  {
    key: 'addon',
    title: 'Dịch vụ phụ',
    numeratorLabel: 'phụ',
    denominatorLabel: 'chính',
    missingUnit: 'lượt',
    formula: 'ADDON / MAIN',
  },
  {
    key: 'advanced',
    title: 'Chuyên sâu',
    numeratorLabel: 'chuyên sâu',
    denominatorLabel: 'chính',
    missingUnit: 'lượt',
    formula: 'ADVANCED / MAIN',
  },
  {
    key: 'combo',
    title: 'Combo',
    numeratorLabel: 'combo',
    denominatorLabel: 'chính',
    missingUnit: 'lượt',
    formula: 'COMBO / MAIN',
  },
  {
    key: 'requested',
    title: 'Khách yêu cầu',
    numeratorLabel: 'khách yêu cầu',
    denominatorLabel: 'hóa đơn',
    missingUnit: 'khách yêu cầu',
    formula: 'REQUESTED / TOTAL',
  },
  {
    key: 'duration90',
    title: '90 phút',
    numeratorLabel: '90 phút',
    denominatorLabel: 'chính',
    missingUnit: 'lượt',
    formula: 'MAIN 90 / MAIN',
  },
]

export function resolveDisplayTarget(kpi) {
  if (!kpi) return null
  if (kpi.target != null && Number.isFinite(Number(kpi.target))) return Number(kpi.target)
  if (kpi.informationalBlendedTarget != null) return Number(kpi.informationalBlendedTarget)
  if (Array.isArray(kpi.targets) && kpi.targets.length === 1) return Number(kpi.targets[0])
  return null
}

export function buildKpiCardModel(def, kpi, counts) {
  const status = kpi?.status || KPI_STATUS.INSUFFICIENT_DATA
  const isRequested = def.key === 'requested'
  const actual = isRequested ? (counts?.requestedInvoices ?? kpi?.actual ?? 0) : (counts?.[def.key] ?? kpi?.actual ?? 0)
  const denominator = isRequested
    ? (counts?.totalInvoices ?? kpi?.total ?? 0)
    : (counts?.main ?? kpi?.main ?? 0)
  const target = resolveDisplayTarget(kpi)
  const rate = kpi?.rate
  const missing = kpi?.missing
  let missingText = ''
  if (status === KPI_STATUS.NO_POLICY) {
    missingText = 'Chưa có chính sách KPI kỳ này'
  } else if (status === KPI_STATUS.INSUFFICIENT_DATA) {
    missingText = isRequested ? 'Chưa có hóa đơn trong kỳ' : 'Chưa có dịch vụ chính'
  } else if (status === KPI_STATUS.MET) {
    missingText = 'Đạt'
  } else if (missing == null) {
    missingText = 'Chưa tính được số còn thiếu'
  } else {
    missingText = `Còn thiếu ${missing} ${def.missingUnit}`
  }

  const progress = (() => {
    if (status === KPI_STATUS.INSUFFICIENT_DATA || status === KPI_STATUS.NO_POLICY) return 0
    if (target == null || target <= 0) return rate != null ? Math.min(1, rate) : 0
    if (rate == null) return 0
    return Math.max(0, Math.min(1, rate / target))
  })()

  return {
    ...def,
    status,
    statusLabel: kpiStatusLabel(status),
    actual,
    denominator,
    rate,
    rateLabel: formatKpiPercent(rate),
    target,
    targetLabel: formatTargetPercent(target),
    missing,
    missingText,
    progress,
    mixedTargets: Boolean(kpi?.mixedTargets),
  }
}

export function summarizeOverallKpis(overall) {
  const cards = EMPLOYEE_KPI_CARD_DEFS
    .map((def) => buildKpiCardModel(def, overall?.kpis?.[def.key], overall?.counts))
    .filter((c) => c.status !== KPI_STATUS.NOT_APPLICABLE)
  const evaluable = cards.filter((c) => c.status === KPI_STATUS.MET || c.status === KPI_STATUS.NOT_MET)
  const met = cards.filter((c) => c.status === KPI_STATUS.MET).length
  const total = cards.length
  const noPolicy = cards.every((c) => c.status === KPI_STATUS.NO_POLICY)
  const allMet = evaluable.length === total && met === total
  const headline = noPolicy
    ? 'Chưa có chính sách KPI kỳ này'
    : allMet ? 'Đạt KPI' : 'Chưa đạt KPI'
  return { cards, met, total, headline, allMet, noPolicy }
}

/**
 * 1 service line = 1 row — dùng drill-down + export (không tính lại KPI).
 */
export function buildKpiServiceLineRows(includedInvoices = []) {
  const rows = []
  for (const inv of includedInvoices || []) {
    const services = Array.isArray(inv.services) ? inv.services : []
    const classified = Array.isArray(inv.classified) ? inv.classified : []
    const requested = Boolean(inv.customerRequested)
    const n = Math.max(services.length, classified.length, 1)
    for (let i = 0; i < n; i += 1) {
      const svc = services[i] || {}
      const c = classified[i] || (svc.serviceId || svc.id ? classifyKpiServiceLine(svc, { homeBranchId: inv.homeBranchId }) : null)
      if (!c && services.length === 0) {
        rows.push({
          date: inv.date,
          invoiceId: inv.invoiceId,
          branchId: inv.branchId,
          serviceName: '—',
          group: KPI_GROUPS.UNMAPPED,
          groupLabel: KPI_GROUP_LABELS[KPI_GROUPS.UNMAPPED],
          customerRequested: requested,
          token: '',
        })
        break
      }
      if (!c) continue
      rows.push({
        date: inv.date,
        invoiceId: inv.invoiceId,
        branchId: inv.branchId,
        serviceName: svc.serviceName || svc.name || c.token || '—',
        group: c.group,
        groupLabel: KPI_GROUP_LABELS[c.group] || c.group,
        customerRequested: requested,
        token: c.token || '',
      })
    }
  }
  rows.sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
    || String(b.invoiceId).localeCompare(String(a.invoiceId))
    || String(a.serviceName).localeCompare(String(b.serviceName)),
  )
  return rows
}

export function filterKpiServiceLineRows(rows = [], filterKey = 'all') {
  if (!filterKey || filterKey === 'all') return rows
  if (filterKey === 'requested') return rows.filter((r) => r.customerRequested)
  if (filterKey === 'duration90') {
    return rows.filter((r) => r.group === KPI_GROUPS.MAIN && KPI_MAIN_90_TOKENS.includes(r.token))
  }
  const groupMap = {
    main: KPI_GROUPS.MAIN,
    addon: KPI_GROUPS.ADDON,
    advanced: KPI_GROUPS.ADVANCED,
    combo: KPI_GROUPS.COMBO,
  }
  const group = groupMap[filterKey]
  if (!group) return rows
  return rows.filter((r) => r.group === group)
}

export function buildDrillRows(includedInvoices = [], kpiKey) {
  return includedInvoices
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.invoiceId).localeCompare(String(a.invoiceId)))
    .map((inv) => {
      const classified = Array.isArray(inv.classified) ? inv.classified : []
      const lines = Array.isArray(inv.services)
        ? inv.services.map((svc, idx) => {
            const c = classified[idx] || classifyKpiServiceLine(svc, { homeBranchId: inv.homeBranchId })
            return {
              serviceId: svc.serviceId || svc.id || '',
              name: svc.serviceName || svc.name || c.token || '',
              group: c.group,
              token: c.token,
            }
          })
        : []
      const mainLines = lines.filter((l) => l.group === KPI_GROUPS.MAIN)
      const focusLines = (() => {
        if (kpiKey === 'addon') return lines.filter((l) => l.group === KPI_GROUPS.ADDON)
        if (kpiKey === 'advanced') return lines.filter((l) => l.group === KPI_GROUPS.ADVANCED)
        if (kpiKey === 'combo') return lines.filter((l) => l.group === KPI_GROUPS.COMBO)
        if (kpiKey === 'duration90') {
          return lines.filter((l, idx) => {
            const svc = Array.isArray(inv.services) ? inv.services[idx] : {}
            return isKpiMain90Line(svc, l)
          })
        }
        return []
      })()
      return {
        invoiceId: inv.invoiceId,
        date: inv.date,
        branchId: inv.branchId,
        customerRequested: Boolean(inv.customerRequested),
        mainLines,
        focusLines,
        lines,
      }
    })
    .filter((row) => {
      if (kpiKey === 'requested') return true
      if (kpiKey === 'addon') return row.focusLines.length > 0 || row.mainLines.length > 0
      return row.focusLines.length > 0 || row.mainLines.length > 0
    })
}
