/**
 * UAT matrix — công thức HH theo nhóm chi nhánh (self-contained, không import src ESM).
 * Run: node scripts/verify-commission-policy-matrix.mjs
 */

const COMMISSION_POLICY_TYPE = { FLAT: 'flat', TIERED: 'tiered' }
const FLAT_40 = ['gia-lai-1', 'gia-lai-2']
const FLAT_20 = ['tra-vinh', 'vinh-long']
const BAC_LIEU = ['bac-lieu']
const TIERED = ['soc-trang', 'tram-spa', 'song-khoe-spa']

const ZERO_IDS = ['body-60', 'body-75', 'body-90', 'foot', 'co-vai-gay']
const ZERO_NAMES = ['body 60', 'body 75', 'body 90', 'foot', 'cvg', 'co vai gay', 'cổ vai gáy']
const TEN_IDS = ['chuyen-sau', 'combo-1', 'combo-2', 'combo-3']
const TEN_NAMES = ['chuyen sau', 'chuyên sâu', 'combo 1', 'combo 2', 'combo 3']

function norm(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
}

function matchesServiceToken(serviceKey, token) {
  if (!serviceKey || !token) return false
  if (serviceKey === token) return true
  if (serviceKey.includes(token) || token.includes(serviceKey)) return true
  return false
}

function serviceMatchesGroup(service, group) {
  const serviceId = norm(service?.id)
  const serviceName = norm(service?.name)
  for (const id of group.serviceIds ?? []) {
    const token = norm(id)
    if (serviceId === token || serviceId.endsWith(`-${token}`)) return true
  }
  for (const name of group.serviceNames ?? []) {
    if (matchesServiceToken(serviceName, norm(name))) return true
  }
  return false
}

function buildPolicy(branchId) {
  if (FLAT_40.includes(branchId)) {
    return { policyType: COMMISSION_POLICY_TYPE.FLAT, flatRate: 40, defaultRate: 40, groups: [] }
  }
  if (BAC_LIEU.includes(branchId)) {
    return {
      policyType: COMMISSION_POLICY_TYPE.TIERED,
      flatRate: null,
      defaultRate: 20,
      groups: [{
        id: 'rate-30-chuyen-sau',
        rate: 30,
        serviceIds: ['chuyen-sau'],
        serviceNames: ['chuyen sau', 'chuyên sâu'],
      }],
    }
  }
  if (FLAT_20.includes(branchId)) {
    return { policyType: COMMISSION_POLICY_TYPE.FLAT, flatRate: 20, defaultRate: 20, groups: [] }
  }
  if (TIERED.includes(branchId)) {
    return {
      policyType: COMMISSION_POLICY_TYPE.TIERED,
      flatRate: null,
      defaultRate: 20,
      groups: [
        { rate: 0, serviceIds: [...ZERO_IDS], serviceNames: [...ZERO_NAMES] },
        { rate: 10, serviceIds: [...TEN_IDS], serviceNames: [...TEN_NAMES] },
      ],
    }
  }
  return { policyType: COMMISSION_POLICY_TYPE.FLAT, flatRate: 20, defaultRate: 20, groups: [] }
}

function resolve(branchId, service) {
  const policy = buildPolicy(branchId)
  if (policy.policyType === COMMISSION_POLICY_TYPE.FLAT) {
    return Number(policy.flatRate ?? policy.defaultRate ?? 0)
  }
  for (const group of policy.groups ?? []) {
    if (serviceMatchesGroup(service, group)) return Number(group.rate ?? 0)
  }
  return Number(policy.defaultRate ?? 0)
}

/** Simulate invoice.js: when branchId set → policy wins (ignore catalog %). */
function resolveLine(branchId, service) {
  if (branchId) return resolve(branchId, { id: service.id || service.serviceId, name: service.name || service.serviceName })
  if (Number.isFinite(service?.commissionPercent)) return Number(service.commissionPercent)
  return 0
}

