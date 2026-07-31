/**
 * Quy ước kỳ lương chốt (payroll cycle close) — KHÔNG dùng khoảng cũ 01–15 / 16–cuối.
 *
 * Tháng M (ví dụ 2026-08):
 * - Kỳ 1: 16 → cuối tháng trước (16/07–31/07), gửi chốt ngày 02/M
 * - Kỳ 2: 01 → 15 tháng M (01/08–15/08), gửi chốt ngày 17/M
 */

export const CLOSE_CYCLES = {
  PERIOD_1: 'period1',
  PERIOD_2: 'period2',
}

export const CLOSE_CYCLE_OPTIONS = [
  {
    value: CLOSE_CYCLES.PERIOD_1,
    label: 'Kỳ 1',
    hint: '16–cuối tháng trước · gửi ngày 02',
  },
  {
    value: CLOSE_CYCLES.PERIOD_2,
    label: 'Kỳ 2',
    hint: '01–15 tháng này · gửi ngày 17',
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
 * @param {string} billingMonth YYYY-MM — tháng gắn với ngày gửi chốt
 * @param {'period1'|'period2'} cycle
 * @returns {{ fromDate: string, toDate: string, submitDate: string, billingMonth: string, cycle: string }}
 */
export function getCloseCycleRange(billingMonth, cycle) {
  if (!billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
    return { fromDate: '', toDate: '', submitDate: '', billingMonth: '', cycle: cycle || '' }
  }

  if (cycle === CLOSE_CYCLES.PERIOD_1) {
    const prev = shiftMonthValue(billingMonth, -1)
    const last = getLastDayOfMonthValue(prev)
    return {
      billingMonth,
      cycle: CLOSE_CYCLES.PERIOD_1,
      fromDate: `${prev}-16`,
      toDate: `${prev}-${String(last).padStart(2, '0')}`,
      submitDate: `${billingMonth}-02`,
    }
  }

  if (cycle === CLOSE_CYCLES.PERIOD_2) {
    return {
      billingMonth,
      cycle: CLOSE_CYCLES.PERIOD_2,
      fromDate: `${billingMonth}-01`,
      toDate: `${billingMonth}-15`,
      submitDate: `${billingMonth}-17`,
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
 * Gợi ý kỳ chốt theo ngày VN hiện tại (tháng gửi chốt = tháng chứa ngày hôm nay).
 * Ngày 01–16: ưu tiên Kỳ 1 (gửi ngày 02).
 * Ngày 17–31: ưu tiên Kỳ 2 (gửi ngày 17).
 */
export function getDefaultCloseCycleSelection(todayDate = '') {
  const iso = todayDate || new Date().toISOString().slice(0, 10)
  const billingMonth = iso.slice(0, 7)
  const day = Number(iso.slice(8, 10))
  if (!Number.isFinite(day)) {
    return { billingMonth, cycle: CLOSE_CYCLES.PERIOD_2 }
  }
  if (day <= 16) {
    return { billingMonth, cycle: CLOSE_CYCLES.PERIOD_1 }
  }
  return { billingMonth, cycle: CLOSE_CYCLES.PERIOD_2 }
}
