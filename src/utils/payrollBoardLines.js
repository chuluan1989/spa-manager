import { PAYROLL_ADJUSTMENT_TYPES } from '../constants/payrollTypes'

/** Hạng mục sửa theo từng phát sinh (không SET tổng). */
export const PAYROLL_BOARD_LINE_TYPES = Object.freeze([
  PAYROLL_ADJUSTMENT_TYPES.ADVANCE,
  PAYROLL_ADJUSTMENT_TYPES.PENALTY,
])

export function isPayrollBoardLineType(type) {
  return PAYROLL_BOARD_LINE_TYPES.includes(type)
}

export function isVoidedPayrollAdjustment(row) {
  return Number(row?.amount ?? 0) === 0
}

export function todayIsoDate(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatPayrollLineDate(iso) {
  const value = String(iso || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || '—'
  return `${value.slice(8, 10)}/${value.slice(5, 7)}`
}

export function isDateInPayPeriod(date, fromDate = '', toDate = '') {
  const value = String(date || '')
  if (fromDate && value < fromDate) return false
  if (toDate && value > toDate) return false
  return Boolean(value)
}

export function defaultPayrollLineDate(fromDate = '', toDate = '', today = todayIsoDate()) {
  if (fromDate && toDate && today >= fromDate && today <= toDate) return today
  return toDate || fromDate || today
}

export function listPeriodAdjustments(adjustments, {
  employeeId,
  type,
  fromDate = '',
  toDate = '',
} = {}) {
  return (adjustments ?? [])
    .filter((row) => {
      if (employeeId && row.employeeId !== employeeId) return false
      if (type && row.type !== type) return false
      return isDateInPayPeriod(row.date, fromDate, toDate)
    })
    .slice()
    .sort((a, b) => {
      const dateCmp = String(a.date ?? '').localeCompare(String(b.date ?? ''))
      if (dateCmp !== 0) return dateCmp
      return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
    })
}

export function sumAdjustmentAmounts(rows) {
  return (rows ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
}

/**
 * Áp dụng thao tác từng dòng (thuần, không ghi DB) — SoT: tổng = SUM, không SET.
 */
export function applyPayrollLineOperations(rows, operations = []) {
  let next = Array.isArray(rows) ? [...rows] : []
  for (const op of operations) {
    const action = op?.action
    if (action === 'add') {
      const record = op.record || {}
      next.push({
        id: record.id || `line-${next.length + 1}`,
        ...record,
        amount: Number(record.amount ?? 0),
      })
      continue
    }
    if (action === 'edit') {
      next = next.map((row) => (
        row.id === op.id ? { ...row, ...op.updates, amount: Number(op.updates?.amount ?? row.amount ?? 0) } : row
      ))
      continue
    }
    if (action === 'void') {
      next = next.map((row) => (row.id === op.id ? { ...row, amount: 0 } : row))
      continue
    }
    if (action === 'delete') {
      next = next.filter((row) => row.id !== op.id)
    }
  }
  return next
}
