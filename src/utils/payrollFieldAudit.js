/** Metadata audit Admin payroll board — thuần, không phụ thuộc auth/browser. */
export function buildPayrollFieldAuditValues({
  employeeId,
  employeeName,
  branchId,
  month,
  cycle,
  fieldChanged,
  oldValue,
  newValue,
  difference,
  extra = {},
}) {
  const period = `${month || ''}${cycle ? `/${cycle}` : ''}`
  const base = {
    employeeId: employeeId || '',
    employeeName: employeeName || '',
    branchId: branchId || '',
    payrollPeriod: period,
    month: month || '',
    cycle: cycle || '',
    fieldChanged: fieldChanged || '',
    ...extra,
  }
  return {
    oldValue: { ...base, value: oldValue },
    newValue: {
      ...base,
      value: newValue,
      difference: difference ?? (Number(newValue) - Number(oldValue)),
    },
  }
}
