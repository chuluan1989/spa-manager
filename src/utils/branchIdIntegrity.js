import { getBranchById, getBranchName, loadBranches, saveBranches } from './branchStorage'
import { loadEmployees, saveEmployees } from './employeeStorage'
import { loadInvoices, replaceAllInvoices } from './invoiceStorage'
import { loadExpenses, saveExpenses } from './expenseStorage'

/**
 * Sửa branchName / branchId sai — luôn map theo branch_id, không theo index hay tên.
 * Trả về số bản ghi đã sửa.
 */
export function repairBranchIdReferences() {
  const branchIds = new Set(loadBranches().map((branch) => branch.id))
  let fixed = 0

  const employees = loadEmployees()
  let employeesChanged = false
  const repairedEmployees = employees.map((employee) => {
    if (!employee.branchId || !branchIds.has(employee.branchId)) {
      employeesChanged = true
      fixed += 1
      return employee
    }
    return employee
  })
  if (employeesChanged) {
    saveEmployees(repairedEmployees, { skipRemoteSync: false })
  }

  const invoices = loadInvoices()
  let invoicesChanged = false
  const repairedInvoices = invoices.map((invoice) => {
    if (!invoice.branchId) return invoice
    const canonicalName = getBranchName(invoice.branchId)
    if (branchIds.has(invoice.branchId) && invoice.branchName !== canonicalName) {
      invoicesChanged = true
      fixed += 1
      return { ...invoice, branchName: canonicalName }
    }
    return invoice
  })
  if (invoicesChanged) {
    replaceAllInvoices(repairedInvoices)
  }

  const expenses = loadExpenses()
  let expensesChanged = false
  const repairedExpenses = expenses.map((expense) => {
    if (!expense.branchId) return expense
    const canonicalName = getBranchName(expense.branchId)
    if (branchIds.has(expense.branchId) && expense.branchName !== canonicalName) {
      expensesChanged = true
      fixed += 1
      return { ...expense, branchName: canonicalName }
    }
    return expense
  })
  if (expensesChanged) {
    saveExpenses(repairedExpenses)
  }

  return fixed
}

/** Kiểm tra toàn bộ dữ liệu liên kết bằng branch_id hợp lệ. */
export function auditBranchIdReferences() {
  const branchIds = new Set(loadBranches().map((branch) => branch.id))
  const issues = []

  for (const employee of loadEmployees()) {
    if (employee.branchId && !branchIds.has(employee.branchId)) {
      issues.push({ type: 'employee', id: employee.id, branchId: employee.branchId })
    }
  }

  for (const invoice of loadInvoices()) {
    if (invoice.branchId && !branchIds.has(invoice.branchId)) {
      issues.push({ type: 'invoice', id: invoice.id, branchId: invoice.branchId })
    }
  }

  for (const expense of loadExpenses()) {
    if (expense.branchId && !branchIds.has(expense.branchId)) {
      issues.push({ type: 'expense', id: expense.id, branchId: expense.branchId })
    }
  }

  return { valid: issues.length === 0, issues, branchCount: branchIds.size }
}

export function getBranchByIdOrNull(branchId) {
  return getBranchById(branchId)
}
