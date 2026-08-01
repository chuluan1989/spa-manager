/**
 * Quy ước kỳ lương chốt (payroll cycle close) — khớp Salary / PAY_CYCLES.
 *
 * Tháng M (ví dụ 2026-08):
 * - Kỳ 1: 01 → 15 tháng M, gửi chốt ngày 17/M
 * - Kỳ 2: 16 → cuối tháng M, gửi chốt ngày 02 tháng M+1
 */

export const CLOSE_CYCLES = {
  PERIOD_1: 'period1',
  PERIOD_2: 'period2',
}

export const CLOSE_CYCLE_OPTIONS = [
  {
    value: CLOSE_CYCLES.PERIOD_1,
    label: 'Kỳ 1',
    hint: '01–15 · gửi ngày 17',
  },
  {
    value: CLOSE_CYCLES.PERIOD_2,
    label: 'Kỳ 2',
    hint: '16–cuối tháng · gửi ngày 02 tháng sau',
  },
]

export function shiftMonthValue(monthValue, deltaMonths) {
  if (!monthValue) return ''
  const [yStr, mStr] = monthValue.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ''
  const dt = new Date(y, m - 1 + deltaMonths, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

export function getLastDayOfMonthValue(monthValue) {
  if (!monthValue) return 0
  const [yStr, mStr] = monthValue.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 0
  return new Date(y, m, 0).getDate()
}

/**
 * @param {string} billingMonth YYYY-MM — tháng của kỳ lương (tháng chứa khoảng ngày công)
 * @param {'period1'|'period2'} cycle
 * @returns {{ fromDate: string, toDate: string, submitDate: string, billingMonth: string, cycle: string }}
 */
export function getCloseCycleRange(billingMonth, cycle) {
  if (!billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
    return { fromDate: '', toDate: '', submitDate: '', billingMonth: '', cycle: cycle || '' }
  }

  if (cycle === CLOSE_CYCLES.PERIOD_1) {
    return {
      billingMonth,
      cycle: CLOSE_CYCLES.PERIOD_1,
      fromDate: `${billingMonth}-01`,
      toDate: `${billingMonth}-15`,
      submitDate: `${billingMonth}-17`,
    }
  }

  if (cycle === CLOSE_CYCLES.PERIOD_2) {
    const next = shiftMonthValue(billingMonth, 1)
    const last = getLastDayOfMonthValue(billingMonth)
    return {
      billingMonth,
      cycle: CLOSE_CYCLES.PERIOD_2,
      fromDate: `${billingMonth}-16`,
      toDate: `${billingMonth}-${String(last).padStart(2, '0')}`,
      submitDate: `${next}-02`,
    }
  }

  return { fromDate: '', toDate: '', submitDate: '', billingMonth, cycle: cycle || '' }
}

export function getCloseCycleLabel(cycle) {
  const option = CLOSE_CYCLE_OPTIONS.find((item) => item.value === cycle)
  if (!option) return '—'
  return `${option.label} (${option.hint})`
}

export function formatCloseCycleRangeLabel(billingMonth, cycle) {
  const range = getCloseCycleRange(billingMonth, cycle)
  if (!range.fromDate || !range.toDate) return '—'
  const fmt = (iso) => {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }
  return `${getCloseCycleLabel(cycle)} · ${fmt(range.fromDate)} → ${fmt(range.toDate)}`
}

/**
 * Gợi ý kỳ theo ngày hiện tại (tháng = tháng chứa ngày công).
 * Ngày 01–15 → Kỳ 1; ngày 16–cuối → Kỳ 2.
 */
export function getDefaultCloseCycleSelection(todayDate = '') {
  const iso = todayDate || new Date().toISOString().slice(0, 10)
  const billingMonth = iso.slice(0, 7)
  const day = Number(iso.slice(8, 10))
  if (!Number.isFinite(day)) {
    return { billingMonth, cycle: CLOSE_CYCLES.PERIOD_1 }
  }
  if (day <= 15) {
    return { billingMonth, cycle: CLOSE_CYCLES.PERIOD_1 }
  }
  return { billingMonth, cycle: CLOSE_CYCLES.PERIOD_2 }
}
