/**
 * Ánh xạ hiển thị tab Tổng quan từ payrollRow đã tính.
 * Không cộng lại doanh thu vé, không suy phạt từ số ngày nghỉ.
 * Tổng khấu trừ dùng đúng các hạng mục trong computeNetSalary.
 */
export function buildPayrollOverviewFigures(stats) {
  const baseSalary = Number(stats?.baseSalary ?? 0)
  const commission = Number(stats?.commission ?? 0)
  const tips = Number(stats?.tips ?? 0)
  const bonus = Number(stats?.bonus ?? 0)
  const kpi = Number(stats?.kpi ?? 0)
  const attendancePenalty = Number(stats?.attendancePenalty ?? 0)
  const manualPenalty = Number(stats?.manualPenalty ?? 0)
  const penalty = Number(stats?.penalty ?? 0)
  const kpiPenalty = Number(stats?.kpiPenalty ?? 0)
  const reduction = Number(stats?.reduction ?? 0)
  const advance = Number(stats?.advance ?? 0)
  const totalIncome = baseSalary + commission + tips + bonus + kpi
  const totalDeduction = kpiPenalty + reduction + penalty + advance
  const netSalary = Number(stats?.netSalary ?? 0)

  return {
    baseSalary,
    commission,
    tips,
    bonus,
    kpi,
    ticketRevenue: Number(stats?.ticketRevenue ?? 0),
    attendancePenalty,
    kpiPenalty,
    manualPenalty,
    penalty,
    reduction,
    advance,
    originalKpiPenalty: Number(stats?.originalKpiPenalty ?? 0),
    kpiPenaltyReduction: Number(stats?.kpiPenaltyReduction ?? 0),
    otherAdjustment: Number(stats?.otherAdjustment ?? 0),
    paidAmount: Number(stats?.paidAmount ?? 0),
    remainingAmount: Number(stats?.remainingAmount ?? 0),
    totalIncome,
    totalDeduction,
    netSalary,
    penaltyPartsMatch: attendancePenalty + manualPenalty === penalty,
    reconciled: totalIncome - totalDeduction === netSalary,
  }
}
