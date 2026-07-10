/** Nhóm chi phí mặc định — dùng cho form, bộ lọc và báo cáo. */
export const EXPENSE_TYPES = [
  { id: 'mat-bang', label: 'Mặt bằng' },
  { id: 'luong', label: 'Lương' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'vat-tu', label: 'Vật tư' },
  { id: 'dien-nuoc', label: 'Điện nước' },
  { id: 'sua-chua', label: 'Sửa chữa' },
  { id: 'an-uong', label: 'Ăn uống' },
  { id: 'taxi', label: 'Taxi' },
  { id: 'van-chuyen', label: 'Vận chuyển' },
  { id: 'thue-phi', label: 'Thuế / phí' },
  { id: 'khac', label: 'Khác' },
]

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
  electricity: 'dien-nuoc',
  water: 'dien-nuoc',
  internet: 'dien-nuoc',
  repair: 'sua-chua',
  other: 'khac',
}

export const EXPENSE_TYPE_MAP = Object.fromEntries(
  EXPENSE_TYPES.map((type) => [type.id, type]),
)

/** Card tổng quan — mỗi card click được để drill-down. */
export const EXPENSE_CATEGORY_CARDS = [
  { id: 'total', label: 'Tổng chi phí', typeIds: null },
  {
    id: 'operating',
    label: 'Chi phí vận hành',
    typeIds: ['dien-nuoc', 'sua-chua', 'an-uong', 'taxi', 'van-chuyen', 'thue-phi'],
  },
  { id: 'taxi', label: 'Chi phí Taxi', typeIds: ['taxi'] },
  { id: 'marketing', label: 'Chi phí marketing', typeIds: ['marketing'] },
  { id: 'salary', label: 'Chi phí lương', typeIds: ['luong'] },
  { id: 'rent', label: 'Chi phí mặt bằng', typeIds: ['mat-bang'] },
  { id: 'supplies', label: 'Chi phí vật tư', typeIds: ['vat-tu'] },
  { id: 'other', label: 'Chi phí khác', typeIds: ['khac'] },
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
