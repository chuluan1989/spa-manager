import {
  KPI_ADVANCED_TOKEN_KHOE,
  KPI_ADVANCED_TOKEN_TRAM,
  KPI_GROUPS,
  KPI_SCOPE_BRANCH_IDS,
  isKpiExcludedBranch,
  resolveKpiAdvancedToken,
} from '../constants/kpiPolicy'

export const KPI_MAIN_TOKENS = ['body-60', 'body-75', 'body-90', 'co-vai-gay', 'foot']
/** MAIN 90 phút theo catalog 6 CN (durationMinutes === 90, duration_id). Không gồm Combo / CS / Thái. */
export const KPI_MAIN_90_TOKENS = ['body-90']
export const KPI_COMBO_TOKENS = ['combo-1', 'combo-2', 'combo-3']
export const KPI_ADVANCED_TOKENS = ['chuyen-sau']
export const KPI_ADDON_TOKENS = [
  'goi-sach',
  'goi-duong-sinh',
  'giac-hoi',
  'cao-mat',
  'dap-thuoc',
  'xong-hoi',
  'phong-don',
]

const TOKEN_TO_GROUP = {
  ...Object.fromEntries(KPI_MAIN_TOKENS.map((t) => [t, KPI_GROUPS.MAIN])),
  ...Object.fromEntries(KPI_COMBO_TOKENS.map((t) => [t, KPI_GROUPS.COMBO])),
  ...Object.fromEntries(KPI_ADVANCED_TOKENS.map((t) => [t, KPI_GROUPS.ADVANCED])),
  ...Object.fromEntries(KPI_ADDON_TOKENS.map((t) => [t, KPI_GROUPS.ADDON])),
}

export const ALL_KPI_SERVICE_TOKENS = Object.keys(TOKEN_TO_GROUP)

function normName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
}

/**
 * Lấy duration token ổn định từ id HĐ/catalog.
 * body-60 và {branch}-svc-body-60 → body-60
 */
const LEGACY_AMBIGUOUS_TOKENS = new Set(['body'])

function isKnownKpiToken(token) {
  return Boolean(TOKEN_TO_GROUP[token]) || token === KPI_ADVANCED_TOKEN_TRAM
}

export function normalizeKpiServiceToken(rawId) {
  const id = String(rawId ?? '').trim().toLowerCase()
  if (!id) return ''
  if (id.startsWith('gl-') || id.includes('gia-lai')) return ''
  if (isKnownKpiToken(id)) return id
  if (id.includes('-svc-')) {
    const tail = id.split('-svc-').pop()
    if (isKnownKpiToken(tail)) return tail
    if (LEGACY_AMBIGUOUS_TOKENS.has(tail)) return ''
  }
  for (const token of [...ALL_KPI_SERVICE_TOKENS, KPI_ADVANCED_TOKEN_TRAM]) {
    if (id === token || id.endsWith(`-${token}`)) return token
  }
  return ''
}

function isLegacyAmbiguousServiceId(rawId) {
  const id = String(rawId ?? '').trim().toLowerCase()
  if (LEGACY_AMBIGUOUS_TOKENS.has(id)) return true
  if (id.includes('-svc-') && LEGACY_AMBIGUOUS_TOKENS.has(id.split('-svc-').pop())) return true
  return false
}

function applyHomeAdvancedMapping(classified, homeBranchId) {
  const token = classified?.token || ''
  if (token !== KPI_ADVANCED_TOKEN_KHOE && token !== KPI_ADVANCED_TOKEN_TRAM) {
    return classified
  }
  const advancedToken = resolveKpiAdvancedToken(homeBranchId)
  if (token === advancedToken) {
    return { ...classified, group: KPI_GROUPS.ADVANCED }
  }
  return {
    ...classified,
    group: KPI_GROUPS.UNMAPPED,
    reason: 'advanced-home-mismatch',
  }
}

export function classifyKpiServiceLine(line = {}, options = {}) {
  const homeBranchId = options.homeBranchId || line.homeBranchId || ''
  const rawId = line.serviceId || line.id || line.durationId || ''
  const name = line.serviceName || line.name || ''
  const tokenFromId = normalizeKpiServiceToken(rawId)
  if (tokenFromId) {
    return applyHomeAdvancedMapping({
      group: TOKEN_TO_GROUP[tokenFromId] || KPI_GROUPS.UNMAPPED,
      token: tokenFromId,
      source: 'serviceId',
    }, homeBranchId)
  }
  const allowName = !String(rawId).trim() || isLegacyAmbiguousServiceId(rawId)
  if (allowName) {
    const tokenFromName = classifyByNameFallback(name)
    if (tokenFromName) {
      return applyHomeAdvancedMapping({
        group: TOKEN_TO_GROUP[tokenFromName] || KPI_GROUPS.UNMAPPED,
        token: tokenFromName,
        source: String(rawId).trim() ? 'legacyId+name' : 'nameFallback',
      }, homeBranchId)
    }
  }
  return {
    group: KPI_GROUPS.UNMAPPED,
    token: '',
    source: String(rawId).trim() ? 'unmapped-id' : 'unmapped',
    rawId,
    name,
  }
}

