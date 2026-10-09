import { useEffect, useMemo, useState } from 'react'
import { fetchInvoiceServiceLines } from '../repositories/invoicesRepository'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { resolveCanonicalBranchId } from '../constants/canonicalBranches'
import { loadBranches } from '../utils/branchStorage'
import { loadEmployees } from '../utils/employeeStorage'
import { getActiveServicesForBranch } from '../utils/serviceStorage'
import {
  buildEmployeeServiceRanking,
  buildServiceBranchReport,
  resolveServicePerformanceAccess,
} from '../utils/servicePerformanceReport'

function reportCatalogName(service) {
  const name = String(service?.name || '')
  const match = name.match(/^(.*) (\d+)['’′]$/)
  if (!match) return name
  if (match[1].includes(match[2])) return match[1]
  return name
}

function readCatalogMap(branchIds) {
  const map = {}
  for (const branchId of branchIds) {
    map[branchId] = getActiveServicesForBranch(branchId).map((service, index) => ({
      id: service.id,
      name: reportCatalogName(service),
      sortOrder: index,
    }))
  }
  return map
}

export function useServicePerformanceData({
  enabled = false,
  fromDate = '',
  toDate = '',
  requestedBranchId = '',
  admin = false,
  sessionBranchId = '',
  sortKey = 'revenue',
  sortDir = 'desc',
} = {}) {
  const access = resolveServicePerformanceAccess({
    admin,
    sessionBranchId,
    requestedBranchId,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [serviceInvoices, setServiceInvoices] = useState([])
  const [rankingInvoices, setRankingInvoices] = useState([])
  const [employees, setEmployees] = useState([])
  const [catalogByBranch, setCatalogByBranch] = useState({})
  const [branchNames, setBranchNames] = useState({})

  useEffect(() => {
    if (!enabled) return undefined
    if (access.blocked) {
      setError('Không xác định được chi nhánh của tài khoản quản lý.')
      setServiceInvoices([])
      setRankingInvoices([])
      return undefined
    }
    if (!fromDate || !toDate) {
      setError('Chọn từ ngày và đến ngày trước khi tải báo cáo.')
      setServiceInvoices([])
      setRankingInvoices([])
      return undefined
    }

    const branches = loadBranches().filter((branch) => branch?.id)
    const names = Object.fromEntries(branches.map((branch) => [branch.id, branch.name || branch.id]))
    const roster = loadEmployees().filter((employee) => employee?.id && employee.status !== 'deleted')
    const homeId = resolveCanonicalBranchId(access.homeBranchId) || access.homeBranchId
    const homeRoster = homeId
      ? roster.filter((employee) => (
        (resolveCanonicalBranchId(employee.branchId) || employee.branchId) === homeId
      ))
      : roster
    const catalogIds = branches.map((branch) => branch.id)
    setBranchNames(names)
    setEmployees(homeRoster)
    setCatalogByBranch(readCatalogMap(catalogIds))

    let cancelled = false
    setLoading(true)
    setError('')

    async function load() {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase chưa cấu hình. Không thể tải báo cáo dịch vụ.')
      }
      const serviceRows = await fetchInvoiceServiceLines({
        fromDate,
        toDate,
        branchId: access.servingBranchId,
      })
      const rankingRows = access.homeBranchId
        ? await fetchInvoiceServiceLines({
          fromDate,
          toDate,
          employeeIds: homeRoster.map((employee) => employee.id),
        })
        : serviceRows
      if (cancelled) return
      setServiceInvoices(serviceRows)
      setRankingInvoices(rankingRows)
    }

    load()
      .catch((err) => {
        if (cancelled) return
        setError(err?.message || 'Không thể tải báo cáo dịch vụ.')
        setServiceInvoices([])
        setRankingInvoices([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    enabled,
    fromDate,
    toDate,
    access.blocked,
    access.servingBranchId,
    access.homeBranchId,
  ])

  const serviceReport = useMemo(() => buildServiceBranchReport({
    invoices: serviceInvoices,
    servingBranchId: access.servingBranchId,
    fromDate,
    toDate,
    catalogByBranch,
    branchNames,
  }), [serviceInvoices, access.servingBranchId, fromDate, toDate, catalogByBranch, branchNames])

  const ranking = useMemo(() => buildEmployeeServiceRanking({
    invoices: rankingInvoices,
    employees,
    homeBranchId: access.homeBranchId,
    fromDate,
    toDate,
    catalogByBranch,
    branchNames,
    sortKey,
    sortDir,
  }), [
    rankingInvoices,
    employees,
    access.homeBranchId,
    fromDate,
    toDate,
    catalogByBranch,
    branchNames,
    sortKey,
    sortDir,
  ])

  return {
    access,
    loading,
    error,
    serviceReport,
    ranking,
    rankingInvoices,
    employees,
    catalogByBranch,
    branchNames,
  }
}
