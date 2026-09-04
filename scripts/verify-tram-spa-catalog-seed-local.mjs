import assert from 'node:assert/strict'
import { buildTramSpaBranchCatalogPackage } from '../src/utils/branchCatalogSeeds.js'
import { flattenCatalog } from '../src/utils/serviceCatalog.js'
import { TRAM_SPA_SERVICE_CATALOG } from '../src/constants/tramSpaServiceCatalog.js'
import { resolveOfficialCatalogCommissionPercent } from '../src/utils/officialCommissionRules.js'
import { calculateCommissionAmount } from '../src/utils/commissionPolicyEngine.js'

const prices = buildTramSpaBranchCatalogPackage().prices
assert.equal(prices['body-60'].price, 180000)
assert.equal(prices['body-60'].commissionPercent, 0)
assert.equal(prices['body-90'].price, 220000)
assert.equal(prices['body-90'].commissionPercent, 10)
assert.equal(prices.foot.price, 180000)
assert.equal(prices['co-vai-gay'].price, 180000)
assert.equal(prices['massage-thai'].price, 350000)
assert.equal(prices['massage-thai'].commissionPercent, 20)
assert.equal(prices['combo-1'].price, 240000)
assert.equal(prices['combo-2'].price, 280000)
assert.equal(prices['goi-duong-sinh'].price, 130000)
assert.equal(prices['goi-sach'].price, 60000)

assert.equal(resolveOfficialCatalogCommissionPercent('tram-spa', 'body-90', 'Body').percent, 10)
assert.equal(resolveOfficialCatalogCommissionPercent('tram-spa', 'massage-thai', 'Massage Thái').percent, 20)
assert.equal(resolveOfficialCatalogCommissionPercent('song-khoe-spa', 'body-90', 'Body').percent, 10)
assert.equal(resolveOfficialCatalogCommissionPercent('soc-trang', 'chuyen-sau', 'Chuyên sâu').percent, 20)
assert.equal(calculateCommissionAmount(220000, 10), 22000)
assert.equal(calculateCommissionAmount(350000, 20), 70000)

const flat = flattenCatalog(TRAM_SPA_SERVICE_CATALOG)
assert.equal(flat.find((s) => s.id === 'massage-thai')?.name, 'Massage Thái')
assert.equal(flat.find((s) => s.id === 'combo-1')?.name, "Combo Body 60' + Gội 30'")
assert.equal(flat.find((s) => s.id === 'body-90')?.commissionPercent, 10)
console.log('LOCAL CATALOG SEED PASS')
