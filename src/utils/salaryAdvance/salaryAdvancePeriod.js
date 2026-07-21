import { isPayrollMonthLocked } from '../payrollEngine'
import {
  getDefaultPayCycleForVietnamDate,
  getPayPeriodRange,
  PAY_CYCLES,
  shiftMonthValue,
} from '../salaryReport'

export function resolvePayrollPeriodFromAdvanceDate(advanceDate) {
  const date = String(advanceDate ?? '').slice(0, 10)
  const month = date.slice(0, 7)
  const parsed = new Date(`${date}T12:00:00`)
  const cycle = getDefaultPayCycleForVietnamDate(parsed)
  const range = getPayPeriodRange(month, cycle)
  const payrollPeriod = cycle === PAY_CYCLES.PERIOD_1 ? '01-15' : '16-end'
  return {
    advanceDate: date,
    month,
    cycle,
    payrollPeriod,
    fromDate: range.fromDate,
    toDate: range.toDate,
  }
}

export function getNextPayPeriod(month, cycle) {
  if (cycle === PAY_CYCLES.PERIOD_2) {
    return { month: shiftMonthValue(month, 1), cycle: PAY_CYCLES.PERIOD_1 }
  }
  return { month, cycle: PAY_CYCLES.PERIOD_2 }
}

export function resolveAdvanceTargetWithLock(advanceDate, branchId, locks, { forceNextPeriod = false } = {}) {
  let target = resolvePayrollPeriodFromAdvanceDate(advanceDate)
  let shifted = false

  for (let i = 0; i < 6; i += 1) {
    const locked = isPayrollMonthLocked(target.month, branchId, locks ?? [])
    if (!locked) {
      return { ...target, shifted, locked: false, blocked: false }
    }
    if (!forceNextPeriod) {
      const next = getNextPayPeriod(target.month, target.cycle)
      return {
        ...target,
        locked: true,
        blocked: true,
        suggestedNext: next,
        message: `Kỳ lương tháng ${target.month} đã chốt. Admin cần mở khóa hoặc chọn đưa vào kỳ kế tiếp (${next.cycle === PAY_CYCLES.PERIOD_1 ? '01–15' : '16–cuối tháng'} ${next.month}).`,
      }
    }
    const next = getNextPayPeriod(target.month, target.cycle)
    const sampleDay = next.cycle === PAY_CYCLES.PERIOD_1 ? `${next.month}-01` : `${next.month}-16`
    target = resolvePayrollPeriodFromAdvanceDate(sampleDay)
    shifted = true
  }

  return {
    blocked: true,
    locked: true,
    message: 'Không thể gán kỳ lương — liên hệ Admin mở khóa kỳ cũ.',
  }
}
