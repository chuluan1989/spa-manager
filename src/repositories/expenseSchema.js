/** Cột expenses cốt lõi (0001_init_schema) — luôn có trên mọi môi trường. */
export const EXPENSE_CORE_DB_COLUMNS = [
  'id',
  'date',
  'branch_id',
  'branch_name',
  'expense_type',
  'expense_type_label',
  'content',
  'amount',
  'entered_by',
  'note',
  'updated_at',
]

/** Cột ERP bổ sung (0008/0009) — có thể chưa migrate trên production cũ. */
export const EXPENSE_EXTENDED_DB_COLUMNS = [
  'expense_time',
  'paid_by',
  'receipt_image',
  'entered_by_id',
  'employee_id',
  'payroll_adjustment_id',
  'payroll_month',
  'payroll_cycle',
]

export function deriveExpenseTimeFromTimestamp(iso) {
  if (!iso) return ''
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
}

export function expenseToDbRow(expense, { includeExtended = true } = {}) {
  const row = {
    id: expense.id,
    date: expense.date ?? '',
    branch_id: expense.branchId ?? '',
    branch_name: expense.branchName ?? '',
    expense_type: expense.expenseType ?? '',
    expense_type_label: expense.expenseTypeLabel ?? '',
    content: expense.content ?? '',
    amount: expense.amount ?? 0,
    entered_by: expense.enteredBy ?? '',
    note: expense.note ?? '',
    updated_at: expense.updatedAt ?? new Date().toISOString(),
  }

  if (includeExtended) {
    if (expense.expenseTime != null && expense.expenseTime !== '') {
      row.expense_time = expense.expenseTime
    }
    if (expense.paidBy != null && expense.paidBy !== '') {
      row.paid_by = expense.paidBy
    }
    if (expense.receiptImage != null && expense.receiptImage !== '') {
      row.receipt_image = expense.receiptImage
    }
    if (expense.enteredById != null && expense.enteredById !== '') {
      row.entered_by_id = expense.enteredById
    }
    if (expense.employeeId != null && expense.employeeId !== '') {
      row.employee_id = expense.employeeId
    }
    if (expense.payrollAdjustmentId != null && expense.payrollAdjustmentId !== '') {
      row.payroll_adjustment_id = expense.payrollAdjustmentId
    }
    if (expense.payrollMonth != null && expense.payrollMonth !== '') {
      row.payroll_month = expense.payrollMonth
    }
    if (expense.payrollCycle != null && expense.payrollCycle !== '') {
      row.payroll_cycle = expense.payrollCycle
    }
  }

  return row
}

export function isMissingColumnError(error, columnName) {
  const message = String(error?.message ?? error ?? '').toLowerCase()
  const col = columnName.toLowerCase()
  return message.includes(col) && (message.includes('does not exist') || message.includes('column'))
}
