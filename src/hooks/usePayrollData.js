import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchEmployeesFiltered, subscribeEmployeesChanges } from '../repositories/employeesRepository'
import { fetchAttendanceFiltered, subscribeAttendanceChanges } from '../repositories/attendanceRepository'
import { fetchInvoicesFiltered, subscribeInvoicesChanges } from '../repositories/invoicesRepository'
import {
  fetchPayrollAdjustments,
  fetchPayrollAuditLogs,
  fetchPayrollLocks,
  subscribePayrollChanges,
} from '../repositories/payrollRepository'
import { normalizeEmployee } from '../utils/employeeStorage'
import { filterEmployeesForBranchRoster } from '../contracts/recordFetchRoster'
import { computePayrollReport } from '../utils/payrollEngine'
import { isPayrollListEmployee } from '../utils/branchEmployeeMatch'
import { getPayPeriodRange, PAY_CYCLES } from '../utils/salaryReport'
import { subscribeToDataSync } from '../utils/supabaseSync'
import { getRecordFetchFilters, RECORD_FETCH_USE_CASES } from '../constants/auth'

/**
 * @param {object} params
 * @param {boolean} [params.employeeWide=false]
 *   true = tải phát sinh cả kỳ (mọi CN) để net/HH/tips khớp màn hình chi tiết.
 * @param {boolean} [params.keepBranchRoster=false]
 *   Khi xem 1 NV vẫn giữ roster CN cho dropdown chuyển NV.
 * @param {string} [params.rosterBranchId='']
 */
