import { KPI_STATUS } from '../constants/kpiPolicy'
import { KPI_GROUPS } from '../constants/kpiPolicy'
import { classifyKpiServiceLine } from './kpiServiceClassifier'

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
  if (status === KPI_STATUS.MET) return 'ĐẠT'
  if (status === KPI_STATUS.NOT_MET) return 'CHƯA ĐẠT'
  if (status === KPI_STATUS.INSUFFICIENT_DATA) return 'CHƯA ĐỦ DỮ LIỆU'
  if (status === KPI_STATUS.NOT_APPLICABLE) return 'KHÔNG ÁP DỤNG'
  return status || '—'
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
  if (status === KPI_STATUS.INSUFFICIENT_DATA) {
    missingText = isRequested ? 'Chưa có hóa đơn trong kỳ' : 'Chưa có dịch vụ chính (MAIN = 0)'
  } else if (status === KPI_STATUS.MET) {
    missingText = 'ĐẠT'
  } else if (missing == null) {
    missingText = 'Chưa tính được số còn thiếu'
  } else {
    missingText = `Còn thiếu ${missing} ${def.missingUnit}`
  }

  const progress = (() => {
    if (status === KPI_STATUS.INSUFFICIENT_DATA) return 0
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
  const cards = EMPLOYEE_KPI_CARD_DEFS.map((def) =>
    buildKpiCardModel(def, overall?.kpis?.[def.key], overall?.counts),
  )
  const evaluable = cards.filter((c) => c.status === KPI_STATUS.MET || c.status === KPI_STATUS.NOT_MET)
  const met = cards.filter((c) => c.status === KPI_STATUS.MET).length
  const total = cards.length
  const allMet = evaluable.length === total && met === total
  const headline = allMet ? 'ĐẠT KPI' : 'CHƯA ĐẠT KPI'
  return { cards, met, total, headline, allMet }
}

export function buildDrillRows(includedInvoices = [], kpiKey) {
  return includedInvoices
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.invoiceId).localeCompare(String(a.invoiceId)))
    .map((inv) => {
      const classified = Array.isArray(inv.classified) ? inv.classified : []
      const lines = Array.isArray(inv.services)
        ? inv.services.map((svc, idx) => {
            const c = classified[idx] || classifyKpiServiceLine(svc)
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
