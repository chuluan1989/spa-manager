/**
 * Preview UAT — catalog Sống Khoẻ Aug2026 (local, skipRemote).
 *
 *   VITE_SONG_KHOE_CATALOG_PREVIEW=1 npm run dev
 *   UAT_BASE_URL=http://127.0.0.1:5173 node --env-file=.env.development.local \
 *     scripts/playwright-song-khoe-catalog-preview-uat.mjs
 *
 * Không save HĐ lên server nếu có thể — chỉ đọc snapshot từ form/DOM + localStorage.
 * Không commit / không deploy / không ghi production DB.
 */
import { mkdirSync, writeFileSync, renameSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/song-khoe-price-aug2026')
const VIDEO_DIR = path.join(OUT, 'preview-uat-video')
const SHOT = path.join(OUT, 'preview-uat-shots')
mkdirSync(VIDEO_DIR, { recursive: true })
mkdirSync(SHOT, { recursive: true })

const BASE = process.env.UAT_BASE_URL || 'http://127.0.0.1:5173'
const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'

const EXPECTED = [
  { id: 'body-60', price: 190000, pct: 0, nameRe: /Massage Body 60|Body 60/i },
  { id: 'body-75', price: 230000, pct: 0, nameRe: /Massage Body 75|Body 75/i },
  { id: 'body-90', price: 250000, pct: 0, nameRe: /Massage Body 90|Body 90/i },
  { id: 'goi-sach', price: 700000 / 10, pct: 20, nameRe: /Gội đầu thư giãn|Gội sạch/i },
  { id: 'goi-duong-sinh', price: 130000, pct: 20, nameRe: /Gội đầu dưỡng sinh|Gội dưỡng sinh/i },
  { id: 'cao-mat', price: 50000, pct: 20, nameRe: /Cạo mặt/i },
  { id: 'chuyen-sau', price: 350000, pct: 10, nameRe: /Chuyên sâu/i },
  { id: 'combo-1', price: 260000, pct: 10, nameRe: /Combo 1/i },
  { id: 'combo-2', price: 280000, pct: 10, nameRe: /Combo 2/i },
  { id: 'combo-3', price: 370000, pct: 10, nameRe: /Combo 3/i },
  { id: 'foot', price: 100000, pct: 0, nameRe: /Massage chân|Foot/i },
  { id: 'co-vai-gay', price: 150000, pct: 0, nameRe: /Cổ,? Vai gáy|Cổ vai gáy/i },
  { id: 'giac-hoi', price: 50000, pct: 20, nameRe: /Giác hơi/i },
  { id: 'dap-thuoc', price: 30000, pct: 20, nameRe: /Đắp thuốc|Xông ngải/i },
  { id: 'phong-don', price: 40000, pct: 20, nameRe: /Phụ thu phòng đơn|Phòng đơn/i },
]

const report = {
  startedAt: new Date().toISOString(),
  base: BASE,
  mode: 'preview-local-skipRemote',
  productionWrite: false,
  steps: {},
  ok: true,
  video: '',
  applySummary: null,
  servicesAfterApply: [],
  filesToCommit: [
    'src/constants/defaultPriceGroups.js',
    'src/constants/catalogPriceSeeds.js',
    'src/utils/songKhoeCatalogAug2026Preview.js',
    'src/App.jsx',
    'src/utils/supabaseSync.js',
    'scripts/apply-song-khoe-prices-aug2026.mjs',
    'scripts/audit-song-khoe-prices-aug2026-readonly.mjs',
    'scripts/playwright-song-khoe-catalog-preview-uat.mjs',
    'docs/uat-evidence/song-khoe-price-aug2026/',
  ],
}

function mark(key, ok, detail = {}) {
  report.steps[key] = { ok, ...detail }
  if (!ok) report.ok = false
  console.log(`${ok ? '✓' : '✗'} ${key}`, JSON.stringify(detail))
}

function money(n) {
  return Math.round(Number(n) || 0)
}

async function loginAdmin(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.selectOption('select', 'admin')
  await page.fill('input[type="password"]', ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.getByRole('button', { name: /Hóa đơn|Tổng quan|Báo cáo/i }).first().waitFor({ timeout: 60000 })
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
})
const page = await context.newPage()

try {
  await loginAdmin(page)
  await page.waitForTimeout(2500)

  // Capture apply summary from console / re-run via evaluate storage
  const applyResult = await page.evaluate(() => {
    const BRANCH = 'song-khoe-spa'
    const catalogsKey = 'spa-manager-branch-catalogs-v2'
    const pricesKey = 'spa-manager-branch-service-prices-v2'
    const catalogs = JSON.parse(localStorage.getItem(catalogsKey) || '{}')
    const prices = JSON.parse(localStorage.getItem(pricesKey) || '{}')
    const cat = catalogs[BRANCH] || { services: [], durations: [] }
    const pr = prices[BRANCH] || {}
    const otherBranches = Object.keys(catalogs).filter((id) => id !== BRANCH)
    const otherSnapshot = {}
    for (const id of otherBranches) {
      otherSnapshot[id] = {
        durationCount: (catalogs[id]?.durations || []).length,
        priceIds: Object.keys(prices[id] || {}).sort(),
      }
    }
    return {
      durationIds: (cat.durations || []).map((d) => d.id),
      services: (cat.services || []).map((s) => ({ id: s.id, name: s.name })),
      prices: pr,
      otherSnapshot,
      durationCount: (cat.durations || []).length,
      serviceCount: (cat.services || []).length,
    }
  })

  report.localCatalogBeforeForm = applyResult

  // Expected 15 duration ids present
  const ids = new Set(applyResult.durationIds)
  const missingIds = EXPECTED.map((e) => e.id).filter((id) => !ids.has(id))
  const dupNames = (() => {
    const names = applyResult.services.map((s) => String(s.name || '').trim().toLowerCase())
    return names.filter((n, i) => names.indexOf(n) !== i)
  })()
  mark('catalog_has_15_durations', applyResult.durationCount >= 15 && missingIds.length === 0, {
    durationCount: applyResult.durationCount,
    missingIds,
    dupNames,
  })

  // Price/% checks from localStorage
  const priceChecks = EXPECTED.map((e) => {
    const p = applyResult.prices[e.id]
    return {
      id: e.id,
      ok: p && money(p.price) === e.price && money(p.commissionPercent) === e.pct,
      price: p?.price ?? null,
      pct: p?.commissionPercent ?? null,
      expectPrice: e.price,
      expectPct: e.pct,
    }
  })
  mark('catalog_prices_and_commission', priceChecks.every((c) => c.ok), { priceChecks })

  // Open invoice form
  const invNav = page.locator('.sidebar__link-label', { hasText: 'Hóa đơn' }).first()
  if (await invNav.count()) {
    await invNav.click({ force: true })
  } else {
    await page.getByRole('button', { name: /Hóa đơn/i }).first().click({ force: true })
  }
  await page.waitForTimeout(1500)
  const createTab = page.getByRole('button', { name: /Tạo hóa đơn|Thêm hóa đơn|Hóa đơn mới/i }).first()
  if (await createTab.count()) {
    await createTab.click()
    await page.waitForTimeout(800)
  }

  // Select Song Khoẻ employee by option value (song-khoe-spa-*)
  const empSelect = page.locator('label.invoice__field', { hasText: 'Nhân viên thực hiện' }).locator('select')
  await empSelect.waitFor({ timeout: 15000 })
  const empValues = await empSelect.locator('option').evaluateAll((opts) =>
    opts.map((o) => ({ value: o.value, label: o.textContent?.trim() || '' })),
  )
  const skEmp = empValues.find((o) => o.value.includes('song-khoe-spa') && o.value)
  if (!skEmp) {
    mark('form_select_song_khoe', false, { reason: 'no song-khoe employee option', empValues: empValues.slice(0, 12) })
  } else {
    await empSelect.selectOption(skEmp.value)
    await page.waitForTimeout(1000)

    const branchSelect = page.locator('label.invoice__field', { hasText: /Chi nhánh phục vụ/i }).locator('select')
    let branchOk = false
    let skBranch = null
    if (await branchSelect.count()) {
      const branchOpts = await branchSelect.locator('option').evaluateAll((opts) =>
        opts.map((o) => ({ value: o.value, label: o.textContent?.trim() || '' })),
      )
      skBranch = branchOpts.find((o) => o.value === 'song-khoe-spa' || /Sống Khoẻ/i.test(o.label))
      if (skBranch) {
        await branchSelect.selectOption(skBranch.value)
        branchOk = true
        await page.waitForTimeout(1200)
      }
      mark('form_select_song_khoe', Boolean(skEmp) && branchOk, {
        employee: skEmp,
        branchOpts,
        selectedBranch: skBranch,
      })
    } else {
      const banner = await page.locator('.branch-banner, .invoice__hint, .invoice__form-section').innerText().catch(() => '')
      branchOk = /Sống Khoẻ/i.test(banner)
      mark('form_select_song_khoe', branchOk, { employee: skEmp, banner, fixedBranch: true })
    }
  }

  await page.screenshot({ path: path.join(SHOT, '01-song-khoe-picker.png'), fullPage: true })

  // Collect visible service buttons — must be Song Khoẻ prices (190k not 189k)
  const svcButtons = page.locator('.svc-picker__single-btn')
  const btnCount = await svcButtons.count()
  const visibleServices = []
  for (let i = 0; i < btnCount; i += 1) {
    const text = (await svcButtons.nth(i).innerText()).replace(/\s+/g, ' ').trim()
    visibleServices.push(text)
  }
  const uniqueVisible = [...new Set(visibleServices)]
  const hasCombos = uniqueVisible.some((t) => /Combo 1/i.test(t))
    && uniqueVisible.some((t) => /Combo 2/i.test(t))
    && uniqueVisible.some((t) => /Combo 3/i.test(t))
  const hasDapThuoc = uniqueVisible.some((t) => /Đắp thuốc|Xông ngải/i.test(t))
  const hasNewBody60Price = uniqueVisible.some((t) => /190[\.\s]?000/.test(t))
  const hasOldStandardBody60 = uniqueVisible.some((t) => /189[\.\s]?000/.test(t))
  const hasNewLabels = uniqueVisible.some((t) => /không đá nóng|Massage Body 60/i.test(t))
  mark('form_shows_15_and_new_services', uniqueVisible.length >= 15 && hasCombos && hasDapThuoc && hasNewBody60Price && !hasOldStandardBody60, {
    visibleCount: uniqueVisible.length,
    hasCombos,
    hasDapThuoc,
    hasNewBody60Price,
    hasOldStandardBody60,
    hasNewLabels,
    sample: uniqueVisible.slice(0, 20),
  })

  async function clickServiceByName(re) {
    const btn = page.locator('.svc-picker__single-btn', { hasText: re }).first()
    if (!(await btn.count())) return false
    await btn.click()
    await page.waitForTimeout(300)
    return true
  }

  const comboSnapshots = []
  for (const item of [
    { id: 'combo-1', re: /Combo 1/i },
    { id: 'combo-2', re: /Combo 2/i },
    { id: 'combo-3', re: /Combo 3/i },
    { id: 'dap-thuoc', re: /Đắp thuốc|Xông ngải/i },
  ]) {
    comboSnapshots.push({ id: item.id, clicked: await clickServiceByName(item.re) })
  }
  await page.waitForTimeout(800)
  const detailText = await page.locator('body').innerText()
  const detailOk = /Combo 1/i.test(detailText)
    && /260[\.\s]?000/.test(detailText)
    && (/Đắp thuốc|Xông ngải/i.test(detailText))
    && /30[\.\s]?000/.test(detailText)
  // Snapshot fields via selected qty on picker (all 4 clicked)
  const qtyOk = comboSnapshots.every((c) => c.clicked)
  mark('combo_and_dap_selected_in_form', qtyOk && detailOk, {
    comboSnapshots,
    detailOk,
    detailSnippet: detailText.slice(detailText.indexOf('Chi tiết') >= 0 ? detailText.indexOf('Chi tiết') : 0, (detailText.indexOf('Chi tiết') >= 0 ? detailText.indexOf('Chi tiết') : 0) + 600),
  })

  mark('form_shows_commission_hints', /10\s*%/.test(detailText) || /Hoa hồng/i.test(detailText) || /26[\.\s]?000/.test(detailText), {
    has10pct: /10\s*%/.test(detailText),
    has20pct: /20\s*%/.test(detailText),
    hasCommissionMoney: /26[\.\s]?000|28[\.\s]?000|37[\.\s]?000|6[\.\s]?000/.test(detailText),
  })

  // Cross-branch: switch serving branch to Trạm then Sóc Trăng
  const branchSelect2 = page.locator('label.invoice__field', { hasText: /Chi nhánh phục vụ/i }).locator('select')
  let cross = { tram: false, socTrang: false, noSongKhoeLeak: true }
  if (await branchSelect2.count()) {
    const opts = await branchSelect2.locator('option').evaluateAll((os) =>
      os.map((o) => ({ value: o.value, label: o.textContent?.trim() || '' })),
    )
    const tram = opts.find((o) => o.value === 'tram-spa' || /Trạm Spa/i.test(o.label))
    if (tram) {
      await branchSelect2.selectOption(tram.value)
      await page.waitForTimeout(1200)
      const tramText = await page.locator('.svc-picker').innerText().catch(() => '')
      cross.tram = tramText.length > 0
      if (/không đá nóng/i.test(tramText) && /190[\.\s]?000/.test(tramText)) {
        cross.noSongKhoeLeak = false
      }
      await page.screenshot({ path: path.join(SHOT, '02-tram-spa.png'), fullPage: true })
    }
    const st = opts.find((o) => o.value === 'soc-trang' || /Sóc Trăng/i.test(o.label))
    if (st) {
      await branchSelect2.selectOption(st.value)
      await page.waitForTimeout(1200)
      const stText = await page.locator('.svc-picker').innerText().catch(() => '')
      cross.socTrang = stText.length > 0
      await page.screenshot({ path: path.join(SHOT, '03-soc-trang.png'), fullPage: true })
    }
  } else {
    const emp2 = page.locator('label.invoice__field', { hasText: 'Nhân viên thực hiện' }).locator('select')
    const vals = await emp2.locator('option').evaluateAll((os) =>
      os.map((o) => ({ value: o.value, label: o.textContent?.trim() || '' })),
    )
    const tramEmp = vals.find((o) => o.value.includes('tram-spa'))
    if (tramEmp) {
      await emp2.selectOption(tramEmp.value)
      await page.waitForTimeout(1200)
      cross.tram = true
      await page.screenshot({ path: path.join(SHOT, '02-tram-spa.png'), fullPage: true })
    }
    const stEmp = vals.find((o) => o.value.includes('soc-trang'))
    if (stEmp) {
      await emp2.selectOption(stEmp.value)
      await page.waitForTimeout(1200)
      cross.socTrang = true
      await page.screenshot({ path: path.join(SHOT, '03-soc-trang.png'), fullPage: true })
    }
  }
  mark('cross_branch_reload', cross.tram && cross.socTrang && cross.noSongKhoeLeak, cross)

  // Safety: other branch catalogs unchanged in localStorage shape
  const afterOther = await page.evaluate(() => {
    const catalogs = JSON.parse(localStorage.getItem('spa-manager-branch-catalogs-v2') || '{}')
    const prices = JSON.parse(localStorage.getItem('spa-manager-branch-service-prices-v2') || '{}')
    const out = {}
    for (const id of Object.keys(catalogs)) {
      if (id === 'song-khoe-spa') continue
      out[id] = {
        durationCount: (catalogs[id]?.durations || []).length,
        priceIds: Object.keys(prices[id] || {}).sort(),
      }
    }
    return out
  })
  const otherOk = Object.keys(applyResult.otherSnapshot).every((id) => {
    const a = applyResult.otherSnapshot[id]
    const b = afterOther[id]
    if (!b) return false
    return a.durationCount === b.durationCount
      && JSON.stringify(a.priceIds) === JSON.stringify(b.priceIds)
  })
  mark('other_branches_unchanged_local', otherOk, {
    before: applyResult.otherSnapshot,
    after: afterOther,
  })

  // Build services list for report from localStorage + target
  report.servicesAfterApply = EXPECTED.map((e) => {
    const p = applyResult.prices[e.id]
    const svc = applyResult.services.find((s) => s.id === `song-khoe-spa-svc-${e.id}`)
      || applyResult.services.find((s) => e.nameRe.test(s.name))
    return {
      id: e.id,
      name: svc?.name || '(missing name)',
      price: p?.price ?? null,
      commissionPercent: p?.commissionPercent ?? null,
    }
  })

  // Do NOT save invoice — cancel if possible
  const cancel = page.getByRole('button', { name: /Hủy|Đóng|Huỷ/i }).first()
  if (await cancel.count()) await cancel.click().catch(() => {})

} catch (err) {
  report.ok = false
  report.error = err?.message || String(err)
  console.error(err)
  await page.screenshot({ path: path.join(SHOT, 'error.png'), fullPage: true }).catch(() => {})
} finally {
  const videoPath = await page.video()?.path()
  await context.close()
  await browser.close()
  if (videoPath && existsSync(videoPath)) {
    const dest = path.join(VIDEO_DIR, `song-khoe-preview-uat-${Date.now()}.webm`)
    renameSync(videoPath, dest)
    report.video = dest
  } else {
    const files = existsSync(VIDEO_DIR) ? readdirSync(VIDEO_DIR) : []
    report.video = files.map((f) => path.join(VIDEO_DIR, f)).join(', ')
  }
  report.finishedAt = new Date().toISOString()
  report.checklist = {
    catalog_15: report.steps.catalog_has_15_durations?.ok,
    prices_pct: report.steps.catalog_prices_and_commission?.ok,
    form_song_khoe: report.steps.form_select_song_khoe?.ok,
    form_services: report.steps.form_shows_15_and_new_services?.ok,
    combos: report.steps.combo_and_dap_selected_in_form?.ok,
    cross_branch: report.steps.cross_branch_reload?.ok,
    other_branches: report.steps.other_branches_unchanged_local?.ok,
  }
  report.ok = Object.values(report.checklist).every(Boolean)
  writeFileSync(path.join(OUT, 'SONG_KHOE_CATALOG_PREVIEW_UAT.json'), JSON.stringify(report, null, 2))
  console.log('\nPASS:', report.ok)
  console.log('Video:', report.video)
  console.log('Checklist:', JSON.stringify(report.checklist, null, 2))
  process.exit(report.ok ? 0 : 1)
}
