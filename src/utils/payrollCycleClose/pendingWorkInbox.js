import { isAdmin, isBranchManager, getCurrentUserBranch } from '../../constants/auth'
import { getTodayDate } from '../invoiceStorage'
import { fetchPayrollCycleClosesFiltered } from '../../repositories/payrollCycleCloseRepository'
import { isCloseCyclePendingReview, getCloseCycleStatusLabel } from './closeCycleStatus'
import { CLOSE_CYCLES } from './payCycleCalendar'
import { loadPendingEditRequestsForCurrentManager } from '../attendanceEditRequestService'

export const PENDING_WORK_TYPES = {
  PAYROLL_CLOSE: 'payroll_close',
  ATTENDANCE_CORRECTION: 'attendance_correction',
}

function cycleLabel(cycle) {
  if (cycle === CLOSE_CYCLES.PERIOD_1) return 'Kỳ 1'
  if (cycle === CLOSE_CYCLES.PERIOD_2) return 'Kỳ 2'
  return cycle || '—'
}

function formatMonthVi(billingMonth) {
  if (!billingMonth || billingMonth.length < 7) return billingMonth || '—'
  const [y, m] = billingMonth.split('-')
  return `tháng ${Number(m)}/${y}`
}

function isTodayIso(iso) {
  if (!iso) return false
  return String(iso).slice(0, 10) === getTodayDate()
}

/**
 * Gom việc chờ xử lý cho Admin / QL — một nguồn dữ liệu thật (không nhân đôi phiếu).
 * - Bảng chốt: payroll_cycle_closes status submitted/resubmitted
 * - Sửa chấm công: attendance_correction_requests pending
 */
export async function loadPendingWorkInbox() {
  if (!isAdmin() && !isBranchManager()) {
    return {
      items: [],
      counts: {
        payrollClose: 0,
        attendanceCorrection: 0,
        total: 0,
        newToday: 0,
      },
    }
  }

  const scopedBranch = isAdmin() ? '' : (getCurrentUserBranch() || '')

  const [closes, corrections] = await Promise.all([
    fetchPayrollCycleClosesFiltered({
      branchId: scopedBranch || '',
    }).catch(() => []),
    loadPendingEditRequestsForCurrentManager({
      branchId: scopedBranch || '',
    }).catch(() => []),
  ])

  const payrollItems = (closes ?? [])
    .filter((row) => isCloseCyclePendingReview(row.status))
    .map((row) => {
      const submittedAt = row.resubmittedAt || row.submittedAt || row.updatedAt || ''
      const isResubmit = row.status === 'resubmitted'
      return {
        id: `pcc:${row.id}`,
        type: PENDING_WORK_TYPES.PAYROLL_CLOSE,
        typeLabel: isResubmit ? 'Bảng lương gửi lại' : 'Bảng chốt lương chờ duyệt',
        employeeId: row.employeeId,
        employeeName: row.employeeName || '—',
        branchId: row.branchId || '',
        branchName: row.branchName || '',
        submittedAt,
        status: row.status,
        statusLabel: getCloseCycleStatusLabel(row.status),
        summary: `${row.employeeName || 'NV'} đã gửi bảng chốt lương ${cycleLabel(row.cycle)} ${formatMonthVi(row.billingMonth)}. Vui lòng kiểm tra và duyệt.`,
        isNewToday: isTodayIso(submittedAt),
        actionLabel: 'Xem và xử lý',
        deepLink: {
          page: 'salary',
          payrollCloseReview: {
            employeeId: row.employeeId,
            billingMonth: row.billingMonth,
            cycle: row.cycle,
            closeId: row.id,
          },
        },
        source: row,
      }
    })

  const correctionItems = (corrections ?? []).map((row) => {
    const submittedAt = row.submittedAt || row.createdAt || row.updatedAt || ''
    return {
      id: `acr:${row.id}`,
      type: PENDING_WORK_TYPES.ATTENDANCE_CORRECTION,
      typeLabel: 'Yêu cầu sửa chấm công',
      employeeId: row.employeeId,
      employeeName: row.employeeName || '—',
      branchId: row.branchId || '',
      branchName: row.branchName || '',
      submittedAt,
      status: row.status,
      statusLabel: 'Chờ xử lý',
      summary: `${row.employeeName || 'NV'} yêu cầu sửa chấm công ngày ${formatDisplayDate(row.date)} — ${row.requestedStatusLabel || row.requestedStatus || '—'}.`,
      isNewToday: isTodayIso(submittedAt),
      actionLabel: 'Xem và xử lý',
      deepLink: {
        page: 'attendance',
        attendanceScreen: 'requests',
        requestId: row.id,
      },
      source: row,
    }
  })

  const items = [...payrollItems, ...correctionItems].sort((a, b) => (
    String(b.submittedAt).localeCompare(String(a.submittedAt))
  ))

  return {
    items,
    counts: {
      payrollClose: payrollItems.length,
      attendanceCorrection: correctionItems.length,
      total: items.length,
      newToday: items.filter((item) => item.isNewToday).length,
    },
  }
}

function formatDisplayDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
