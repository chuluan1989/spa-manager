/** 0% là giá trị hợp lệ. Chỉ null/undefined/'' mới là thiếu. */
export function isStoredCommissionPercent(value) {
  if (value === null || value === undefined || value === '') return false
  return Number.isFinite(Number(value))
}

export function parseOptionalCommissionPercent(value) {
  if (!isStoredCommissionPercent(value)) return null
  return Number(value)
}
