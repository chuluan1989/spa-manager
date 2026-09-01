/**
 * Preview + UAT — Giam lương SET theo kỳ (local Vite, không deploy).
 *
 *   PREVIEW_URL=http://127.0.0.1:5174 node --env-file=.env.development.local \
 *     scripts/playwright-giam-luong-preview.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/giam-luong-preview')
const SHOT = path.join(OUT, 'shots')
mkdirSync(SHOT, { recursive: true })

const BASE = process.env.PREVIEW_URL || process.env.UAT_BASE_URL || 'http://127.0.0.1:5174'
const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'
const MARKER = `UAT-GIAM-${Date.now()}`

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
    step('open_first_employee', { note: 'UAT Cong Tac không thấy — dùng NV đầu danh sách' })
  }
  await page.waitForTimeout(2000)
}

async function openEditBoard(page) {
  await page.getByRole('button', { name: 'Sửa bảng lương' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor({ timeout: 15000 })
  return dialog
}

async function readOverview(page, label) {
  const cards = page.locator('.salary-live-dashboard__card')
  const count = await cards.count()
  for (let i = 0; i < count; i += 1) {
    const span = (await cards.nth(i).locator('span').first().innerText()).trim()
    if (span === label) {
      return parseVnd(await cards.nth(i).locator('strong').innerText())
    }
  }
  throw new Error(`Không thấy card tổng quan: ${label}`)
}

async function waitOverview(page, label, expected, timeout = 25000) {
  await page.waitForFunction(
    ({ label: wantLabel, expected: want }) => {
      const cards = [...document.querySelectorAll('.salary-live-dashboard__card')]
      const card = cards.find((el) => el.querySelector('span')?.textContent?.trim() === wantLabel)
      const n = Number(String(card?.querySelector('strong')?.textContent || '').replace(/[^\d+-]/g, ''))
      return Number.isFinite(n) && n === want
    },
    { label, expected },
    { timeout },
  )
  return expected
}

async function snapshotOthers(page) {
  return {
    bonus: await readOverview(page, 'Thưởng'),
    kpi: await readOverview(page, 'KPI'),
    penalty: await readOverview(page, 'Phạt'),
    advance: await readOverview(page, 'Ứng lương'),
  }
}

async function setReduction(page, amount, reason) {
  const dialog = await openEditBoard(page)
  await dialog.locator('[data-testid="edit-input-reduction"]').fill(String(amount))
  await dialog.locator('.salary-board-edit__reason textarea').waitFor({ timeout: 8000 })
  await dialog.locator('.salary-board-edit__reason textarea').fill(reason)
  await dialog.getByRole('button', { name: 'Lưu thưởng / KPI / Giam lương' }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 30000 })
  await page.waitForTimeout(800)
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(20000)

let originalReduction = 0
let originalNet = 0
let originalOthers = null

try {
  await loginAdmin(page)
  await openSalaryProfile(page)

  originalReduction = await readOverview(page, 'Giam lương')
  originalNet = await readOverview(page, 'Lương thực nhận')
  originalOthers = await snapshotOthers(page)
  step('baseline', {
    reduction: originalReduction,
    net: originalNet,
    ...originalOthers,
  })

  const overviewText = await page.locator('.salary-profile__overview').innerText()
  step('overview_label_giam_luong', {
    failed: overviewText.includes('Giảm lương') || !overviewText.includes('Giam lương'),
    hasGiam: overviewText.includes('Giam lương'),
    hasGiamSai: overviewText.includes('Giảm lương'),
  })

  const dialog = await openEditBoard(page)
  const heading = await dialog.locator('[data-testid="giam-luong-heading"]').innerText()
  const hasSet = await dialog.locator('[data-testid="edit-input-reduction"]').count()
  const penaltySet = await dialog.locator('[data-testid="edit-input-penalty"]').count()
  const advanceSet = await dialog.locator('[data-testid="edit-input-advance"]').count()
  const dialogText = await dialog.innerText()
  step('modal_giam_luong_set', {
    failed: heading !== 'GIAM LƯƠNG' || hasSet !== 1 || penaltySet !== 0 || advanceSet !== 0,
    heading,
    hasSet,
    penaltySet,
    advanceSet,
  })
  step('modal_not_penalty_copy', {
    failed: /khoản giữ lại/i.test(dialogText) === false,
    note: 'Hint giữ lại theo kỳ',
  })
  await dialog.screenshot({ path: path.join(SHOT, '01-modal-giam-luong.png') })
  await dialog.getByRole('button', { name: 'Đóng' }).first().click()
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 })

  await setReduction(page, 500_000, `${MARKER} SET 500000`)
  await waitOverview(page, 'Giam lương', 500_000)
  const net500 = await readOverview(page, 'Lương thực nhận')
  const others500 = await snapshotOthers(page)
  step('set_500000', {
    failed: net500 !== originalNet - (500_000 - originalReduction),
    expectedNet: originalNet - (500_000 - originalReduction),
    actualNet: net500,
    reduction: 500_000,
  })
  step('others_unchanged_after_500', {
    failed: JSON.stringify(others500) !== JSON.stringify(originalOthers),
    before: originalOthers,
    after: others500,
  })
  await page.screenshot({ path: path.join(SHOT, '02-overview-500.png'), fullPage: true })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  if (await page.locator('form.login__form').count()) {
    await loginAdmin(page)
  }
  await openSalaryProfile(page)
  const afterReload = await readOverview(page, 'Giam lương')
  const netAfterReload = await readOverview(page, 'Lương thực nhận')
  step('reload_keeps_500000', {
    failed: afterReload !== 500_000 || netAfterReload !== net500,
    reduction: afterReload,
    net: netAfterReload,
  })

  await setReduction(page, 300_000, `${MARKER} SET 300000`)
  await waitOverview(page, 'Giam lương', 300_000)
  const net300 = await readOverview(page, 'Lương thực nhận')
  step('set_300000', {
    failed: net300 !== originalNet - (300_000 - originalReduction),
    expectedNet: originalNet - (300_000 - originalReduction),
    actualNet: net300,
  })
  await page.screenshot({ path: path.join(SHOT, '03-overview-300.png'), fullPage: true })

  await setReduction(page, 0, `${MARKER} SET 0`)
  await waitOverview(page, 'Giam lương', 0)
  const net0 = await readOverview(page, 'Lương thực nhận')
  const others0 = await snapshotOthers(page)
  step('set_0_restore_net', {
    failed: net0 !== originalNet - (0 - originalReduction),
    expectedNet: originalNet - (0 - originalReduction),
    actualNet: net0,
  })
  step('others_unchanged_after_0', {
    failed: JSON.stringify(others0) !== JSON.stringify(originalOthers),
    after: others0,
  })
  await page.screenshot({ path: path.join(SHOT, '04-overview-0.png'), fullPage: true })
} catch (err) {
  step('crash', { failed: true, note: String(err?.message || err) })
  await page.screenshot({ path: path.join(SHOT, '99-error.png'), fullPage: true }).catch(() => {})
} finally {
  try {
    if (originalOthers && (await readOverview(page, 'Giam lương').catch(() => null)) !== originalReduction) {
      await setReduction(page, originalReduction, `${MARKER} restore original`)
      await waitOverview(page, 'Giam lương', originalReduction)
      step('restore_original', { reduction: originalReduction })
    }
  } catch (err) {
    step('restore_original', { failed: true, note: String(err?.message || err) })
  }
  writeFileSync(path.join(OUT, 'GIAM_LUONG_PREVIEW_UAT.json'), JSON.stringify(report, null, 2))
  await browser.close()
}

console.log(`\n${report.ok ? 'PASS' : 'FAIL'} ${report.steps.filter((s) => !s.failed).length}/${report.steps.length}`)
process.exit(report.ok ? 0 : 1)
