import { isAdmin, isBranchManager, getCurrentUserBranch } from '../../constants/auth'
import { getTodayDate } from '../invoiceStorage'
import { fetchPayrollCycleClosesFiltered } from '../../repositories/payrollCycleCloseRepository'
import { isCloseCyclePendingReview, getCloseCycleStatusLabel } from './closeCycleStatus'
import { CLOSE_CYCLES } from './payCycleCalendar'
import { loadPendingEditRequestsForCurrentManager } from '../attendanceEditRequestService'
import { loadPendingInvoiceEditRequestsForManager } from '../invoiceEditRequestService'
import { loadPendingWorkTasksForCurrentUser, WORK_REQUEST_TYPES } from '../workInbox/workInboxService'

export const PENDING_WORK_TYPES = {
  PAYROLL_CLOSE: 'payroll_close',
  ATTENDANCE_CORRECTION: 'attendance_correction',
  INVOICE_EDIT: 'invoice_edit',
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

function formatDisplayDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function mapWorkTaskItem(task) {
  const payload = task.payload || {}
  const type = task.requestType
  let typeLabel = 'Yêu cầu'
  let deepLink = { page: 'reports', reportsTab: 'employee-requests' }
  if (type === WORK_REQUEST_TYPES.PAYROLL_CLOSE || type === PENDING_WORK_TYPES.PAYROLL_CLOSE) {
    typeLabel = 'Bảng chốt lương chờ duyệt'
    deepLink = {
      page: 'salary',
      payrollCloseReview: {
        employeeId: task.employeeId,
        billingMonth: payload.billingMonth,
        cycle: payload.cycle,
        closeId: task.requestId,
      },
    }
  } else if (type === WORK_REQUEST_TYPES.ATTENDANCE_CORRECTION) {
    typeLabel = 'Yêu cầu sửa chấm công'
    deepLink = {
      page: 'attendance',
      attendanceScreen: 'requests',
      requestId: task.requestId,
    }
  } else if (type === WORK_REQUEST_TYPES.INVOICE_EDIT) {
    typeLabel = 'Yêu cầu sửa hóa đơn'
    deepLink = {
      page: 'invoices',
      invoiceId: payload.invoiceId,
      requestId: task.requestId,
      invoiceEditScreen: 'requests',
    }
  }

  return {
    id: `wt:${task.id}`,
    type,
    typeLabel,
    employeeId: task.employeeId,
    employeeName: task.employeeName || '—',
    branchId: task.branchId || '',
    branchName: task.branchName || '',
    submittedAt: task.submittedAt || task.createdAt || '',
    status: task.status,
    statusLabel: 'Chờ xử lý',
    handledBy: task.completedByName || '',
    summary: task.summary || task.title || '',
    isNewToday: isTodayIso(task.submittedAt || task.createdAt),
    actionLabel: 'Xem và xử lý',
    deepLink,
    source: task,
  }
}

/**
 * Ưu tiên work_tasks (Supabase). Fallback nguồn gốc nếu bảng 0040 chưa chạy.
 */
export async function loadPendingWorkInbox() {
  if (!isAdmin() && !isBranchManager()) {
    return {
      items: [],
      counts: {
        payrollClose: 0,
        attendanceCorrection: 0,
        invoiceEdit: 0,
        total: 0,
        newToday: 0,
      },
    }
  }

  const scopedBranch = isAdmin() ? '' : (getCurrentUserBranch() || '')
  const workTasks = await loadPendingWorkTasksForCurrentUser().catch(() => [])

  if (workTasks.length > 0) {
    const items = workTasks.map(mapWorkTaskItem).sort((a, b) => (
      String(b.submittedAt).localeCompare(String(a.submittedAt))
    ))
    return {
      items,
      counts: {
        payrollClose: items.filter((i) => i.type === PENDING_WORK_TYPES.PAYROLL_CLOSE).length,
        attendanceCorrection: items.filter((i) => i.type === PENDING_WORK_TYPES.ATTENDANCE_CORRECTION).length,
        invoiceEdit: items.filter((i) => i.type === PENDING_WORK_TYPES.INVOICE_EDIT).length,
        total: items.length,
        newToday: items.filter((item) => item.isNewToday).length,
      },
    }
  }

  const [closes, corrections, invoiceEdits] = await Promise.all([
    fetchPayrollCycleClosesFiltered({
      branchId: scopedBranch || '',
    }).catch(() => []),
    loadPendingEditRequestsForCurrentManager({
      branchId: scopedBranch || '',
    }).catch(() => []),
    loadPendingInvoiceEditRequestsForManager().catch(() => []),
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
        handledBy: '',
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
    const submittedAt = row.requestedAt || row.submittedAt || row.createdAt || row.updatedAt || ''
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
      handledBy: '',
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

  const invoiceItems = (invoiceEdits ?? []).map((row) => {
    const submittedAt = row.requestedAt || row.createdAt || ''
    return {
      id: `ier:${row.id}`,
      type: PENDING_WORK_TYPES.INVOICE_EDIT,
      typeLabel: 'Yêu cầu sửa hóa đơn',
      employeeId: row.employeeId,
      employeeName: row.employeeName || '—',
      branchId: row.branchId || '',
      branchName: row.branchName || '',
      submittedAt,
      status: row.status,
      statusLabel: 'Chờ xử lý',
      handledBy: '',
      summary: `${row.employeeName || 'NV'} yêu cầu sửa hóa đơn ${row.invoiceId} ngày ${formatDisplayDate(row.invoiceDate)}.`,
      isNewToday: isTodayIso(submittedAt),
      actionLabel: 'Xem và xử lý',
      deepLink: {
        page: 'invoices',
        invoiceId: row.invoiceId,
        requestId: row.id,
        invoiceEditScreen: 'requests',
      },
      source: row,
    }
  })

  const items = [...payrollItems, ...correctionItems, ...invoiceItems].sort((a, b) => (
    String(b.submittedAt).localeCompare(String(a.submittedAt))
  ))

  return {
    items,
    counts: {
      payrollClose: payrollItems.length,
      attendanceCorrection: correctionItems.length,
      invoiceEdit: invoiceItems.length,
      total: items.length,
      newToday: items.filter((item) => item.isNewToday).length,
    },
  }
}
