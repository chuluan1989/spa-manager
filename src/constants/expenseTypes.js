/** Nhóm chi phí mặc định — dùng cho form, bộ lọc và báo cáo. */

/** Chi phí cố định (mặt bằng) — không nhập lại mỗi tháng. */
export const FIXED_EXPENSE_TYPE_ID = 'mat-bang'

/** Nhóm chi phí phát sinh mặc định theo yêu cầu nghiệp vụ. */
export const DEFAULT_VARIABLE_EXPENSE_TYPES = [
  { id: 'quang-cao-facebook', label: 'Quảng cáo Facebook' },
  { id: 'quang-cao-tiktok', label: 'Quảng cáo TikTok' },
  { id: 'dien', label: 'Điện' },
  { id: 'nuoc', label: 'Nước' },
  { id: 'wifi', label: 'Wifi' },
  { id: 'shopee', label: 'Shopee' },
  { id: 'sua-chua', label: 'Sửa chữa' },
  { id: 'khac', label: 'Chi phí khác' },
]

/** Toàn bộ nhóm (cố định + phát sinh + legacy còn dùng). */
export const EXPENSE_TYPES = [
  { id: FIXED_EXPENSE_TYPE_ID, label: 'Mặt bằng', isFixed: true },
  ...DEFAULT_VARIABLE_EXPENSE_TYPES.map((item) => ({ ...item, isFixed: false })),
  { id: 'luong', label: 'Lương', isFixed: false },
  { id: 'marketing', label: 'Marketing', isFixed: false },
  { id: 'vat-tu', label: 'Vật tư', isFixed: false },
  { id: 'dien-nuoc', label: 'Điện nước', isFixed: false },
  { id: 'an-uong', label: 'Ăn uống', isFixed: false },
  { id: 'taxi', label: 'Taxi', isFixed: false },
  { id: 'van-chuyen', label: 'Vận chuyển', isFixed: false },
  { id: 'thue-phi', label: 'Thuế / phí', isFixed: false },
]

/** Tiền thuê mặt bằng mặc định theo chi nhánh (đồng/tháng). */
export const DEFAULT_BRANCH_FIXED_RENT = {
  'soc-trang': 10_000_000,
  'vinh-long': 20_000_000,
  'song-khoe-spa': 15_000_000,
  'bac-lieu': 15_000_000,
  'tra-vinh': 13_000_000,
  'tram-spa': 10_000_000,
}

/** Ánh xạ loại chi phí cũ → nhóm mới (không làm mất dữ liệu). */
export const LEGACY_EXPENSE_TYPE_MAP = {
  rent: 'mat-bang',
  salary: 'luong',
  marketing: 'marketing',
  towels: 'vat-tu',
  cosmetics: 'vat-tu',
  'massage-oil': 'vat-tu',
  medicine: 'vat-tu',
  supplies: 'vat-tu',
  laundry: 'vat-tu',
  office: 'vat-tu',
  electricity: 'dien',
  water: 'nuoc',
  internet: 'wifi',
  repair: 'sua-chua',
  other: 'khac',
  'dien-nuoc': 'dien',
}

export const EXPENSE_TYPE_MAP = Object.fromEntries(
  EXPENSE_TYPES.map((type) => [type.id, type]),
)

/** Card tổng quan — mỗi card click được để drill-down. */
export const EXPENSE_CATEGORY_CARDS = [
  { id: 'total', label: 'Tổng chi phí', typeIds: null },
  { id: 'rent', label: 'Chi phí mặt bằng', typeIds: ['mat-bang'] },
  {
    id: 'ads',
    label: 'Quảng cáo',
    typeIds: ['quang-cao-facebook', 'quang-cao-tiktok', 'marketing'],
  },
  {
    id: 'utilities',
    label: 'Điện / Nước / Wifi',
    typeIds: ['dien', 'nuoc', 'wifi', 'dien-nuoc'],
  },
  { id: 'shopee', label: 'Shopee', typeIds: ['shopee'] },
  { id: 'repair', label: 'Sửa chữa', typeIds: ['sua-chua'] },
  { id: 'taxi', label: 'Chi phí Taxi', typeIds: ['taxi'] },
  {
    id: 'operating',
    label: 'Chi phí vận hành',
    typeIds: ['an-uong', 'taxi', 'van-chuyen', 'thue-phi', 'vat-tu'],
  },
  { id: 'salary', label: 'Chi phí lương', typeIds: ['luong'] },
  { id: 'other', label: 'Chi phí khác', typeIds: ['khac'] },
]

/** Các dòng breakdown báo cáo chi nhánh (theo thứ tự hiển thị). */
export const BRANCH_PROFIT_BREAKDOWN_TYPES = [
  { id: 'mat-bang', label: 'Chi phí mặt bằng', source: 'fixed' },
  { id: 'quang-cao-facebook', label: 'Quảng cáo Facebook', source: 'variable' },
  { id: 'quang-cao-tiktok', label: 'Quảng cáo TikTok', source: 'variable' },
  { id: 'dien', label: 'Điện', source: 'variable' },
  { id: 'nuoc', label: 'Nước', source: 'variable' },
  { id: 'wifi', label: 'Wifi', source: 'variable' },
  { id: 'shopee', label: 'Shopee', source: 'variable' },
  { id: 'sua-chua', label: 'Sửa chữa', source: 'variable' },
  { id: 'khac', label: 'Chi phí khác', source: 'other' },
]

export function normalizeExpenseTypeId(typeId) {
  if (!typeId) return ''
  if (EXPENSE_TYPE_MAP[typeId]) return typeId
  return LEGACY_EXPENSE_TYPE_MAP[typeId] ?? typeId
}

export function getExpenseTypeLabel(typeId) {
  const normalized = normalizeExpenseTypeId(typeId)
  return EXPENSE_TYPE_MAP[normalized]?.label ?? typeId ?? '—'
}

export function isFixedExpenseType(typeId) {
  return normalizeExpenseTypeId(typeId) === FIXED_EXPENSE_TYPE_ID
}

export function expenseMatchesCategory(expenseType, categoryCardId) {
  const normalized = normalizeExpenseTypeId(expenseType)
  const card = EXPENSE_CATEGORY_CARDS.find((item) => item.id === categoryCardId)
  if (!card || categoryCardId === 'total') return true
  return card.typeIds?.includes(normalized) ?? false
}

export function getCategoryCardForType(typeId) {
  const normalized = normalizeExpenseTypeId(typeId)
  const match = EXPENSE_CATEGORY_CARDS.find(
    (card) => card.id !== 'total' && card.typeIds?.includes(normalized),
  )
  return match?.id ?? 'other'
}

/** Nhóm chi phí phát sinh cho form nhập (không gồm mặt bằng cố định). */
export function getVariableExpenseTypes(categories = null) {
  if (Array.isArray(categories) && categories.length > 0) {
    return categories
      .filter((item) => !item.isFixed)
      .map((item) => ({ id: item.id, label: item.label }))
  }
  return DEFAULT_VARIABLE_EXPENSE_TYPES
}
