/** Metadata audit Admin sửa bảng lương (SET giá trị cuối) — thuần, không phụ thuộc auth/browser. */

/**
 * Tác động lên lương thực nhận khi SET giá trị tổng hạng mục.
 * Phạt / Ứng tăng → thực nhận giảm.
 */
export function netSalaryImpactForFieldSet(type, oldValue, newValue) {
  const fieldDelta = Number(newValue) - Number(oldValue)
  if (type === 'penalty' || type === 'advance' || type === 'reduction') {
    return -fieldDelta
  }
  return fieldDelta
}

/** Chi phí nhân sự thay đổi = cùng chiều với Δ lương thực nhận. */
export function laborCostImpactForNetDelta(netDelta) {
  return Number(netDelta) || 0
}

/** Lợi nhuận Spa thay đổi = ngược chiều Δ chi phí nhân sự / Δ lương. */
export function spaProfitImpactForNetDelta(netDelta) {
  return -(Number(netDelta) || 0)
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
  laborCostDelta,
  profitDelta,
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
  const resolvedLabor = laborCostDelta ?? laborCostImpactForNetDelta(resolvedDiff)
  const resolvedProfit = profitDelta ?? spaProfitImpactForNetDelta(resolvedDiff)
  return {
    oldValue: { ...base, value: oldValue },
    newValue: {
      ...base,
      value: newValue,
      difference: resolvedDiff,
      laborCostDelta: resolvedLabor,
      profitDelta: resolvedProfit,
    },
  }
}
