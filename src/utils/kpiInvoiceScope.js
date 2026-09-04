/**
 * KPI Source of Truth — hóa đơn theo khoảng ngày từ Supabase (paginate đủ).
 * KHÔNG dùng loadInvoices() / INVOICE_CACHE_LIMIT=100.
 */
import { fetchInvoicesFiltered } from '../repositories/invoicesRepository'
import { SYNC_EVENT } from './dataSyncEvents'
import { currentMonthYm, monthBounds } from './employeeKpiView'
import { getPayCycleLabel, getPayPeriodRange, PAY_CYCLES } from './salaryReport'

/** @type {Map<string, { invoices: any[], fromDate: string, toDate: string, fetchedAt: number }>} */
const scopeCache = new Map()

export function kpiInvoiceScopeKey({ fromDate = '', toDate = '', branchId = '', employeeId = '' } = {}) {
  return `${fromDate}|${toDate}|${branchId || ''}|${employeeId || ''}`
}

export function invalidateKpiInvoiceScope(changedEntities) {
  const list = Array.isArray(changedEntities) ? changedEntities : []
  if (!list.length || list.includes('invoices') || list.includes('*') || list.includes('kpi-invoices')) {
    scopeCache.clear()
  }
}

export function clearKpiInvoiceScopeCache() {
  scopeCache.clear()
}

if (typeof window !== 'undefined') {
  window.addEventListener(SYNC_EVENT, (event) => {
    invalidateKpiInvoiceScope(event.detail?.changedEntities)
  })
}

/** Ngày hôm nay Asia/Ho_Chi_Minh (YYYY-MM-DD). */
export function todayYmAsiaHoChiMinh(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

/**
 * Phạm vi tháng lịch đầy đủ (Kỳ 1 + Kỳ 2).
 * Luôn from=01 → last day of month — không cắt theo kỳ lương active.
 */
export function resolveKpiMonthRange(monthYm, { now = new Date() } = {}) {
  const { fromDate, toDate: calendarToDate } = monthBounds(monthYm)
  const today = todayYmAsiaHoChiMinh(now)
  const isCurrentMonth = monthYm === currentMonthYm(now)
  const clippedHint = Boolean(isCurrentMonth && today && calendarToDate && today < calendarToDate)
  return {
    monthYm,
    fromDate,
    toDate: calendarToDate,
    calendarToDate,
    /** UI hint: dữ liệu thực tế chỉ có đến hôm nay trong tháng đang chạy. */
    clippedToToday: false,
    dataAsOfHint: clippedHint ? today : null,
    rangeLabel: clippedHint
      ? `${fromDate} → ${calendarToDate} (tháng đủ Kỳ 1+2; HĐ thực tế đến ${today})`
      : `${fromDate} → ${calendarToDate}`,
  }
}

/**
 * Phạm vi KPI theo kỳ lương (Kỳ 1 = 01–15, Kỳ 2 = 16–cuối tháng).
 * Không gộp cả tháng.
 */
export function resolveKpiPayCycleRange(monthYm, cycle = PAY_CYCLES.PERIOD_1, { now = new Date() } = {}) {
  const resolvedCycle = cycle === PAY_CYCLES.PERIOD_2 ? PAY_CYCLES.PERIOD_2 : PAY_CYCLES.PERIOD_1
  const { fromDate, toDate: cycleToDate } = getPayPeriodRange(monthYm, resolvedCycle)
  const today = todayYmAsiaHoChiMinh(now)
  const isCurrentMonth = monthYm === currentMonthYm(now)
  const clippedHint = Boolean(isCurrentMonth && today && cycleToDate && today < cycleToDate)
  const cycleLabel = getPayCycleLabel(resolvedCycle)
  return {
    monthYm,
    cycle: resolvedCycle,
    fromDate,
    toDate: cycleToDate,
    calendarToDate: cycleToDate,
    clippedToToday: false,
    dataAsOfHint: clippedHint ? today : null,
    rangeLabel: clippedHint
      ? `${fromDate} → ${cycleToDate} (${cycleLabel}; HĐ thực tế đến ${today})`
      : `${fromDate} → ${cycleToDate} (${cycleLabel})`,
  }
}

/**
 * Fetch 1 lần cho toàn scope. Cache theo key scope (full result).
 * Không N+1 theo nhân viên.
 *
 * Lưu ý: không truyền employeeId vào repo khi cần SoT attribution thuần —
 * repo OR support_employee_id. Caller filter bằng engine (invoice.employeeId).
 */
export async function fetchKpiInvoicesForScope({
  fromDate = '',
  toDate = '',
  branchId = '',
  /** Chỉ dùng khi muốn thu hẹp mạng; engine vẫn lọc attribution. */
  employeeId = '',
  force = false,
} = {}) {
  if (!fromDate || !toDate) {
    throw new Error('KPI scope cần fromDate và toDate')
  }
  const key = kpiInvoiceScopeKey({ fromDate, toDate, branchId, employeeId })
  if (!force && scopeCache.has(key)) {
    return { ...scopeCache.get(key), fromCache: true, key }
  }

  const invoices = await fetchInvoicesFiltered({
    fromDate,
    toDate,
    ...(branchId ? { branchId } : {}),
    ...(employeeId ? { employeeId } : {}),
  })

  const payload = {
    invoices: Array.isArray(invoices) ? invoices : [],
    fromDate,
    toDate,
    branchId: branchId || '',
    employeeId: employeeId || '',
    fetchedAt: Date.now(),
    key,
  }
  scopeCache.set(key, payload)
  return { ...payload, fromCache: false }
}
