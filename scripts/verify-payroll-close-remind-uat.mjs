/**
 * UAT — Nhắc chốt kỳ lương (kéo dài đến khi gửi + checklist gates).
 * Run: vite-node scripts/verify-payroll-close-remind-uat.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import {
  CLOSE_CYCLES,
  getCloseCycleRange,
} from '../src/utils/payrollCycleClose/payCycleCalendar.js'
import {
  listDuePayrollCloseTargets,
  resolvePayrollCloseRemindTarget,
  formatPendingOlderCloseMessage,
  isCloseCycleIncomplete,
} from '../src/utils/payrollCycleClose/closeRemind.js'
import {
  canSubmitCloseCycle,
  CLOSE_CYCLE_STATUS,
} from '../src/utils/payrollCycleClose/closeCycleStatus.js'

console.log('\n=== UAT — Payroll close remind (continuous) ===\n')

// 1. Ngày 17 → Kỳ 1 hiện
{
  const t = resolvePayrollCloseRemindTarget('2026-08-17')
  assert.ok(t)
  assert.equal(t.cycle, CLOSE_CYCLES.PERIOD_1)
  assert.equal(t.billingMonth, '2026-08')
  assert.equal(t.submitDate, '2026-08-17')
  console.log('  [PASS] 1. Ngày 17 → Kỳ 1 hiện')
}

// 2. Ngày 18 chưa gửi → vẫn hiện Kỳ 1
{
  const t = resolvePayrollCloseRemindTarget('2026-08-18')
  assert.ok(t)
  assert.equal(t.cycle, CLOSE_CYCLES.PERIOD_1)
  assert.equal(t.billingMonth, '2026-08')
  const due = listDuePayrollCloseTargets('2026-08-18')
  assert.ok(due.some((x) => x.billingMonth === '2026-08' && x.cycle === CLOSE_CYCLES.PERIOD_1))
  console.log('  [PASS] 2. Ngày 18 chưa gửi → Kỳ 1 vẫn trong danh sách đến hạn')
}

// 3. Ngày 02 → Kỳ 2 tháng trước hiện
{
  const t = resolvePayrollCloseRemindTarget('2026-09-02')
  assert.ok(t)
  assert.equal(t.cycle, CLOSE_CYCLES.PERIOD_2)
  assert.equal(t.billingMonth, '2026-08')
  assert.equal(getCloseCycleRange('2026-08', CLOSE_CYCLES.PERIOD_2).submitDate, '2026-09-02')
  console.log('  [PASS] 3. Ngày 02 → Kỳ 2 tháng trước hiện')
}

// 4. Ngày 05 chưa gửi → vẫn hiện Kỳ 2 tháng trước
{
  const due = listDuePayrollCloseTargets('2026-09-05')
  const k2 = due.find((x) => x.billingMonth === '2026-08' && x.cycle === CLOSE_CYCLES.PERIOD_2)
  assert.ok(k2)
  // Trước ngày 17: Kỳ 1 tháng 09 chưa đến hạn
  assert.equal(
    due.some((x) => x.billingMonth === '2026-09' && x.cycle === CLOSE_CYCLES.PERIOD_1),
    false,
  )
  console.log('  [PASS] 4. Ngày 05 chưa gửi → Kỳ 2 tháng trước vẫn đến hạn')
}

// 5–6. Submitted/approved ẩn; returned hiện lại (status gate)
{
  assert.equal(canSubmitCloseCycle(CLOSE_CYCLE_STATUS.SUBMITTED), false)
  assert.equal(canSubmitCloseCycle(CLOSE_CYCLE_STATUS.RESUBMITTED), false)
  assert.equal(canSubmitCloseCycle(CLOSE_CYCLE_STATUS.APPROVED), false)
  assert.equal(canSubmitCloseCycle(CLOSE_CYCLE_STATUS.RETURNED), true)
  assert.equal(canSubmitCloseCycle(null), true)
  assert.equal(canSubmitCloseCycle(CLOSE_CYCLE_STATUS.DRAFT), true)
  console.log('  [PASS] 5–6. submitted/approved ẩn; returned/null/draft hiện lại')
}

// Cảnh báo kỳ cũ — không đổi cửa sổ lịch
{
  assert.equal(formatPendingOlderCloseMessage(0), '')
  assert.equal(formatPendingOlderCloseMessage(1), 'Bạn còn 1 kỳ lương trước chưa hoàn thành.')
  assert.equal(formatPendingOlderCloseMessage(2), 'Bạn còn 2 kỳ lương trước chưa hoàn thành.')
  assert.equal(isCloseCycleIncomplete(null), true)
  assert.equal(isCloseCycleIncomplete(CLOSE_CYCLE_STATUS.DRAFT), true)
  assert.equal(isCloseCycleIncomplete(CLOSE_CYCLE_STATUS.RETURNED), true)
  assert.equal(isCloseCycleIncomplete(CLOSE_CYCLE_STATUS.SUBMITTED), true)
  assert.equal(isCloseCycleIncomplete(CLOSE_CYCLE_STATUS.RESUBMITTED), true)
  assert.equal(isCloseCycleIncomplete(CLOSE_CYCLE_STATUS.APPROVED), false)
  const onAug4 = resolvePayrollCloseRemindTarget('2026-08-04')
  assert.equal(onAug4.cycle, CLOSE_CYCLES.PERIOD_2)
  assert.equal(onAug4.billingMonth, '2026-07')
  const onAug17 = resolvePayrollCloseRemindTarget('2026-08-17')
  assert.equal(onAug17.cycle, CLOSE_CYCLES.PERIOD_1)
  assert.equal(onAug17.billingMonth, '2026-08')
  console.log('  [PASS] cửa sổ lịch 02–16=Kỳ2 / 17+=Kỳ1; copy kỳ cũ phụ')
}

// Trước ngày chốt: không nhắc kỳ đó
{
  assert.equal(
    listDuePayrollCloseTargets('2026-08-16').some(
      (x) => x.billingMonth === '2026-08' && x.cycle === CLOSE_CYCLES.PERIOD_1,
    ),
    false,
  )
  assert.equal(
    listDuePayrollCloseTargets('2026-09-01').some(
      (x) => x.billingMonth === '2026-08' && x.cycle === CLOSE_CYCLES.PERIOD_2,
    ),
    false,
  )
  console.log('  [PASS] trước ngày 17/02 không đưa kỳ tương ứng vào danh sách đến hạn')
}

// Ngày 18: Kỳ 1 Aug là cửa sổ lịch; Kỳ 2 Jul có thể còn trong lookback (không đổi CTA)
{
  const due = listDuePayrollCloseTargets('2026-08-18')
  assert.ok(due.length >= 1)
  assert.ok(due[0].submitDate <= '2026-08-18')
  for (let i = 1; i < due.length; i += 1) {
    assert.ok(due[i - 1].submitDate <= due[i].submitDate)
  }
  const window = resolvePayrollCloseRemindTarget('2026-08-18')
  assert.equal(window.cycle, CLOSE_CYCLES.PERIOD_1)
  assert.equal(window.billingMonth, '2026-08')
  console.log('  [PASS] danh sách đến hạn sort submitDate; cửa sổ lịch = kỳ mới nhất')
}

// Source guards
{
  const root = fileURLToPath(new URL('..', import.meta.url))
  const remindSrc = readFileSync(`${root}/src/utils/payrollCycleClose/closeRemind.js`, 'utf8')
  assert.match(remindSrc, /listDuePayrollCloseTargets/)
  assert.match(remindSrc, /submitDate > todayDate/)
  assert.match(remindSrc, /resolvePayrollCloseRemindTarget/)
  assert.match(remindSrc, /pendingOlderTargets|formatPendingOlderCloseMessage/)
  assert.match(remindSrc, /isCloseCycleIncomplete/)
  assert.match(remindSrc, /chưa hoàn thành/)
  assert.doesNotMatch(remindSrc, /ưu tiên kỳ cũ/)
  assert.doesNotMatch(remindSrc, /branchId === target/)

  const bannerSrc = readFileSync(`${root}/src/components/common/PayrollCloseRemindBanner.jsx`, 'utf8')
  assert.match(bannerSrc, /formatPayrollCloseSubmitCta|Gửi chốt lương/)
  assert.match(bannerSrc, /Xem các kỳ còn thiếu/)
  assert.match(bannerSrc, /pendingOlderMessage|pendingOlderCount/)
  assert.doesNotMatch(bannerSrc, /Xem các kỳ chưa gửi/)
  assert.doesNotMatch(bannerSrc, /Kiểm tra &amp; Chốt kỳ lương/)
  assert.doesNotMatch(bannerSrc, />\s*Để sau\s*</)

  const dismissSrc = readFileSync(`${root}/src/utils/payrollCloseRemindDismiss.js`, 'utf8')
  assert.match(dismissSrc, /no-op/)

  const previewSrc = readFileSync(`${root}/src/utils/payrollCycleClose/buildCloseCyclePreview.js`, 'utf8')
  assert.match(previewSrc, /invoicesSynced/)
  assert.match(previewSrc, /checkUnsyncedLocalInvoices/)

  const panelSrc = readFileSync(`${root}/src/components/salary/PayrollCycleClosePanel.jsx`, 'utf8')
  assert.match(panelSrc, /Checklist trước khi gửi/)
  assert.match(panelSrc, /Gửi chốt lương/)

  const submitSrc = readFileSync(`${root}/src/utils/payrollCycleClose/submitCloseCycle.js`, 'utf8')
  assert.match(submitSrc, /notifyDataSynced\(\['payroll-cycle-closes'/)

  const appSrc = readFileSync(`${root}/src/App.jsx`, 'utf8')
  assert.match(appSrc, /payrollCloseRemindCollapsed/)
  assert.match(appSrc, /migrateLocalInvoicesToSupabase/)
  assert.match(appSrc, /onViewPendingPeriods/)
  assert.doesNotMatch(appSrc, /setPayrollCloseRemindDismissed/)

  const due = listDuePayrollCloseTargets('2026-08-17')
  assert.ok(due.every((t) => t.billingMonth && t.cycle && !('branchId' in t)))

  console.log('  [PASS] 7–8 + CTA sync/attendance + cửa theo lịch + kỳ cũ phụ')
}

console.log('\n=== ALL PASS — payroll close remind UAT ===\n')
