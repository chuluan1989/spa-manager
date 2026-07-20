import { useState } from 'react'
import {
  canExportPayrollBranch,
  canExportPayrollEmployee,
} from '../../utils/payrollExportPermissions'
import {
  exportBranchPayrollXlsx,
  exportEmployeePayrollPdfSafe,
  exportEmployeePayrollXlsx,
  PayrollReconciliationError,
} from '../../utils/payrollReconciliationExport'
import { exportPayrollPdf } from '../../utils/salaryExport'
import { canExportReport } from '../../constants/auth'
import '../common/ExportActions.css'

export default function PayrollReconciliationActions({
  level,
  month,
  cycle,
  branchId,
  branchName,
  fromDate = '',
  toDate = '',
  employeeRows = [],
  profileContext = null,
  disabled = false,
  className = '',
}) {
  const [busy, setBusy] = useState(false)

  const run = async (action) => {
    if (busy || disabled) return
    setBusy(true)
    try {
      await action()
    } catch (error) {
      if (error instanceof PayrollReconciliationError) {
        window.alert(error.message)
      } else {
        window.alert(error?.message ?? 'Không thể xuất file đối soát lương.')
      }
    } finally {
      setBusy(false)
    }
  }

  const showLegacyPdf = canExportReport() && level !== 'profile'
  const showBranch = level === 'employees' && branchId && canExportPayrollBranch(branchId)
  const showEmployee = level === 'profile' && profileContext && canExportPayrollEmployee(
    profileContext.payrollRow?.employeeId,
    profileContext.payrollRow?.branchId,
  )

  if (!showLegacyPdf && !showBranch && !showEmployee) return null

  return (
    <div className={`export-actions payroll-export-actions ${className}`.trim()}>
      {showBranch && (
        <button
          type="button"
          className="export-actions__btn export-actions__btn--excel"
          disabled={disabled || busy || employeeRows.length === 0}
          onClick={() => run(() => exportBranchPayrollXlsx({
            rows: employeeRows,
            branchId,
            branchName,
            month,
            cycle,
            fromDate,
            toDate,
          }))}
        >
          Báo cáo chi lương (XLSX)
        </button>
      )}

      {showEmployee && (
        <>
          <button
            type="button"
            className="export-actions__btn export-actions__btn--excel"
            disabled={disabled || busy}
            onClick={() => run(() => exportEmployeePayrollXlsx(profileContext))}
          >
            Đối soát Excel
          </button>
          <button
            type="button"
            className="export-actions__btn export-actions__btn--pdf"
            disabled={disabled || busy}
            onClick={() => run(async () => { await exportEmployeePayrollPdfSafe(profileContext) })}
          >
            Tóm tắt PDF
          </button>
        </>
      )}

      {showLegacyPdf && (
        <button
          type="button"
          className="export-actions__btn export-actions__btn--pdf"
          disabled={disabled || busy || employeeRows.length === 0}
          onClick={() => exportPayrollPdf(employeeRows, month, cycle)}
        >
          Tóm tắt PDF
        </button>
      )}
    </div>
  )
}