function classifyByNameFallback(name) {
  const hay = ` ${normName(name)} `
  if (/\bcombo 1\b|\bcombo-1\b/.test(hay)) return 'combo-1'
  if (/\bcombo 2\b|\bcombo-2\b/.test(hay)) return 'combo-2'
  if (/\bcombo 3\b|\bcombo-3\b/.test(hay)) return 'combo-3'
  if (/\bmassage thai\b/.test(hay)) return KPI_ADVANCED_TOKEN_TRAM
  if (/\bchuyen sau\b/.test(hay) && !/\bgoi\b/.test(hay)) return KPI_ADVANCED_TOKEN_KHOE
  if (/\bbody 60\b|\bmassage body 60/.test(hay)) return 'body-60'
  if (/\bbody 75\b|\bmassage body 75/.test(hay)) return 'body-75'
  if (/\bbody 90\b|\bmassage body 90/.test(hay)) return 'body-90'
  if (/\bco vai gay\b/.test(hay)) return 'co-vai-gay'
  if (/\bfoot\b|\bmassage chan\b/.test(hay)) return 'foot'
  if (/\bgoi sach\b|\bgoi dau thu gian\b/.test(hay)) return 'goi-sach'
  if (/\bgoi duong\b/.test(hay)) return 'goi-duong-sinh'
  if (/\bgiac hoi\b/.test(hay)) return 'giac-hoi'
  if (/\bcao mat\b|\bcao gio\b/.test(hay)) return 'cao-mat'
  if (/\bdap thuoc\b/.test(hay)) return 'dap-thuoc'
  if (/\bxong hoi\b/.test(hay)) return 'xong-hoi'
  if (/\bphong don\b|\bphu thu phong\b/.test(hay)) return 'phong-don'
  if (/\bmassage body\b/.test(hay) && !/\bcombo\b/.test(hay) && !/\bchuyen sau\b/.test(hay)) {
    return 'body-60'
  }
  if (hay.trim() === 'body') return 'body-60'
  return ''
}

export function classifyCatalogDuration(durationId, serviceName = '') {
  return classifyKpiServiceLine({ id: durationId, name: serviceName })
}

export function isKpiMain90Line(line = {}, classified = null) {
  const result = classified || classifyKpiServiceLine(line)
  if (result.group !== KPI_GROUPS.MAIN) return false
  const minutes = Number(line?.durationMinutes ?? line?.duration_minutes)
  if (minutes === 90) return true
  return KPI_MAIN_90_TOKENS.includes(result.token)
}

/**
 * Audit duration catalog: MAIN + durationMinutes === 90.
 * Không dùng tên mơ hồ. Combo / Chuyên sâu / Massage Thái bị loại vì không thuộc MAIN.
 */
export function auditMain90CatalogDurations(rows = []) {
  const main90 = []
  const other90 = []
  for (const row of rows) {
    const durationId = row.durationId || row.duration_id || row.id
    const minutes = Number(row.durationMinutes ?? row.duration_minutes)
    if (minutes !== 90) continue
    const classified = classifyCatalogDuration(durationId, row.serviceName || row.name)
    const item = {
      branchId: row.branchId || row.branch_id,
      durationId,
      durationMinutes: minutes,
      group: classified.group,
      token: classified.token,
    }
    if (classified.group === KPI_GROUPS.MAIN) main90.push(item)
    else other90.push(item)
  }
  const tokens = [...new Set(main90.map((r) => r.token).filter(Boolean))].sort()
  return { main90, other90, tokens }
}

/**
 * Audit catalog 6 CN. Gia Lai không đưa vào mẫu.
 */
export function auditKpiCatalogRows(rows = []) {
  const scoped = rows.filter((row) => {
    const branchId = row.branchId || row.branch_id
    if (isKpiExcludedBranch(branchId)) return false
    return KPI_SCOPE_BRANCH_IDS.includes(branchId)
  })
  const classified = scoped.map((row) => {
    const durationId = row.durationId || row.duration_id || row.id
    const result = classifyCatalogDuration(durationId, row.serviceName || row.name)
    return { ...row, durationId, ...result }
  })
  const unmapped = classified.filter((row) => row.group === KPI_GROUPS.UNMAPPED)
  return {
    total: classified.length,
    unmappedCount: unmapped.length,
    unmapped,
    classified,
  }
}
