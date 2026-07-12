import { getCurrentUserEmployeeId, getCurrentUserName, isAdmin, isBranchManager, getCurrentUserBranch } from '../constants/auth'
import { fetchAttendanceFiltered } from '../repositories/attendanceRepository'
import { fetchInvoicesFiltered } from '../repositories/invoicesRepository'
import {
  buildDayReviewId,
  fetchPayroll1DayReviews,
  fetchPayroll1Overrides,
  upsertPayroll1DayReview,
  upsertPayroll1Override,
} from '../repositories/payroll1Repository'
import { getEmployeeById, loadEmployees, isEmployeeLoginEligible } from './employeeStorage'
import { notifyDataSynced } from './dataSyncEvents'
import {
  getPayroll1PeriodStart,
  summarizeEmployeePayroll1Status,
} from './payroll1Policy'
import { getIctTodayDate } from './ictTime'

export async function loadEmployeePayroll1Status(employeeId, now = new Date()) {
  const employee = getEmployeeById(employeeId)
  if (!employee) return null

  const start = getPayroll1PeriodStart()
  const end = getIctTodayDate(now)

  const [attendanceRecords, invoices, dayReviews, overrides] = await Promise.all([
    fetchAttendanceFiltered({ employeeId, fromDate: start, toDate: end }),
    fetchInvoicesFiltered({ employeeId, fromDate: start, toDate: end }),
    fetchPayroll1DayReviews({ employeeId, fromDate: start, toDate: end }),
    fetchPayroll1Overrides({ employeeId }),
  ])

  return summarizeEmployeePayroll1Status({
    employee,
    attendanceRecords,
    invoices,
    dayReviews,
    override: overrides[0] ?? null,
    now,
  })
}

export async function loadPayroll1AdminRows({ branchId = '' } = {}, now = new Date()) {
  const start = getPayroll1PeriodStart()
  const end = getIctTodayDate(now)
  const scopedBranch = branchId || (isAdmin() ? '' : getCurrentUserBranch())

  const employees = loadEmployees().filter((employee) => {
    if (!isEmployeeLoginEligible(employee)) return false
    if (scopedBranch && employee.branchId !== scopedBranch) return false
    if (isBranchManager() && !isAdmin() && employee.branchId !== getCurrentUserBranch()) return false
    return true
  })

  const [attendanceRecords, invoices, dayReviews, overrides] = await Promise.all([
    fetchAttendanceFiltered({
      branchId: scopedBranch,
      fromDate: start,
      toDate: end,
    }),
    fetchInvoicesFiltered({
      branchId: scopedBranch,
      fromDate: start,
      toDate: end,
    }),
    fetchPayroll1DayReviews({
      branchId: scopedBranch,
      fromDate: start,
      toDate: end,
    }),
    fetchPayroll1Overrides({ branchId: scopedBranch }),
  ])

  const overrideByEmployee = new Map(overrides.map((row) => [row.employeeId, row]))
  const attendanceByEmployee = new Map()
  for (const row of attendanceRecords) {
    if (!attendanceByEmployee.has(row.employeeId)) attendanceByEmployee.set(row.employeeId, [])
    attendanceByEmployee.get(row.employeeId).push(row)
  }
  const invoicesByEmployee = new Map()
  for (const row of invoices) {
    const id = row.employeeId
    if (!id) continue
    if (!invoicesByEmployee.has(id)) invoicesByEmployee.set(id, [])
    invoicesByEmployee.get(id).push(row)
  }
  const reviewsByEmployee = new Map()
  for (const row of dayReviews) {
    if (!reviewsByEmployee.has(row.employeeId)) reviewsByEmployee.set(row.employeeId, [])
    reviewsByEmployee.get(row.employeeId).push(row)
  }

  return employees.map((employee) => {
    const status = summarizeEmployeePayroll1Status({
      employee,
      attendanceRecords: attendanceByEmployee.get(employee.id) ?? [],
      invoices: invoicesByEmployee.get(employee.id) ?? [],
      dayReviews: reviewsByEmployee.get(employee.id) ?? [],
      override: overrideByEmployee.get(employee.id) ?? null,
      now,
    })
    return {
      ...status,
      employeeName: employee.name ?? '',
      branchName: employee.branchName ?? '',
    }
  })
}

export async function markPayroll1DayReview({ employeeId, dayDate, reviewStatus }) {
  const employee = getEmployeeById(employeeId) ?? getEmployeeById(getCurrentUserEmployeeId())
  if (!employee?.id) throw new Error('Không xác định được nhân viên.')
  if (reviewStatus !== 'checked' && reviewStatus !== 'no_tour') {
    throw new Error('Trạng thái xác nhận không hợp lệ.')
  }
  const saved = await upsertPayroll1DayReview({
    id: buildDayReviewId(employee.id, dayDate),
    employeeId: employee.id,
    branchId: employee.branchId ?? '',
    dayDate,
    reviewStatus,
    updatedBy: getCurrentUserEmployeeId() || getCurrentUserName() || 'employee',
  })
  notifyDataSynced(['payroll1'])
  return saved
}

export async function setPayroll1EmployeeOverride({
  employeeId,
  manualUnlock,
  adminConfirmed,
}) {
  if (!isAdmin() && !isBranchManager()) {
    throw new Error('Bạn không có quyền cập nhật trạng thái kỳ lương 1.')
  }
  const employee = getEmployeeById(employeeId)
  if (!employee) throw new Error('Không tìm thấy nhân viên.')
  if (isBranchManager() && !isAdmin() && employee.branchId !== getCurrentUserBranch()) {
    throw new Error('Chỉ được xử lý nhân viên thuộc chi nhánh của bạn.')
  }

  const existing = (await fetchPayroll1Overrides({ employeeId }))[0]
  const saved = await upsertPayroll1Override({
    employeeId,
    branchId: employee.branchId ?? '',
    manualUnlock: manualUnlock ?? Boolean(existing?.manualUnlock),
    adminConfirmed: adminConfirmed ?? Boolean(existing?.adminConfirmed),
    updatedBy: getCurrentUserName() || 'admin',
  })
  notifyDataSynced(['payroll1'])
  return saved
}

export async function isEmployeeInvoiceCreateLocked(employeeId, now = new Date()) {
  const status = await loadEmployeePayroll1Status(employeeId, now)
  return Boolean(status?.invoiceCreateLocked)
}
