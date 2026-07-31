import { CLOSE_CYCLES, getCloseCycleRange, formatCloseCycleRangeLabel } from './payCycleCalendar'
import { canSubmitCloseCycle } from './closeCycleStatus'
import { fetchPayrollCycleClose } from '../../repositories/payrollCycleCloseRepository'

/**
 * Banner ngày 02 → Kỳ 1; ngày 17 → Kỳ 2.
 * Chỉ hiện khi NV chưa gửi (null/draft/returned).
 */
export function resolvePayrollCloseRemindTarget(todayDate) {
  if (!todayDate || todayDate.length < 10) return null
  const billingMonth = todayDate.slice(0, 7)
  const day = Number(todayDate.slice(8, 10))
  if (day === 2) {
    const range = getCloseCycleRange(billingMonth, CLOSE_CYCLES.PERIOD_1)
    return {
      billingMonth,
      cycle: CLOSE_CYCLES.PERIOD_1,
      cycleLabel: 'Kỳ 1',
      rangeLabel: formatCloseCycleRangeLabel(billingMonth, CLOSE_CYCLES.PERIOD_1),
      submitDate: range.submitDate,
    }
  }
  if (day === 17) {
    const range = getCloseCycleRange(billingMonth, CLOSE_CYCLES.PERIOD_2)
    return {
      billingMonth,
      cycle: CLOSE_CYCLES.PERIOD_2,
      cycleLabel: 'Kỳ 2',
      rangeLabel: formatCloseCycleRangeLabel(billingMonth, CLOSE_CYCLES.PERIOD_2),
      submitDate: range.submitDate,
    }
  }
  return null
}

export async function shouldShowPayrollCloseRemind({ employeeId, todayDate }) {
  const target = resolvePayrollCloseRemindTarget(todayDate)
  if (!target || !employeeId) return { show: false, target: null }
  const existing = await fetchPayrollCycleClose({
    employeeId,
    billingMonth: target.billingMonth,
    cycle: target.cycle,
  })
  const status = existing?.status ?? null
  return {
    show: canSubmitCloseCycle(status),
    target,
    status,
  }
}
