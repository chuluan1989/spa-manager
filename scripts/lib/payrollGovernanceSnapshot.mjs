/**
 * Snapshot quản trị — cùng nguồn computePayrollReport + payroll cost/profit.
 * Dùng sau mỗi lần SET bảng lương để đối chiếu module.
 */
export function buildGovernanceSnapshot({
  label,
  employeeId,
  branchId,
  report,
  payrollCost,
  expensesTotal = 0,
  exportRow = null,
  auditLatest = null,
}) {
  const row = (report?.rows ?? []).find((r) => r.employeeId === employeeId) ?? null
  const branchRows = (report?.rows ?? []).filter((r) => (r.branchId || '') === (branchId || r.branchId))
  const branchNet = branchRows.reduce((s, r) => s + Number(r.netSalary ?? 0), 0)
  const branchPenalty = branchRows.reduce((s, r) => s + Number(r.penalty ?? 0), 0)
  const branchAdvance = branchRows.reduce((s, r) => s + Number(r.advance ?? 0), 0)
  const branchBonus = branchRows.reduce((s, r) => s + Number(r.bonus ?? 0), 0)
  const branchKpi = branchRows.reduce((s, r) => s + Number(r.kpi ?? 0), 0)

  const laborCost = Number(payrollCost?.total ?? 0)
  const ticketRevenue = Number(report?.dashboard?.ticketRevenue ?? 0)
  const tips = Number(report?.dashboard?.tips ?? 0)
  const actualRevenue = ticketRevenue + tips
  const expenses = Number(expensesTotal || 0)
  const profit = actualRevenue - laborCost - expenses
  const systemNet = Number(report?.dashboard?.netSalary ?? 0)

  const detail = row
    ? {
        bonus: Number(row.bonus ?? 0),
        kpi: Number(row.kpi ?? 0),
        penalty: Number(row.penalty ?? 0),
        advance: Number(row.advance ?? 0),
        tips: Number(row.tips ?? 0),
        commission: Number(row.commission ?? 0),
        netSalary: Number(row.netSalary ?? 0),
        otherAdjustment: Number(row.otherAdjustment ?? 0),
      }
    : null

  return {
    label,
    at: new Date().toISOString(),
    source: 'computePayrollReport + computePayrollCostByBranch (cùng adjustments đã fetch)',
    employeeDetail: detail,
    branchTotals: {
      branchId,
      netSalary: branchNet,
      bonus: branchBonus,
      kpi: branchKpi,
      penalty: branchPenalty,
      advance: branchAdvance,
      employeeCount: branchRows.length,
    },
    systemDashboard: {
      netSalary: systemNet,
      bonus: Number(report?.dashboard?.bonus ?? 0),
      kpi: Number(report?.dashboard?.kpi ?? 0),
      penalty: Number(report?.dashboard?.penalty ?? 0),
      advance: Number(report?.dashboard?.advance ?? 0),
      ticketRevenue,
      tips,
      commission: Number(report?.dashboard?.commission ?? 0),
    },
    laborCost,
    actualRevenue,
    expensesTotal: expenses,
    spaProfit: profit,
    // Nội bộ cùng snapshot: labor ≈ system net; profit = DT − labor − chi phí
    identity: {
      laborEqualsSystemNet: Math.abs(laborCost - systemNet) <= 1,
      profitFormulaOk: Math.abs(profit - (actualRevenue - laborCost - expenses)) <= 1,
    },
    excel: exportRow
      ? {
          bonus: Number(exportRow.bonus ?? 0),
          kpi: Number(exportRow.kpi ?? exportRow.kpiAmount ?? detail?.kpi ?? 0),
          penalty: Number(exportRow.penalty ?? 0),
          advance: Number(exportRow.advance ?? 0),
          netSalary: Number(exportRow.netSalary ?? 0),
        }
      : detail
        ? {
            bonus: detail.bonus,
            kpi: detail.kpi,
            penalty: detail.penalty,
            advance: detail.advance,
            netSalary: detail.netSalary,
          }
        : null,
    pdf: detail
      ? {
          bonus: detail.bonus,
          penalty: detail.penalty,
          advance: detail.advance,
          netSalary: detail.netSalary,
          // KPI nằm trong net dù phiếu có/không in dòng KPI
          kpiInNet: detail.kpi,
        }
      : null,
    audit: auditLatest,
  }
}

export function diffGovernance(before, after) {
  const d = (a, b) => Number(b ?? 0) - Number(a ?? 0)
  const revenueDelta = d(before?.actualRevenue, after?.actualRevenue)
  const expenseDelta = d(before?.expensesTotal, after?.expensesTotal)
  const laborCost = d(before?.laborCost, after?.laborCost)
  return {
    employeeNet: d(before?.employeeDetail?.netSalary, after?.employeeDetail?.netSalary),
    employeePenalty: d(before?.employeeDetail?.penalty, after?.employeeDetail?.penalty),
    employeeAdvance: d(before?.employeeDetail?.advance, after?.employeeDetail?.advance),
    employeeKpi: d(before?.employeeDetail?.kpi, after?.employeeDetail?.kpi),
    employeeBonus: d(before?.employeeDetail?.bonus, after?.employeeDetail?.bonus),
    branchNet: d(before?.branchTotals?.netSalary, after?.branchTotals?.netSalary),
    systemNet: d(before?.systemDashboard?.netSalary, after?.systemDashboard?.netSalary),
    laborCost,
    actualRevenue: revenueDelta,
    expensesTotal: expenseDelta,
    spaProfit: d(before?.spaProfit, after?.spaProfit),
    // Kỳ vọng công thức khi DT/chi phí cũng đổi song song (DB shared)
    spaProfitExpectedFromLabor: -laborCost + revenueDelta - expenseDelta,
    concurrentOtherNet: laborCost - d(before?.employeeDetail?.netSalary, after?.employeeDetail?.netSalary),
    excelNet: d(before?.excel?.netSalary, after?.excel?.netSalary),
    pdfNet: d(before?.pdf?.netSalary, after?.pdf?.netSalary),
  }
}

/**
 * Một nguồn (ops): NV = Excel = PDF = branch (CN đó).
 * Labor/system phải cùng nhau; profit = −Δlabor + ΔDT − Δchi phí (cho phép nhiễu DT shared).
 * Δ labor có thể ≠ Δ NV nếu NV khác đổi song song → ghi concurrentOtherNet, không FAIL cứng.
 */
export function assertOneSource(diff, expectedNetDelta, tol = 1) {
  const checks = []
  const eq = (name, actual, expected, hard = true) => {
    const ok = Math.abs(Number(actual) - Number(expected)) <= tol
    checks.push({ name, ok, hard, actual, expected })
    return ok
  }
  eq('employeeNet_delta', diff.employeeNet, expectedNetDelta)
  eq('excelNet_delta', diff.excelNet, expectedNetDelta)
  eq('pdfNet_delta', diff.pdfNet, expectedNetDelta)
  eq('branchNet_delta', diff.branchNet, expectedNetDelta)
  eq('laborCost_delta_equals_systemNet', diff.laborCost, diff.systemNet)
  eq('spaProfit_formula_delta', diff.spaProfit, diff.spaProfitExpectedFromLabor)
  // Soft: nếu không có nhiễu NV khác, labor phải = expected
  eq('laborCost_delta_equals_employee_when_isolated', diff.laborCost, expectedNetDelta, false)
  return {
    ok: checks.filter((c) => c.hard !== false).every((c) => c.ok),
    concurrentOtherNet: Number(diff.concurrentOtherNet || 0),
    checks,
  }
}
