import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchEmployeesFiltered } from '../repositories/employeesRepository'
import { fetchAttendanceFiltered, subscribeAttendanceChanges } from '../repositories/attendanceRepository'
import { fetchInvoicesFiltered, subscribeInvoicesChanges } from '../repositories/invoicesRepository'
import {
  fetchPayrollAdjustments,
  fetchPayrollAuditLogs,
  fetchPayrollLocks,
  subscribePayrollChanges,
} from '../repositories/payrollRepository'
import { loadEmployees, normalizeEmployee } from '../utils/employeeStorage'
import { loadInvoices } from '../utils/invoiceStorage'
import { computePayrollReport } from '../utils/payrollEngine'
import { employeeBelongsToBranch } from '../utils/branchEmployeeMatch'
import { filterSalaryInvoices, getPayPeriodRange, PAY_CYCLES } from '../utils/salaryReport'
import { subscribeToDataSync } from '../utils/supabaseSync'

function mergeEmployeeSources(remoteRows, branchId) {
  const localRows = loadEmployees()
    .filter((row) => !branchId || employeeBelongsToBranch(row, branchId))
    .map((row) => normalizeEmployee(row))
  const map = new Map()
  for (const row of localRows) {
    if (row?.id) map.set(row.id, row)
  }
  for (const row of remoteRows ?? []) {
    if (row?.id) map.set(row.id, normalizeEmployee(row))
  }
  return [...map.values()]
}

function mergeInvoiceSources(remoteRows, scope) {
  const localRows = filterSalaryInvoices(loadInvoices(), scope)
  const merged = new Map()

  for (const row of localRows) {
    if (row?.id) merged.set(row.id, row)
  }
  for (const row of remoteRows ?? []) {
    if (row?.id) merged.set(row.id, row)
  }

  return [...merged.values()]
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
      const scope = { fromDate, toDate, branchId, employeeId }
      const [remoteInvoices, attendanceRows, adjustmentRows, lockRows, auditRows, remoteEmployees] = await Promise.all([
        fetchInvoicesFiltered(scope),
        fetchAttendanceFiltered(scope),
        fetchPayrollAdjustments({ month, branchId, employeeId }),
        fetchPayrollLocks({ month }),
        fetchPayrollAuditLogs({ limit: 300 }),
        isSupabaseConfigured
          ? fetchEmployeesFiltered({})
          : Promise.resolve(null),
      ])
      if (!mountedRef.current) return
      setEmployees(mergeEmployeeSources(remoteEmployees, branchId))
      setInvoices(mergeInvoiceSources(remoteInvoices, scope))
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
        setEmployees(mergeEmployeeSources([], branchId))
        setInvoices(mergeInvoiceSources([], { fromDate, toDate, branchId, employeeId }))
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