export function usePayrollData({
  month,
  branchId = '',
  employeeId = '',
  cycle = PAY_CYCLES.PERIOD_1,
  employeeWide = false,
  keepBranchRoster = false,
  rosterBranchId = '',
}) {
  const [invoices, setInvoices] = useState([])
  const [attendance, setAttendance] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [locks, setLocks] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(null)
  const mountedRef = useRef(true)

  const [employees, setEmployees] = useState([])

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!mountedRef.current) return
    if (silent) setIsRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase chưa cấu hình. Không thể tải dữ liệu lương.')
      }

      // Danh sách tổng: lấy cả kỳ mọi CN để net = chi tiết (gồm hỗ trợ).
      // Profile 1 NV: vẫn BY_EMPLOYEE_ID (branchId rỗng) qua VIEW_SINGLE_EMPLOYEE_HISTORY.
      const useCase = employeeWide && !employeeId
        ? RECORD_FETCH_USE_CASES.VIEW_SYSTEM_HISTORY
        : RECORD_FETCH_USE_CASES.VIEW_SINGLE_EMPLOYEE_HISTORY

      const historyScope = getRecordFetchFilters(useCase, {
        selectedBranchId: employeeWide && !employeeId ? '' : branchId,
        selectedEmployeeId: employeeId,
      })
      const { branchId: recordBranchFilter, employeeId: scopedEmployeeId } = historyScope.filters
      const invoiceRange = getPayPeriodRange(month, cycle)
      const scope = {
        fromDate: invoiceRange.fromDate,
        toDate: invoiceRange.toDate,
        branchId: recordBranchFilter,
        employeeId: scopedEmployeeId || employeeId,
      }

      const attendanceCycle = cycle === PAY_CYCLES.PERIOD_2 ? PAY_CYCLES.FULL : PAY_CYCLES.PERIOD_1
      const attendanceRange = getPayPeriodRange(month, attendanceCycle)
      const attendanceScope = {
        fromDate: attendanceRange.fromDate,
        toDate: attendanceRange.toDate,
        branchId: recordBranchFilter,
        employeeId: scopedEmployeeId || employeeId,
      }
      const [remoteInvoices, attendanceRows, adjustmentRows, lockRows, auditRows, remoteEmployees] = await Promise.all([
        fetchInvoicesFiltered(scope),
        fetchAttendanceFiltered(attendanceScope),
        fetchPayrollAdjustments({
          month,
          branchId: recordBranchFilter,
          employeeId: scopedEmployeeId || employeeId,
        }),
        fetchPayrollLocks({ month }),
        fetchPayrollAuditLogs({ limit: 300 }),
        fetchEmployeesFiltered({}),
      ])
      if (!mountedRef.current) return

      const rosterFilterBranch = keepBranchRoster
        ? (rosterBranchId || branchId)
        : (employeeId ? '' : branchId)

      let nextEmployees = filterEmployeesForBranchRoster({
        employees: (remoteEmployees ?? []).map((row) => normalizeEmployee(row)),
        branchId: rosterFilterBranch,
        activityRecords: [
          ...(Array.isArray(remoteInvoices) ? remoteInvoices : []),
          ...(Array.isArray(attendanceRows) ? attendanceRows : []),
          ...(adjustmentRows ?? []),
        ],
      })

      if (employeeId && !keepBranchRoster) {
        nextEmployees = nextEmployees.filter((row) => row.id === employeeId)
      } else if (employeeId && keepBranchRoster) {
        const exists = nextEmployees.some((row) => row.id === employeeId)
        if (!exists) {
          const self = (remoteEmployees ?? [])
            .map((row) => normalizeEmployee(row))
            .find((row) => row.id === employeeId)
          if (self) nextEmployees = [...nextEmployees, self]
        }
      }

      setEmployees(nextEmployees.filter((row) => isPayrollListEmployee(row, '') || row.id === employeeId))
      setInvoices(Array.isArray(remoteInvoices) ? remoteInvoices : [])

      const normalizedAttendance = Array.isArray(attendanceRows) ? attendanceRows : []
      if (cycle === PAY_CYCLES.PERIOD_1) {
        setAttendance(normalizedAttendance.map((row) => ({ ...row, penaltyAmount: 0 })))
      } else {
        setAttendance(normalizedAttendance)
      }
      setAdjustments(adjustmentRows ?? [])
      setLocks(lockRows ?? [])
      setAuditLogs(auditRows ?? [])
      setLiveUpdatedAt(new Date())
    } catch (err) {
      if (!mountedRef.current) return
      setError(err?.message ?? 'Không thể tải dữ liệu lương.')
      if (!silent) {
        setEmployees([])
        setInvoices([])
        setAttendance([])
        setAdjustments([])
        setLocks([])
        setAuditLogs([])
      }
    } finally {
      if (!mountedRef.current) return
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [month, branchId, employeeId, cycle, employeeWide, keepBranchRoster, rosterBranchId])

  useEffect(() => {
    mountedRef.current = true
    reload()
    return () => {
      mountedRef.current = false
    }
  }, [reload])

  useEffect(() => {
    const onLiveChange = () => reload({ silent: true })
    const unsubPayroll = subscribePayrollChanges(onLiveChange)
    const unsubAttendance = subscribeAttendanceChanges(onLiveChange)
    const unsubInvoices = subscribeInvoicesChanges(onLiveChange)
    const unsubEmployees = subscribeEmployeesChanges(onLiveChange)
    const unsubDataSync = subscribeToDataSync(onLiveChange)
    return () => {
      unsubPayroll()
      unsubAttendance()
      unsubInvoices()
      unsubEmployees()
      unsubDataSync()
    }
  }, [reload])

  const reportBranchFilter = (employeeId || employeeWide) ? '' : branchId

  const report = useMemo(
    () => computePayrollReport({
      month,
      cycle,
      branchId: reportBranchFilter,
      // Roster + employee-wide rows: không cắt report còn 1 NV khi đang profile + switcher
      employeeId: keepBranchRoster ? '' : employeeId,
      employees,
      invoices,
      attendanceRecords: attendance,
      adjustments,
    }),
    [month, cycle, reportBranchFilter, employeeId, keepBranchRoster, employees, invoices, attendance, adjustments],
  )

  return {
    employees,
    invoices,
    attendance,
    adjustments,
    locks,
    auditLogs,
    report,
    loading,
    isRefreshing,
    error,
    liveUpdatedAt,
    reload,
  }
}
