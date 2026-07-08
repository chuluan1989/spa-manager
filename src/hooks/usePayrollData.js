import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAttendanceFiltered } from '../repositories/attendanceRepository'
import { fetchInvoicesFiltered } from '../repositories/invoicesRepository'
import {
  fetchPayrollAdjustments,
  fetchPayrollAuditLogs,
  fetchPayrollLocks,
  subscribePayrollChanges,
} from '../repositories/payrollRepository'
import { loadEmployees } from '../utils/employeeStorage'
import { computePayrollReport } from '../utils/payrollEngine'
import { getPayPeriodRange, PAY_CYCLES } from '../utils/salaryReport'

export function usePayrollData({ month, branchId = '', employeeId = '' }) {
  const [invoices, setInvoices] = useState([])
  const [attendance, setAttendance] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [locks, setLocks] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const employees = useMemo(() => loadEmployees(), [loading, month])

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { fromDate, toDate } = getPayPeriodRange(month, PAY_CYCLES.FULL)
      const [invoiceRows, attendanceRows, adjustmentRows, lockRows, auditRows] = await Promise.all([
        fetchInvoicesFiltered({ fromDate, toDate, branchId, employeeId }) ?? [],
        fetchAttendanceFiltered({ fromDate, toDate, branchId, employeeId }),
        fetchPayrollAdjustments({ month, branchId, employeeId }),
        fetchPayrollLocks({ month }),
        fetchPayrollAuditLogs({ limit: 300 }),
      ])
      setInvoices(invoiceRows ?? [])
      setAttendance(attendanceRows ?? [])
      setAdjustments(adjustmentRows ?? [])
      setLocks(lockRows ?? [])
      setAuditLogs(auditRows ?? [])
    } catch (err) {
      setError(err?.message ?? 'Không thể tải dữ liệu lương.')
      setInvoices([])
      setAttendance([])
      setAdjustments([])
      setLocks([])
      setAuditLogs([])
    } finally {
      setLoading(false)
    }
  }, [month, branchId, employeeId])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => subscribePayrollChanges(() => {
    reload()
  }), [reload])

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
