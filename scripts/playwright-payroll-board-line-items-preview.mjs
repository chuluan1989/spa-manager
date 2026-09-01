/**
 * Preview + UAT — Ứng lương / Phạt khác từng phát sinh (local Vite, không deploy).
 *
 *   PREVIEW_URL=http://127.0.0.1:5173 node --env-file=.env.development.local \
 *     scripts/playwright-payroll-board-line-items-preview.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/payroll-board-line-items-preview')
const SHOT = path.join(OUT, 'shots')
mkdirSync(SHOT, { recursive: true })

const BASE = process.env.PREVIEW_URL || process.env.UAT_BASE_URL || 'http://127.0.0.1:5173'
const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'
const MARKER = `UAT-LINE-${Date.now()}`

const report = {
  at: new Date().toISOString(),
  base: BASE,
  marker: MARKER,
  steps: [],
  ok: true,
}

function step(name, detail = {}) {
  report.steps.push({ name, at: new Date().toISOString(), ...detail })
  console.log(`${detail.failed ? 'FAIL' : 'PASS'} ${name}`, detail.note || detail.value || '')
  if (detail.failed) report.ok = false
}

function parseVnd(text) {
  const cleaned = String(text ?? '').replace(/[^\d+-]/g, '')
  if (!cleaned || cleaned === '+' || cleaned === '-') return 0
  return Number(cleaned)
}

async function loginAdmin(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('form.login__form select, select', { timeout: 20000 })
  await page.locator('form.login__form select, select').first().selectOption('admin')
  await page.fill('input[type="password"]', ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.getByRole('button', { name: /Lương/ }).first().waitFor({ timeout: 45000 })
  step('admin_login')
}

async function openSalaryProfile(page) {
  await page.getByRole('button', { name: 'Lương HRM lương & phiếu lương' }).click()
  await page.waitForTimeout(1800)
  const xemNv = page.getByRole('button', { name: 'Xem nhân viên' }).first()
  await xemNv.waitFor({ timeout: 20000 })
  await xemNv.click()
  await page.waitForTimeout(1200)

  const search = page.locator('.salary-page__toolbar input[type="search"]')
  if (await search.count()) {
    await search.fill('UAT Cong Tac')
    await page.waitForTimeout(600)
  }
  const uatBtn = page.getByRole('button', { name: /UAT Cong Tac/i }).first()
  if (await uatBtn.count()) {
    await uatBtn.click()
    step('open_uat_employee')
  } else {
    await search.fill('')
    await page.waitForTimeout(400)
    await page.locator('button.salary-emp-table__name').first().click()
    step('open_first_employee', { note: 'UAT Cong Tac Final không thấy — dùng NV đầu danh sách' })
  }
  await page.waitForTimeout(1500)
}

async function openEditBoard(page) {
  await page.getByRole('button', { name: 'Sửa bảng lương' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor({ timeout: 15000 })
  return dialog
}

async function readCurrent(dialog, type) {
  const text = await dialog.locator(`[data-testid="edit-current-${type}"]`).innerText()
  return parseVnd(text)
}

async function waitForCurrent(page, dialog, type, expected, timeout = 15000) {
  await page.waitForFunction(
    ({ type: field, expected: want }) => {
      const el = document.querySelector(`[data-testid="edit-current-${field}"]`)
      const n = Number(String(el?.textContent || '').replace(/[^\d+-]/g, ''))
      return n === want
    },
    { type, expected },
    { timeout },
  )
  return expected
}

async function addLine(page, dialog, { testId, amount, reason, submitName, type, expectedTotal }) {
  await dialog.locator(`[data-testid="${testId}"]`).click()
  const form = dialog.locator('.salary-board-lines__form').last()
  await form.waitFor()
  await form.locator('input[inputmode="numeric"]').fill(String(amount))
  await form.getByRole('textbox', { name: 'Lý do' }).fill(reason)
  await form.getByRole('button', { name: submitName }).click()
  await dialog.locator(`[data-testid="${testId}"]`).waitFor({ timeout: 20000 })
  if (type && expectedTotal != null) {
    await waitForCurrent(page, dialog, type, expectedTotal)
  }
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(20000)

try {
  await loginAdmin(page)
  await openSalaryProfile(page)
  const dialog = await openEditBoard(page)
  await dialog.screenshot({ path: path.join(SHOT, '01-board-open.png') })

  const hasAtt = /Phạt chấm công/i.test(await dialog.innerText())
  const hasAdvanceAdd = await dialog.locator('[data-testid="add-advance-btn"]').count()
  const hasPenaltyAdd = await dialog.locator('[data-testid="add-penalty-btn"]').count()
  const penaltySet = await dialog.locator('[data-testid="edit-input-penalty"]').count()
  const advanceSet = await dialog.locator('[data-testid="edit-input-advance"]').count()
  step('ui_no_set_inputs', {
    failed: penaltySet !== 0 || advanceSet !== 0,
    penaltySet,
    advanceSet,
  })
  step('ui_add_buttons', {
    failed: !(hasAdvanceAdd && hasPenaltyAdd && hasAtt),
    hasAdvanceAdd,
    hasPenaltyAdd,
    hasAtt,
  })

  const beforeAdvance = await readCurrent(dialog, 'advance')
  const beforePenalty = await readCurrent(dialog, 'penalty')
  step('baseline', { advance: beforeAdvance, penalty: beforePenalty })

  await addLine(page, dialog, {
    testId: 'add-advance-btn',
    amount: 1_000_000,
    reason: `${MARKER} ứng 1`,
    submitName: 'Thêm ứng lương',
    type: 'advance',
    expectedTotal: beforeAdvance + 1_000_000,
  })
  const after1 = await readCurrent(dialog, 'advance')
  step('advance_add_1', {
    failed: after1 !== beforeAdvance + 1_000_000,
    before: beforeAdvance,
    after: after1,
    expected: beforeAdvance + 1_000_000,
  })
  await dialog.screenshot({ path: path.join(SHOT, '02-advance-1.png') })

  await addLine(page, dialog, {
    testId: 'add-advance-btn',
    amount: 2_000_000,
    reason: `${MARKER} ứng 2`,
    submitName: 'Thêm ứng lương',
    type: 'advance',
    expectedTotal: beforeAdvance + 3_000_000,
  })
  const after2 = await readCurrent(dialog, 'advance')
  step('advance_add_2_sum', {
    failed: after2 !== beforeAdvance + 3_000_000,
    after: after2,
    expected: beforeAdvance + 3_000_000,
    note: '2 lần ứng phải cộng, không ghi đè',
  })

  await addLine(page, dialog, {
    testId: 'add-advance-btn',
    amount: 500_000,
    reason: `${MARKER} ứng 3`,
    submitName: 'Thêm ứng lương',
    type: 'advance',
    expectedTotal: beforeAdvance + 3_500_000,
  })
  const after3 = await readCurrent(dialog, 'advance')
  step('advance_add_3_sum', {
    failed: after3 !== beforeAdvance + 3_500_000,
    after: after3,
    expected: beforeAdvance + 3_500_000,
  })
  await dialog.screenshot({ path: path.join(SHOT, '03-advance-3.png') })

  await addLine(page, dialog, {
    testId: 'add-penalty-btn',
    amount: 100_000,
    reason: `${MARKER} phạt lúc làm khách`,
    submitName: 'Thêm phạt',
    type: 'penalty',
    expectedTotal: beforePenalty + 100_000,
  })
  await addLine(page, dialog, {
    testId: 'add-penalty-btn',
    amount: 500_000,
    reason: `${MARKER} phạt thái độ`,
    submitName: 'Thêm phạt',
    type: 'penalty',
    expectedTotal: beforePenalty + 600_000,
  })
  const afterPen = await readCurrent(dialog, 'penalty')
  step('penalty_multi_sum', {
    failed: afterPen !== beforePenalty + 600_000,
    after: afterPen,
    expected: beforePenalty + 600_000,
  })
  await dialog.screenshot({ path: path.join(SHOT, '04-penalty-2.png') })

  const attReadonly = await dialog.locator('.salary-edit-totals__row--readonly').count()
  step('attendance_readonly', { failed: attReadonly < 1, attReadonly })

  const firstUat = dialog.locator('.salary-board-lines__item', { hasText: `${MARKER} ứng 1` }).first()
  await firstUat.getByRole('button', { name: 'Sửa' }).click()
  const editForm = dialog.locator('.salary-board-lines__form').first()
  await editForm.locator('input[inputmode="numeric"]').fill('1200000')
  await editForm.getByRole('button', { name: 'Lưu dòng' }).click()
  await waitForCurrent(page, dialog, 'advance', beforeAdvance + 3_700_000)
  const afterEdit = await readCurrent(dialog, 'advance')
  step('edit_one_line', {
    failed: afterEdit !== beforeAdvance + 3_700_000,
    after: afterEdit,
    expected: beforeAdvance + 3_700_000,
  })

  page.once('dialog', async (d) => {
    if (d.type() === 'prompt') await d.accept(`${MARKER} void`)
    else await d.accept()
  })
  const secondUat = dialog.locator('.salary-board-lines__item', { hasText: `${MARKER} ứng 2` }).first()
  await secondUat.getByRole('button', { name: 'Hủy khoản' }).click()
  await waitForCurrent(page, dialog, 'advance', beforeAdvance + 1_700_000)
  const afterVoid = await readCurrent(dialog, 'advance')
  step('void_one_line', {
    failed: afterVoid !== beforeAdvance + 1_700_000,
    after: afterVoid,
    expected: beforeAdvance + 1_700_000,
    note: 'void 2tr → còn 1.2tr + 0.5tr',
  })
  await dialog.screenshot({ path: path.join(SHOT, '05-after-edit-void.png') })

  const allowErr = /allow_signed_penalty/i.test(await dialog.innerText())
  step('no_allow_signed_penalty_error', { failed: allowErr })

  const acceptDialogs = async (d) => {
    if (d.type() === 'prompt') await d.accept(MARKER)
    else await d.accept()
  }
  page.on('dialog', acceptDialogs)
  for (let guard = 0; guard < 12; guard += 1) {
    const marked = dialog.locator('.salary-board-lines__item', { hasText: MARKER })
    if (!(await marked.count())) break
    await marked.first().getByRole('button', { name: 'Xóa' }).click()
    await page.waitForTimeout(900)
  }
  page.off('dialog', acceptDialogs)
  const leftover = await dialog.locator('.salary-board-lines__item', { hasText: MARKER }).count()
  step('cleanup', { failed: leftover > 0, leftover })
  await dialog.screenshot({ path: path.join(SHOT, '06-after-cleanup.png') })

  const restoredAdvance = await readCurrent(dialog, 'advance')
  const restoredPenalty = await readCurrent(dialog, 'penalty')
  step('restored_baseline', {
    failed: restoredAdvance !== beforeAdvance || restoredPenalty !== beforePenalty,
    restoredAdvance,
    restoredPenalty,
    beforeAdvance,
    beforePenalty,
  })
} catch (err) {
  step('browser_error', { failed: true, note: err.message })
  await page.screenshot({ path: path.join(SHOT, '99-error.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

writeFileSync(path.join(OUT, 'PREVIEW_UAT_REPORT.json'), JSON.stringify(report, null, 2))
console.log(`\n${report.ok ? 'PASS' : 'FAIL'} preview UAT — ${OUT}`)
process.exit(report.ok ? 0 : 1)
