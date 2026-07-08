import { getBranchName } from './branchStorage'
import { formatCurrency } from './invoice'
import { isEmployeeLoginEligible, loadEmployees } from './employeeStorage'

export function aggregateAttendanceBranchSummaries(branches, records) {
  return branches.map((branch) => {
    const branchRecords = records.filter((row) => row.branchId === branch.id)
    const branchEmployees = loadEmployees().filter(
      (employee) => employee.branchId === branch.id && isEmployeeLoginEligible(employee),
    )
    const totalPenalty = branchRecords.reduce((sum, row) => sum + Number(row.penaltyAmount ?? 0), 0)
    const late = branchRecords.filter((row) => String(row.status ?? '').includes('late')).length

    return {
      branchId: branch.id,
      branchName: branch.name ?? getBranchName(branch.id),
      employeeCount: branchEmployees.length,
      countLabel: 'nhân viên',
      recordCount: branchRecords.length,
      lateCount: late,
      totalPenalty,
      ticketRevenue: 0,
      tips: 0,
      commission: 0,
      netSalary: totalPenalty,
    }
  })
}

export function formatAttendanceBranchStats(branch) {
  return [
    { label: 'Nhân viên', value: branch.employeeCount, formatted: String(branch.employeeCount) },
    { label: 'Bản ghi', value: branch.recordCount, formatted: String(branch.recordCount) },
    { label: 'Đi trễ', value: branch.lateCount, formatted: String(branch.lateCount), tone: 'penalty' },
    { label: 'Tổng phạt', value: branch.totalPenalty, formatted: formatCurrency(branch.totalPenalty), tone: 'penalty' },
  ]
}

export function buildAttendanceDayRoster(employees, records, date) {
  const recordMap = new Map(
    records.filter((row) => row.date === date).map((row) => [row.employeeId, row]),
  )

  return employees
    .filter((employee) => isEmployeeLoginEligible(employee))
    .map((employee) => {
      const record = recordMap.get(employee.id)
      return {
        employeeId: employee.id,
        employeeName: employee.name,
        branchId: employee.branchId,
        date,
        record,
        status: record?.status ?? '',
        penaltyAmount: record?.penaltyAmount ?? 0,
        reason: record?.reason ?? '',
        note: record?.note ?? '',
        submittedAt: record?.submittedAt ?? '',
        updatedAt: record?.updatedAt ?? '',
        submittedBy: record?.submittedBy ?? '',
      }
    })
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'vi'))
}

export function buildAttendanceMonthMatrix(employees, records, monthPrefix) {
  const [yearStr, monthStr] = monthPrefix.split('-')
  const year = Number(yearStr)
  const monthNum = Number(monthStr)
  const daysInMonth = new Date(year, monthNum, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = String(index + 1).padStart(2, '0')
    return `${monthPrefix}-${day}`
  })

  const recordIndex = new Map()
  for (const record of records) {
    if (!record.date?.startsWith(monthPrefix)) continue
    recordIndex.set(`${record.employeeId}:${record.date}`, record)
  }

  const rows = employees
    .filter((employee) => isEmployeeLoginEligible(employee))
    .map((employee) => ({
      employeeId: employee.id,
      employeeName: employee.name,
      branchId: employee.branchId,
      cells: days.map((date) => recordIndex.get(`${employee.id}:${date}`) ?? null),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'vi'))

  return { days, rows }
}
