import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchAttendanceFiltered, subscribeAttendanceChanges } from '../repositories/attendanceRepository'
import { fetchInvoicesFiltered, subscribeInvoicesChanges } from '../repositories/invoicesRepository'
import {
  fetchPayrollAdjustments,
  fetchPayrollAuditLogs,
  fetchPayrollLocks,
  subscribePayrollChanges,
} from '../repositories/payrollRepository'
import { loadEmployees } from '../utils/employeeStorage'
import { loadInvoices } from '../utils/invoiceStorage'
import { computePayrollReport } from '../utils/payrollEngine'
import { filterSalaryInvoices, getPayPeriodRange, PAY_CYCLES } from '../utils/salaryReport'
import { subscribeToDataSync } from '../utils/supabaseSync'

function resolveInvoiceRows(remoteRows, { fromDate, toDate, branchId, employeeId }) {
  if (Array.isArray(remoteRows) && remoteRows.length > 0) {
    return remoteRows
  }
  return filterSalaryInvoices(loadInvoices(), { fromDate, toDate, branchId, employeeId })
}

export function usePayrollData({ month, branchId = '', employeeId = '' }) {
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

  const [employees, setEmployees] = useState(() => loadEmployees())

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!mountedRef.current) return
    if (silent) setIsRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const { fromDate, toDate } = getPayPeriodRange(month, PAY_CYCLES.FULL)
      const [remoteInvoices, attendanceRows, adjustmentRows, lockRows, auditRows] = await Promise.all([
        fetchInvoicesFiltered({ fromDate, toDate, branchId, employeeId }),
        fetchAttendanceFiltered({ fromDate, toDate, branchId, employeeId }),
        fetchPayrollAdjustments({ month, branchId, employeeId }),
        fetchPayrollLocks({ month }),
        fetchPayrollAuditLogs({ limit: 300 }),
      ])
      if (!mountedRef.current) return
      setEmployees(loadEmployees())
      setInvoices(resolveInvoiceRows(remoteInvoices, { fromDate, toDate, branchId, employeeId }))
      setAttendance(attendanceRows ?? [])
      setAdjustments(adjustmentRows ?? [])
      setLocks(lockRows ?? [])
      setAuditLogs(auditRows ?? [])
      setLiveUpdatedAt(new Date())
    } catch (err) {
      if (!mountedRef.current) return
      setError(err?.message ?? 'Không thể tải dữ liệu lương.')
      if (!silent) {
        const { fromDate, toDate } = getPayPeriodRange(month, PAY_CYCLES.FULL)
        setInvoices(filterSalaryInvoices(loadInvoices(), { fromDate, toDate, branchId, employeeId }))
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
  }, [month, branchId, employeeId])

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
    const unsubDataSync = subscribeToDataSync(onLiveChange)
    return () => {
      unsubPayroll()
      unsubAttendance()
      unsubInvoices()
      unsubDataSync()
    }
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
    isRefreshing,
    error,
    liveUpdatedAt,
    reload,
  }
}
