/**
 * UAT — Banner chốt lương sau submit / approve / return.
 * Run: npx vite-node scripts/verify-payroll-close-banner-status-uat.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { CLOSE_CYCLE_STATUS } from '../src/utils/payrollCycleClose/closeCycleStatus.js'
import {
  PAYROLL_CLOSE_BANNER_MODE,
  formatCloseSubmittedAtLabel,
  resolvePayrollCloseBannerMode,
  shouldNagPayrollCloseSubmit,
} from '../src/utils/payrollCycleClose/closeRemind.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

console.log('\n=== UAT — Payroll close banner status after submit ===\n')

// 1. Submit → waiting → không nag / không CTA gửi
{
  assert.equal(
    resolvePayrollCloseBannerMode(CLOSE_CYCLE_STATUS.SUBMITTED),
    PAYROLL_CLOSE_BANNER_MODE.WAITING,
  )
  assert.equal(
    resolvePayrollCloseBannerMode(CLOSE_CYCLE_STATUS.RESUBMITTED),
    PAYROLL_CLOSE_BANNER_MODE.WAITING,
  )
  assert.equal(shouldNagPayrollCloseSubmit(CLOSE_CYCLE_STATUS.SUBMITTED), false)
  assert.equal(shouldNagPayrollCloseSubmit(CLOSE_CYCLE_STATUS.RESUBMITTED), false)
  console.log('  [PASS] 1. submitted/resubmitted → waiting; không nhắc gửi')
}

// 2. Approve → Đã duyệt
{
  assert.equal(
    resolvePayrollCloseBannerMode(CLOSE_CYCLE_STATUS.APPROVED),
    PAYROLL_CLOSE_BANNER_MODE.APPROVED,
  )
  assert.equal(shouldNagPayrollCloseSubmit(CLOSE_CYCLE_STATUS.APPROVED), false)
  console.log('  [PASS] 2. approved → banner Đã duyệt; không nhắc')
}

// 3. Returned → hiện lại nag + Gửi lại
{
  assert.equal(
    resolvePayrollCloseBannerMode(CLOSE_CYCLE_STATUS.RETURNED),
    PAYROLL_CLOSE_BANNER_MODE.RETURNED,
  )
  assert.equal(shouldNagPayrollCloseSubmit(CLOSE_CYCLE_STATUS.RETURNED), true)
  assert.equal(shouldNagPayrollCloseSubmit(null), true)
  assert.equal(shouldNagPayrollCloseSubmit(CLOSE_CYCLE_STATUS.DRAFT), true)
  console.log('  [PASS] 3. returned/null/draft → nhắc lại (Gửi lại)')
}

// Format thời gian gửi
{
  const label = formatCloseSubmittedAtLabel('2026-08-04T10:05:00.000Z')
  assert.match(label, /^\d{2}:\d{2} \d{2}\/\d{2}$/)
  console.log('  [PASS] format Đã gửi lúc HH:mm dd/MM')
}

// Source: banner + shouldShow + notify
{
  const remind = read('src/utils/payrollCycleClose/closeRemind.js')
  assert.match(remind, /resolvePayrollCloseBannerMode/)
  assert.match(remind, /shouldNagPayrollCloseSubmit/)
  assert.doesNotMatch(
    remind,
    /if \(!canSubmitCloseCycle\(status\)\) \{\s*return \{\s*show: false/,
  )

  const banner = read('src/components/common/PayrollCloseRemindBanner.jsx')
  assert.match(banner, /Đang chờ Quản lý\/Admin duyệt/)
  assert.match(banner, /Đã gửi lúc/)
  assert.match(banner, /Người nhận/)
  assert.match(banner, /Lý do trả/)
  assert.match(banner, /Gửi lại/)
  assert.match(banner, /Đã duyệt/)
  assert.doesNotMatch(banner, /nagSubmit \?[\s\S]*Gửi chốt lương[\s\S]*: null/)

  const submit = read('src/utils/payrollCycleClose/submitCloseCycle.js')
  assert.match(submit, /notifyDataSynced\(\['payroll-cycle-closes'/)
  assert.match(submit, /status: nextStatus/)
  assert.match(submit, /CLOSE_CYCLE_STATUS\.SUBMITTED|resolveNextSubmitStatus/)

  const app = read('src/App.jsx')
  assert.match(app, /shouldShowPayrollCloseRemind/)
  assert.match(app, /syncVersion/)

  console.log('  [PASS] source: show after submit + notify + UI waiting/return/approve')
}

console.log('\n=== ALL PASS — payroll close banner status UAT ===\n')
