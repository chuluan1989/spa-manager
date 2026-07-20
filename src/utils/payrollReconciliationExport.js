import {
  buildBranchPayrollExportData,
  buildEmployeePayrollExportData,
} from './payrollExportModel'
import {
  assertCanExportPayrollBranch,
  assertCanExportPayrollEmployee,
} from './payrollExportPermissions'
import { exportEmployeePayrollPdf } from './payrollPdfExport'
import {
  downloadBranchPayrollWorkbook,
  downloadEmployeePayrollWorkbook,
} from './payrollXlsxExport'

export class PayrollReconciliationError extends Error {
  constructor(message, reconciliation = null) {
    super(message)
    this.name = 'PayrollReconciliationError'
    this.reconciliation = reconciliation
  }
}

function assertReconciliation(data) {
  if (data.reconciliation?.ok) return
  const detail = data.reconciliation?.errors?.join('\n') ?? 'Dữ liệu đối soát không khớp.'
  throw new PayrollReconciliationError(
    `Không thể xuất file vì số liệu chưa khớp:\n${detail}`,
    data.reconciliation,
  )
}

export function prepareEmployeePayrollExport({
  employee,
  payrollRow,
  invoices,
  attendanceRecords,
  adjustments,
  month,
  cycle,
  fromDate,
  toDate,
}) {
  assertCanExportPayrollEmployee(payrollRow?.employeeId ?? employee?.id, payrollRow?.branchId ?? employee?.branchId)

  const data = buildEmployeePayrollExportData({
    employee,
    payrollRow,
    invoices,
    attendanceRecords,
    adjustments,
    month,
    cycle,
    fromDate,
    toDate,
  })

  assertReconciliation(data)
  return data
}

export function prepareBranchPayrollExport({
  rows,
  branchId,
  branchName,
  month,
  cycle,
  fromDate,
  toDate,
}) {
  assertCanExportPayrollBranch(branchId)

  return buildBranchPayrollExportData({
    rows,
    branchId,
    branchName,
    month,
    cycle,
    fromDate,
    toDate,
  })
}

export async function exportEmployeePayrollXlsx(context) {
  const data = prepareEmployeePayrollExport(context)
  await downloadEmployeePayrollWorkbook(data)
  return data
}

export async function exportEmployeePayrollPdfSafe(context) {
  const data = prepareEmployeePayrollExport(context)
  exportEmployeePayrollPdf(data)
  return data
}

export async function exportBranchPayrollXlsx(context) {
  const data = prepareBranchPayrollExport(context)
  await downloadBranchPayrollWorkbook(data)
  return data
}

export function getReconciliationPreview(context) {
  try {
    assertCanExportPayrollEmployee(context.payrollRow?.employeeId ?? context.employee?.id, context.payrollRow?.branchId ?? context.employee?.branchId)
  } catch (error) {
    return { ok: false, errors: [error.message] }
  }

  const data = buildEmployeePayrollExportData(context)
  return data.reconciliation
}
