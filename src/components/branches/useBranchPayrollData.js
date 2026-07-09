import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { fetchEmployeesFiltered } from '../../repositories/employeesRepository'
import { fetchAttendanceFiltered } from '../../repositories/attendanceRepository'
import { fetchInvoicesFiltered } from '../../repositories/invoicesRepository'
import {
  fetchPayrollAdjustments,
  fetchPayrollAuditLogs,
  fetchPayrollLocks,
} from '../../repositories/payrollRepository'
import { normalizeEmployee } from '../../utils/employeeStorage'
import { computePayrollReport } from '../../utils/payrollEngine'
import { employeeBelongsToBranch } from '../../utils/branchEmployeeMatch'
import { getPayPeriodRange, PAY_CYCLES } from '../../utils/salaryReport'

/** Lương chi nhánh — fetch only, không subscribe realtime. */
export function useBranchPayrollData({ month, branchId = '', employeeId = '' }) {
  const [invoices, setInvoices] = useState([])
  const [attendance, setAttendance] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [locks, setLocks] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const mountedRef = useRef(true)
  const [employees, setEmployees] = useState([])

  const reload = useCallback(async () => {
    if (!mountedRef.current) return
    setLoading(true)
    setError('')
    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase chưa cấu hình. Không thể tải dữ liệu lương.')
      }

      const { fromDate, toDate } = getPayPeriodRange(month, PAY_CYCLES.FULL)
      const scope = { fromDate, toDate, branchId, employeeId }
      const [remoteInvoices, attendanceRows, adjustmentRows, lockRows, auditRows, remoteEmployees] = await Promise.all([
        fetchInvoicesFiltered(scope),
        fetchAttendanceFiltered(scope),
        fetchPayrollAdjustments({ month, branchId, employeeId }),
        fetchPayrollLocks({ month }),
        fetchPayrollAuditLogs({ limit: 300 }),
        fetchEmployeesFiltered({}),
      ])
      if (!mountedRef.current) return

      setEmployees((remoteEmployees ?? [])
        .map((row) => normalizeEmployee(row))
        .filter((row) => !branchId || employeeBelongsToBranch(row, branchId)))
      setInvoices(Array.isArray(remoteInvoices) ? remoteInvoices : [])
      setAttendance(attendanceRows ?? [])
      setAdjustments(adjustmentRows ?? [])
      setLocks(lockRows ?? [])
      setAuditLogs(auditRows ?? [])
    } catch (err) {
      if (!mountedRef.current) return
      setError(err?.message ?? 'Không thể tải dữ liệu lương.')
      setEmployees([])
      setInvoices([])
      setAttendance([])
      setAdjustments([])
      setLocks([])
      setAuditLogs([])
    } finally {
      if (!mountedRef.current) return
      setLoading(false)
    }
  }, [month, branchId, employeeId])

  useEffect(() => {
    mountedRef.current = true
    reload()
    return () => { mountedRef.current = false }
  }, [reload])

  const report = useMemo(
    () => computePayrollReport({
      month,
      branchId,
      employeeId,
      employees,
      invoices,
      attendanceRecords: attendance,
      adjustments,
    }),
    [month, branchId, employeeId, employees, invoices, attendance, adjustments],
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
    error,
    reload,
  }
}
