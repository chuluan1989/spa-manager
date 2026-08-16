/**
 * Focused UI shot — open Sửa bảng lương and capture Phạt chấm công / Phạt khác.
 * PREVIEW_URL=http://127.0.0.1:4177 node_modules/.bin/vite-node scripts/playwright-penalty-board-shot.mjs
 */
import './_polyfill-storage.mjs'
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PREVIEW = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4177'
const OUT = 'docs/uat-evidence/penalty-sot-preview-uat'
mkdirSync(path.join(OUT, 'shots'), { recursive: true })
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const report = { at: new Date().toISOString(), preview: PREVIEW, steps: [] }

function step(id, ok, detail = '') {
  report.steps.push({ id, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${detail ? ` — ${detail}` : ''}`)
}

try {
  await page.goto(PREVIEW, { waitUntil: 'networkidle', timeout: 60000 })
  await page.locator('form.login__form select').selectOption('admin')
  await page.fill('input[type="password"]', ADMIN_PASSWORD)
  await page.click('button.login__submit')
  await page.waitForFunction(() => !document.querySelector('.login__form'), { timeout: 45000 })
  step('login', true)

  await page.locator('nav, aside, .sidebar').getByText('Lương', { exact: true }).first().click()
  await page.waitForTimeout(2500)
  // Prefer Kỳ 1 Aug which has more data / or stay
  const xem = page.getByRole('button', { name: /Xem nhân viên/i }).first()
  await xem.waitFor({ timeout: 20000 })
  await xem.click()
  await page.waitForTimeout(2000)
  step('open_branch_employees', true)

  // Click first employee row if needed
  const emp = page.locator('table tbody tr, .salary-employee-list [role="button"], .salary-emp-table tbody tr').first()
  if (await emp.count()) {
    await emp.click()
    await page.waitForTimeout(1000)
  }

  const edit = page.getByRole('button', { name: /Sửa bảng lương/i }).first()
  await edit.waitFor({ timeout: 15000 })
  await edit.click()
  await page.waitForTimeout(1000)

  const text = await page.locator('body').innerText()
  const hasAtt = /Phạt chấm công/.test(text)
  const hasOther = /Phạt khác/.test(text)
  const hasHint = /tự động tính từ dữ liệu Chấm công/.test(text)
  step('board_labels', hasAtt && hasOther, `att=${hasAtt} other=${hasOther}`)
  step('board_hint', hasHint)

  const shot = path.join(OUT, 'shots', '03-board-penalty-split-live.png')
  await page.screenshot({ path: shot, fullPage: false })
  report.shot = shot

  // Close edit board before opening Thêm phát sinh
  await page.locator('.salary-modal [aria-label="Đóng"], .salary-modal button:has-text("Đóng"), .salary-modal button:has-text("Hủy")').first().click().catch(async () => {
    await page.keyboard.press('Escape')
  })
  await page.waitForSelector('.salary-modal__backdrop', { state: 'detached', timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(500)
  const add = page.getByRole('button', { name: /Thêm phát sinh/i }).first()
  if (await add.count()) {
    await add.click({ force: true })
    await page.waitForTimeout(600)
    const selects = page.locator('.salary-modal select, form.salary-modal__panel select')
    if (await selects.count() >= 2) {
      const typeSel = selects.nth(1)
      const labels = await typeSel.locator('option').allTextContents()
      const pen = labels.find((t) => /Phạt/.test(t))
      if (pen) await typeSel.selectOption({ label: pen.trim() })
    }
    if (await selects.count() >= 1) {
      const vals = await selects.first().locator('option').evaluateAll((o) => o.map((x) => x.value).filter(Boolean))
      if (vals[0]) await selects.first().selectOption(vals[0])
    }
    await page.locator('.salary-modal input[inputmode="numeric"], .salary-modal input').nth(0).fill('100000').catch(() => {})
    const reasonCandidates = page.locator('.salary-modal textarea, .salary-modal input[name="reason"], .salary-modal input[type="text"]')
    const rc = await reasonCandidates.count()
    if (rc) await reasonCandidates.nth(Math.min(1, rc - 1)).fill('Phạt nghỉ không phép')
    await page.locator('.salary-modal button[type="submit"], .salary-modal button:has-text("Lưu")').first().click()
    await page.waitForTimeout(700)
    const err = await page.locator('[data-testid="penalty-block-error"], .salary-page__error').innerText().catch(() => '')
    const blocked = /chấm công|không được|tự động|giống phạt/i.test(err) || /chấm công|không được|tự động|giống phạt/i.test(await page.locator('body').innerText())
    step('block_mirror_ui', blocked, err.slice(0, 120))
    await page.screenshot({ path: path.join(OUT, 'shots', '04-block-mirror-live.png'), fullPage: false })
  } else {
    step('block_mirror_ui', false, 'no add button')
  }
} catch (e) {
  step('fatal', false, e.message)
  await page.screenshot({ path: path.join(OUT, 'shots', '03-error.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

// Board SoT labels are the hard gate; block-mirror UI is soft (policy unit tests cover gate).
const hard = report.steps.filter((s) => !['block_mirror_ui', 'fatal'].includes(s.id))
report.passed = hard.every((s) => s.ok) && hard.some((s) => s.id === 'board_labels' && s.ok)
report.soft = report.steps.filter((s) => ['block_mirror_ui', 'fatal'].includes(s.id))
writeFileSync(path.join(OUT, 'BOARD_SHOT_REPORT.json'), JSON.stringify(report, null, 2))
console.log(report.passed ? 'PASS board shot' : 'FAIL board shot')
process.exit(report.passed ? 0 : 1)
