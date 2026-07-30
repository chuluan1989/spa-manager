/**
 * Unit verify quy tắc khóa kỳ lương theo lịch.
 * Run: node scripts/verify-payroll-period-lock.mjs
 */

const PAY_CYCLES = { PERIOD_1: 'period1', PERIOD_2: 'period2' }

function shiftMonthValue(monthValue, deltaMonths) {
  const [yStr, mStr] = monthValue.split('-')
  const dt = new Date(Number(yStr), Number(mStr) - 1 + deltaMonths, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

function resolvePayCycleForDate(dateStr) {
  const month = dateStr.slice(0, 7)
  const day = Number(dateStr.slice(8, 10))
  return { month, cycle: day <= 15 ? PAY_CYCLES.PERIOD_1 : PAY_CYCLES.PERIOD_2 }
}

function getPayCycleLockStartDate(month, cycle) {
  if (cycle === PAY_CYCLES.PERIOD_1) return `${month}-16`
  if (cycle === PAY_CYCLES.PERIOD_2) return `${shiftMonthValue(month, 1)}-01`
  return null
}

function isPayCycleClosedForRecordDate(recordDate, todayDate) {
  const info = resolvePayCycleForDate(recordDate)
  const lockStart = getPayCycleLockStartDate(info.month, info.cycle)
  return Boolean(lockStart && todayDate >= lockStart)
}

let passed = 0
let failed = 0

function assert(name, condition) {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name}`)
  }
}

console.log('\n=== Verify khóa kỳ lương ===\n')

assert('Kỳ 1 lock start = ngày 16', getPayCycleLockStartDate('2026-07', PAY_CYCLES.PERIOD_1) === '2026-07-16')
assert('Kỳ 2 lock start = ngày 01 tháng sau', getPayCycleLockStartDate('2026-07', PAY_CYCLES.PERIOD_2) === '2026-08-01')
assert('Kỳ 1 chưa chốt ngày 15', !isPayCycleClosedForRecordDate('2026-07-10', '2026-07-15'))
assert('Kỳ 1 đã chốt từ ngày 16', isPayCycleClosedForRecordDate('2026-07-10', '2026-07-16'))
assert('Kỳ 2 chưa chốt ngày 31/07', !isPayCycleClosedForRecordDate('2026-07-20', '2026-07-31'))
assert('Kỳ 2 đã chốt từ 01/08', isPayCycleClosedForRecordDate('2026-07-20', '2026-08-01'))

console.log(`\nKết quả: ${passed} pass, ${failed} fail\n`)
process.exit(failed > 0 ? 1 : 0)
