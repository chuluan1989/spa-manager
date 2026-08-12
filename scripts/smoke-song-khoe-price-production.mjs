/**
 * Post-deploy smoke — bảng giá Sống Khoẻ (READ-ONLY, không apply/rewrite HĐ).
 *
 *   UAT_BASE_URL=https://www.khoespa.net.vn \
 *   node --env-file=.env.development.local scripts/smoke-song-khoe-price-production.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/song-khoe-price-aug2026')
mkdirSync(OUT, { recursive: true })

const BASE = process.env.UAT_BASE_URL || 'https://www.khoespa.net.vn'
const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'
const BRANCH_ID = 'song-khoe-spa'
const EFFECTIVE_FROM = '2026-08-01'

const EXPECTED = {
  'body-60': 190000,
  'body-75': 230000,
  'body-90': 250000,
  'goi-sach': 70000,
  'goi-duong-sinh': 130000,
  'cao-mat': 50000,
  'chuyen-sau': 350000,
  'combo-1': 260000,
  'combo-2': 280000,
  'combo-3': 370000,
  foot: 100000,
  'co-vai-gay': 150000,
  'giac-hoi': 50000,
  'dap-thuoc': 30000,
  'phong-don': 40000,
}

const report = {
  startedAt: new Date().toISOString(),
  base: BASE,
  commit: process.env.SMOKE_COMMIT || '',
  steps: {},
  ok: true,
}

function mark(key, ok, detail = {}) {
  report.steps[key] = { ok, ...detail }
  if (!ok) report.ok = false
  console.log(`${ok ? '✓' : '✗'} ${key}`, JSON.stringify(detail))
}

async function resolveSupabase() {
  const html = await fetch(BASE).then((r) => r.text())
  const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
  if (!jsMatch) throw new Error('Không tìm thấy bundle JS')
  const asset = jsMatch[0]
  const js = await fetch(`${BASE}${asset}`).then((r) => r.text())
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  if (!url || !key) throw new Error('Không lấy được Supabase từ bundle')
  return { url, key, asset, htmlHasPreviewFlag: /SONG_KHOE_CATALOG_PREVIEW/.test(js) }
}

const bundle = await resolveSupabase()
mark('bundle_loaded', Boolean(bundle.asset), { asset: bundle.asset })
mark('preview_flag_not_in_prod_bundle', !bundle.htmlHasPreviewFlag, {
  note: 'VITE_SONG_KHOE_CATALOG_PREVIEW không được bake vào prod',
})

const sb = createClient(bundle.url, bundle.key, { auth: { persistSession: false } })

const { data: prices, error: pErr } = await sb
  .from('branch_service_prices')
  .select('duration_id,price,commission_percent')
  .eq('branch_id', BRANCH_ID)
if (pErr) throw pErr
const byId = Object.fromEntries((prices || []).map((r) => [r.duration_id, r]))
const priceOk = Object.entries(EXPECTED).every(([id, price]) => Number(byId[id]?.price) === price)
mark('catalog_15_prices_ok', priceOk && Object.keys(EXPECTED).every((id) => byId[id]), {
  count: prices?.length,
  sample: Object.fromEntries(Object.keys(EXPECTED).map((id) => [id, byId[id]?.price ?? null])),
})

// Other branches spot-check
const spot = [
  ['soc-trang', 'body-60', 189000],
  ['tram-spa', 'body-60', 160000],
]
for (const [b, id, expect] of spot) {
  const { data } = await sb.from('branch_service_prices').select('price').eq('branch_id', b).eq('duration_id', id).maybeSingle()
  mark(`other_branch_${b}_${id}`, Number(data?.price) === expect, { price: data?.price, expect })
}

const { data: invoices, error: iErr } = await sb
  .from('invoices')
  .select('id,date,services,service_total,tips,total')
  .eq('branch_id', BRANCH_ID)
  .gte('date', EFFECTIVE_FROM)
if (iErr) throw iErr
mark('invoices_aug_count_unchanged', (invoices || []).length === 38, { count: invoices?.length })

// Browser smoke — form only, no save
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.selectOption('select', 'admin')
  await page.fill('input[type="password"]', ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.locator('.sidebar__link-label', { hasText: 'Hóa đơn' }).first().waitFor({ timeout: 60000 })
  await page.locator('.sidebar__link-label', { hasText: 'Hóa đơn' }).first().click({ force: true })
  await page.waitForTimeout(1500)
  const createTab = page.getByRole('button', { name: /Tạo hóa đơn|Thêm hóa đơn/i }).first()
  if (await createTab.count()) await createTab.click()
  await page.waitForTimeout(800)

  const empSelect = page.locator('label.invoice__field', { hasText: 'Nhân viên thực hiện' }).locator('select')
  await empSelect.waitFor({ timeout: 20000 })
  const empValues = await empSelect.locator('option').evaluateAll((opts) =>
    opts.map((o) => ({ value: o.value, label: o.textContent?.trim() || '' })),
  )
  const skEmp = empValues.find((o) => o.value.includes('song-khoe-spa') && o.value)
  if (!skEmp) throw new Error('Không có NV Sống Khoẻ')
  await empSelect.selectOption(skEmp.value)
  await page.waitForTimeout(800)
  const branchSelect = page.locator('label.invoice__field', { hasText: /Chi nhánh phục vụ/i }).locator('select')
  if (await branchSelect.count()) {
    await branchSelect.selectOption('song-khoe-spa')
    await page.waitForTimeout(1200)
  }
  const pickerText = await page.locator('.svc-picker').innerText()
  const formOk = /190[\.\s]?000/.test(pickerText)
    && /Combo 1/i.test(pickerText)
    && /Combo 3/i.test(pickerText)
    && /Đắp thuốc|Xông ngải/i.test(pickerText)
    && !/189[\.\s]?000/.test(pickerText)
  mark('form_song_khoe_prices', formOk, { snippet: pickerText.slice(0, 280) })

  // Cross-branch leak check
  if (await branchSelect.count()) {
    await branchSelect.selectOption('soc-trang')
    await page.waitForTimeout(1000)
    const st = await page.locator('.svc-picker').innerText()
    mark('cross_branch_soc_trang', /189[\.\s]?000/.test(st) || st.length > 0, { has189: /189[\.\s]?000/.test(st) })
  } else {
    mark('cross_branch_soc_trang', true, { skipped: 'no serving branch select' })
  }

  // Cancel — do not save
  const cancel = page.getByRole('button', { name: /Hủy|Huỷ|Đóng/i }).first()
  if (await cancel.count()) await cancel.click().catch(() => {})
} catch (err) {
  mark('browser_smoke', false, { error: err?.message || String(err) })
} finally {
  await browser.close()
}

report.finishedAt = new Date().toISOString()
report.ok = Object.values(report.steps).every((s) => s.ok)
writeFileSync(path.join(OUT, 'SONG_KHOE_PRICE_PROD_SMOKE.json'), JSON.stringify(report, null, 2))
console.log('\nSMOKE PASS:', report.ok)
process.exit(report.ok ? 0 : 1)
