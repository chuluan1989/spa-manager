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
import { computePayrollReport } from '../utils/payrollEngine'
import { employeeBelongsToBranch } from '../utils/branchEmployeeMatch'
import { getPayPeriodRange, PAY_CYCLES } from '../utils/salaryReport'
import { subscribeToDataSync } from '../utils/supabaseSync'

export function usePayrollData({ month, branchId = '', employeeId = '', cycle = PAY_CYCLES.PERIOD_1 }) {
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

      const invoiceRange = getPayPeriodRange(month, cycle)
      const scope = { fromDate: invoiceRange.fromDate, toDate: invoiceRange.toDate, branchId, employeeId }

      // Attendance rules:
      // - Kỳ 1: vẫn lấy attendance theo 01–15 để hiển thị thống kê/ngày công,
      //         nhưng không trừ tiền chấm công => penaltyAmount = 0.
      // - Kỳ 2: lấy attendance cả tháng để tổng hợp toàn bộ khoản bị trừ vào Kỳ 2.
      const attendanceCycle = cycle === PAY_CYCLES.PERIOD_2 ? PAY_CYCLES.FULL : PAY_CYCLES.PERIOD_1
      const attendanceRange = getPayPeriodRange(month, attendanceCycle)
      const attendanceScope = {
        fromDate: attendanceRange.fromDate,
        toDate: attendanceRange.toDate,
        branchId,
        employeeId,
      }
      const [remoteInvoices, attendanceRows, adjustmentRows, lockRows, auditRows, remoteEmployees] = await Promise.all([
        fetchInvoicesFiltered(scope),
        fetchAttendanceFiltered(attendanceScope),
        fetchPayrollAdjustments({ month, branchId, employeeId }),
        fetchPayrollLocks({ month }),
        fetchPayrollAuditLogs({ limit: 300 }),
        fetchEmployeesFiltered({}),
      ])
      if (!mountedRef.current) return

      const nextEmployees = (remoteEmployees ?? [])
        .map((row) => normalizeEmployee(row))
        .filter((row) => !branchId || employeeBelongsToBranch(row, branchId))

      setEmployees(nextEmployees)
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
  }, [month, branchId, employeeId, cycle])

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

  const report = useMemo(
    () => computePayrollReport({
      month,
      cycle,
      branchId,
      employeeId,
      employees,
      invoices,
      attendanceRecords: attendance,
      adjustments,
    }),
    [month, cycle, branchId, employeeId, employees, invoices, attendance, adjustments],
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
