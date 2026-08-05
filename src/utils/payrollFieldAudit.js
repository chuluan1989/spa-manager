/** Metadata audit Admin payroll board — thuần, không phụ thuộc auth/browser. */

/** Tác động lên lương thực nhận khi SET giá trị tổng hạng mục. */
export function netSalaryImpactForFieldSet(type, oldValue, newValue) {
  const fieldDelta = Number(newValue) - Number(oldValue)
  if (type === 'penalty' || type === 'advance' || type === 'reduction') {
    // Phạt / ứng giảm → thực nhận tăng.
    return -fieldDelta
  }
  return fieldDelta
}

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
  const resolvedDiff = difference ?? (
    fieldChanged
      ? netSalaryImpactForFieldSet(fieldChanged, oldValue, newValue)
      : (Number(newValue) - Number(oldValue))
  )
  return {
    oldValue: { ...base, value: oldValue },
    newValue: {
      ...base,
      value: newValue,
      difference: resolvedDiff,
    },
  }
}
