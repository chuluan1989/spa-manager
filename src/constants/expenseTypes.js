export const EXPENSE_TYPES = [
  { id: 'rent', label: 'Thuê mặt bằng' },
  { id: 'electricity', label: 'Điện' },
  { id: 'water', label: 'Nước' },
  { id: 'internet', label: 'Internet' },
  { id: 'salary', label: 'Lương nhân viên' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'towels', label: 'Khăn' },
  { id: 'cosmetics', label: 'Mỹ phẩm' },
  { id: 'massage-oil', label: 'Dầu massage' },
  { id: 'medicine', label: 'Thuốc' },
  { id: 'supplies', label: 'Vật tư' },
  { id: 'laundry', label: 'Giặt ủi' },
  { id: 'office', label: 'Văn phòng phẩm' },
  { id: 'repair', label: 'Sửa chữa' },
  { id: 'other', label: 'Khác' },
]

export const EXPENSE_TYPE_MAP = Object.fromEntries(
  EXPENSE_TYPES.map((type) => [type.id, type]),
)

export function getExpenseTypeLabel(typeId) {
  return EXPENSE_TYPE_MAP[typeId]?.label ?? '—'
}
