import { getPayrollBranchDisplayTitle, getPayrollBranchSortOrder } from '../constants/branchPayrollDisplay'
import { getBranchName } from './branchStorage'

export function aggregateBranchSummaries(branches, employees, payrollRows) {
  return branches
    .map((branch) => {
      const branchEmployees = employees.filter(
        (emp) => emp.branchId === branch.id && emp.status !== 'inactive' && emp.status !== 'archived',
      )
      const rows = payrollRows.filter((row) => row.branchId === branch.id)

      const totals = rows.reduce(
        (acc, row) => {
          acc.ticketRevenue += row.ticketRevenue ?? 0
          acc.commission += row.commission ?? 0
          acc.tips += row.tips ?? 0
          acc.bonus += row.bonus ?? 0
          acc.penalty += row.penalty ?? 0
          acc.advance += row.advance ?? 0
          acc.reduction += row.reduction ?? 0
          acc.baseSalary += row.baseSalary ?? 0
          acc.netSalary += row.netSalary ?? 0
          acc.provisionalSalary += row.provisionalNet ?? row.netSalary ?? 0
          return acc
        },
        {
          ticketRevenue: 0,
          commission: 0,
          tips: 0,
          bonus: 0,
          penalty: 0,
          advance: 0,
          reduction: 0,
          baseSalary: 0,
          netSalary: 0,
          provisionalSalary: 0,
        },
      )

      return {
        branchId: branch.id,
        branchName: getPayrollBranchDisplayTitle(branch.id, branch.name ?? getBranchName(branch.id)),
        sortOrder: getPayrollBranchSortOrder(branch.id),
        employeeCount: branchEmployees.length,
        ...totals,
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.branchName.localeCompare(b.branchName, 'vi'))
}

export function mergeEmployeePayrollRows(employees, payrollRows, { branchId = '', search = '', status = '' } = {}) {
  const query = search.trim().toLowerCase()

  return employees
    .filter((emp) => {
      if (branchId && emp.branchId !== branchId) return false
      if (status === 'all') {
        // no status filter
      } else if (status) {
        if (emp.status !== status) return false
      } else if (emp.status === 'inactive' || emp.status === 'archived') {
        return false
      }
      if (query) {
        const name = (emp.name ?? '').toLowerCase()
        const phone = (emp.phone ?? '').replace(/\D/g, '')
        const qPhone = query.replace(/\D/g, '')
        if (!name.includes(query) && !(qPhone && phone.includes(qPhone))) return false
      }
      return true
    })
    .map((emp) => {
      const row = payrollRows.find((r) => r.employeeId === emp.id)
      return {
        employeeId: emp.id,
        employeeName: emp.name ?? '—',
        branchId: emp.branchId,
        branchName: getPayrollBranchDisplayTitle(emp.branchId, getBranchName(emp.branchId)),
        position: emp.position ?? '',
        avatar: emp.avatar ?? '',
        phone: emp.phone ?? '',
        status: emp.status ?? 'active',
        workDays: row?.workDays ?? 0,
        ticketRevenue: row?.ticketRevenue ?? 0,
        commission: row?.commission ?? 0,
        tips: row?.tips ?? 0,
        bonus: row?.bonus ?? 0,
        penalty: row?.penalty ?? 0,
        advance: row?.advance ?? 0,
        reduction: row?.reduction ?? 0,
        otherAdjustment: row?.otherAdjustment ?? 0,
        baseSalary: row?.baseSalary ?? 0,
        netSalary: row?.netSalary ?? 0,
        paidAmount: row?.paidAmount ?? 0,
        remainingAmount: row?.remainingAmount ?? 0,
        provisionalNet: row?.provisionalNet ?? row?.netSalary ?? 0,
        invoiceCount: row?.invoiceCount ?? 0,
      }
    })
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'vi'))
}

export function formatWorkDays(value) {
  const days = Number(value ?? 0)
  if (!Number.isFinite(days) || days === 0) return '0'
  if (Number.isInteger(days)) return String(days)
  return days.toFixed(1).replace(/\.0$/, '')
}

export function getEmployeeStatusLabel(status) {
  if (status === 'inactive') return 'Nghỉ việc'
  if (status === 'archived') return 'Lưu trữ'
  return 'Đang làm'
}