const SERVICES = [
  { id: 'body-60', name: 'Body 60' },
  { id: 'body-75', name: 'Body 75 75\'' },
  { id: 'body-90', name: 'Massage body 90 phút' },
  { id: 'co-vai-gay', name: 'Cổ vai gáy' },
  { id: 'foot', name: 'Foot' },
  { id: 'combo-1', name: 'Combo 1' },
  { id: 'combo-2', name: 'Combo 2' },
  { id: 'combo-3', name: 'Combo 3' },
  { id: 'chuyen-sau', name: 'Chuyên sâu' },
  { id: 'goi-sach', name: 'Gội sạch' },
  { id: 'dap-thuoc', name: 'Đắp thuốc' },
]

const EXPECTED = {
  'tram-spa': { 'body-60': 0, 'body-75': 0, 'body-90': 0, 'co-vai-gay': 0, foot: 0, 'combo-1': 10, 'combo-2': 10, 'combo-3': 10, 'chuyen-sau': 10, 'goi-sach': 20, 'dap-thuoc': 20 },
  'soc-trang': { 'body-60': 0, 'body-75': 0, 'body-90': 0, 'co-vai-gay': 0, foot: 0, 'combo-1': 10, 'combo-2': 10, 'combo-3': 10, 'chuyen-sau': 10, 'goi-sach': 20, 'dap-thuoc': 20 },
  'song-khoe-spa': { 'body-60': 0, 'body-75': 0, 'body-90': 0, 'co-vai-gay': 0, foot: 0, 'combo-1': 10, 'combo-2': 10, 'combo-3': 10, 'chuyen-sau': 10, 'goi-sach': 20, 'dap-thuoc': 20 },
  'tra-vinh': { 'body-60': 20, 'body-75': 20, 'body-90': 20, 'co-vai-gay': 20, foot: 20, 'combo-1': 20, 'combo-2': 20, 'combo-3': 20, 'chuyen-sau': 20, 'goi-sach': 20, 'dap-thuoc': 20 },
  'vinh-long': { 'body-60': 20, 'body-75': 20, 'body-90': 20, 'co-vai-gay': 20, foot: 20, 'combo-1': 20, 'combo-2': 20, 'combo-3': 20, 'chuyen-sau': 20, 'goi-sach': 20, 'dap-thuoc': 20 },
  'bac-lieu': { 'body-60': 20, 'body-75': 20, 'body-90': 20, 'co-vai-gay': 20, foot: 20, 'combo-1': 20, 'combo-2': 20, 'combo-3': 20, 'chuyen-sau': 30, 'goi-sach': 20, 'dap-thuoc': 20 },
}

let failed = 0
for (const [branchId, rates] of Object.entries(EXPECTED)) {
  console.log(`\n=== ${branchId} ===`)
  for (const service of SERVICES) {
    // Trap: catalog % sai cố ý — vẫn phải ra đúng policy
    const withBadCatalog = { ...service, commissionPercent: 99 }
    const got = resolveLine(branchId, withBadCatalog)
    const exp = rates[service.id]
    const ok = got === exp
    if (!ok) failed += 1
    console.log(`${ok ? '✓' : '✗'} ${service.id}: ${got}% (expected ${exp}%)`)
  }
}

// Name variants
const variants = [
  ['soc-trang', { id: 'body-75', name: 'Body 75p' }, 0],
  ['soc-trang', { id: 'x', name: 'Massage body 60 phút' }, 0],
  ['bac-lieu', { id: 'chuyen-sau', name: 'Chuyên sâu' }, 30],
  ['tra-vinh', { id: 'chuyen-sau', name: 'Chuyên sâu' }, 20],
]
for (const [branchId, service, exp] of variants) {
  const got = resolveLine(branchId, service)
  const ok = got === exp
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} variant ${branchId} ${service.name || service.id}: ${got}% (expected ${exp}%)`)
}

if (failed > 0) {
  console.error(`\nFAILED: ${failed}`)
  process.exit(1)
}
console.log(`\nAll matrix checks passed (${Object.keys(EXPECTED).length} branches × ${SERVICES.length} services).`)
