import { getBranchName } from './branchStorage'
import { formatCurrency } from './invoice'

export function aggregateAttendanceBranchSummaries(branches, records) {
  return branches.map((branch) => {
    const branchRecords = records.filter((row) => row.branchId === branch.id)
    const totalPenalty = branchRecords.reduce((sum, row) => sum + Number(row.penaltyAmount ?? 0), 0)
    const late = branchRecords.filter((row) => String(row.status ?? '').includes('late')).length

    return {
      branchId: branch.id,
      branchName: branch.name ?? getBranchName(branch.id),
      employeeCount: branchRecords.length,
      countLabel: 'bản ghi',
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
    { label: 'Bản ghi', value: branch.recordCount, formatted: String(branch.recordCount) },
    { label: 'Đi trễ', value: branch.lateCount, formatted: String(branch.lateCount), tone: 'penalty' },
    { label: 'Tổng phạt', value: branch.totalPenalty, formatted: formatCurrency(branch.totalPenalty), tone: 'penalty' },
  ]
}
