import { resolveCanonicalBranchId } from '../constants/canonicalBranches'
import { getEmployeeBranchAtDate } from './employeeBranchTimeline'

const MONEY_TOLERANCE = 0.5

/**
 * Identity của một lượt dịch vụ.
 * services[].id là duration id của catalog (body-60, combo-1, …).
 * Cùng id ở hai chi nhánh có thể là hai dịch vụ khác nhau, nên khóa luôn kèm chi nhánh phục vụ.
 */
export function serviceOccurrenceKey(servingBranchId, line) {
  const branch = resolveCanonicalBranchId(servingBranchId) || String(servingBranchId || '').trim() || 'unknown'
  const id = String(line?.id || line?.serviceId || '').trim()
  if (id) return `${branch}::${id}`
  const name = String(line?.name || line?.serviceName || '').trim()
  return `${branch}::name:${name || 'unknown'}`
}

export function resolveServicePerformanceAccess({
  admin = false,
  sessionBranchId = '',
  requestedBranchId = '',
} = {}) {
  if (!admin) {
    const locked = resolveCanonicalBranchId(sessionBranchId) || String(sessionBranchId || '').trim()
    return {
      admin: false,
      blocked: !locked,
      servingBranchId: locked,
      homeBranchId: locked,
      branchSelectable: false,
    }
  }
  const selected = resolveCanonicalBranchId(requestedBranchId) || String(requestedBranchId || '').trim()
  return {
    admin: true,
    blocked: false,
    servingBranchId: selected,
    homeBranchId: selected,
    branchSelectable: true,
  }
}

function inDateRange(invoice, fromDate, toDate) {
  const date = String(invoice?.date || '').slice(0, 10)
  if (fromDate && date < fromDate) return false
  if (toDate && date > toDate) return false
  return Boolean(date)
}

function linePrice(line) {
  const price = Number(line?.price ?? 0)
  return Number.isFinite(price) ? price : 0
}

function snapshotName(line) {
  return String(line?.name || line?.serviceName || line?.id || line?.serviceId || '').trim()
}

function mostCommonName(names) {
  const counts = new Map()
  for (const name of names) {
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  let best = ''
  let bestCount = 0
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name
      bestCount = count
    }
  }
  return best
}

function catalogEntry(catalogByBranch, branchId, serviceId) {
  const list = catalogByBranch?.[branchId] || []
  return list.find((item) => item.id === serviceId) || null
}

function displayNameForColumn(column, columns) {
  const sameIdElsewhere = columns.some((other) => (
    other.key !== column.key
    && column.serviceId
    && other.serviceId === column.serviceId
  ))
  if (sameIdElsewhere) return `${column.name} · ${column.branchName || column.branchId}`
  const sameName = columns.some((other) => other.key !== column.key && other.name === column.name)
  if (sameName && column.serviceId) return `${column.name} (${column.serviceId})`
  return column.name
}

function compareRank(a, b, sortKey, sortDir) {
  const dir = sortDir === 'asc' ? 1 : -1
  const av = sortKey === 'name'
    ? a.employeeName
    : Number(a.sortValue ?? 0)
  const bv = sortKey === 'name'
    ? b.employeeName
    : Number(b.sortValue ?? 0)
  if (typeof av === 'string' || typeof bv === 'string') {
    const byName = String(av).localeCompare(String(bv), 'vi')
    if (byName) return byName * dir
  } else if (av !== bv) {
    return (av - bv) * dir
  }
  return String(a.employeeName).localeCompare(String(b.employeeName), 'vi')
}

export function reconcileInvoiceServiceTotals(invoices = []) {
  const discrepancies = []
  for (const invoice of invoices) {
    const lines = Array.isArray(invoice?.services) ? invoice.services : []
    const lineSum = lines.reduce((sum, line) => sum + linePrice(line), 0)
    if (!Number.isFinite(invoice?.serviceTotal)) continue
    const header = Number(invoice.serviceTotal)
    const delta = Math.round((header - lineSum) * 100) / 100
    if (Math.abs(delta) > MONEY_TOLERANCE) {
      discrepancies.push({
        invoiceId: invoice.id || '',
        date: String(invoice.date || '').slice(0, 10),
        serviceTotal: header,
        lineSum,
        delta,
      })
    }
  }
  return discrepancies
}

function collectColumns({ invoices, catalogByBranch, branchNames }) {
  const columns = new Map()

  const ensure = (branchId, serviceId, name, sortOrder, fromCatalog) => {
    const key = serviceOccurrenceKey(branchId, { id: serviceId, name })
    const current = columns.get(key) ?? {
      key,
      branchId,
      branchName: branchNames?.[branchId] || branchId,
      serviceId: serviceId || '',
      name: name || serviceId || 'Dịch vụ',
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100000,
      fromCatalog: false,
      snapshotNames: [],
    }
    if (fromCatalog) {
      current.fromCatalog = true
      current.name = name || current.name
      current.sortOrder = Number.isFinite(sortOrder) ? sortOrder : current.sortOrder
    } else if (name) {
      current.snapshotNames.push(name)
    }
    columns.set(key, current)
    return current
  }

  for (const [branchId, services] of Object.entries(catalogByBranch || {})) {
    services.forEach((service, index) => {
      ensure(
        branchId,
        service.id,
        service.name,
        service.sortOrder ?? index,
        true,
      )
    })
  }

  for (const invoice of invoices) {
    const branchId = resolveCanonicalBranchId(invoice.branchId) || invoice.branchId || 'unknown'
    for (const line of invoice.services || []) {
      const serviceId = String(line?.id || line?.serviceId || '').trim()
      const name = snapshotName(line)
      const column = ensure(branchId, serviceId, name, undefined, false)
      if (!column.fromCatalog && name) column.snapshotNames.push(name)
    }
  }

  const list = [...columns.values()].map((column) => {
    if (!column.fromCatalog) {
      column.name = mostCommonName(column.snapshotNames) || column.name
    }
    return column
  })
  list.sort((a, b) => (
    String(a.branchName).localeCompare(String(b.branchName), 'vi')
    || a.sortOrder - b.sortOrder
    || String(a.name).localeCompare(String(b.name), 'vi')
  ))
  return list.map((column) => ({
    ...column,
    label: displayNameForColumn(column, list),
  }))
}

export function buildServiceBranchReport({
  invoices = [],
  servingBranchId = '',
  fromDate = '',
  toDate = '',
  catalogByBranch = {},
  branchNames = {},
} = {}) {
  const scoped = (invoices || []).filter((invoice) => {
    if (!inDateRange(invoice, fromDate, toDate)) return false
    if (!servingBranchId) return true
    const branch = resolveCanonicalBranchId(invoice.branchId) || invoice.branchId
    return branch === servingBranchId
  })

  const catalogScope = servingBranchId
    ? { [servingBranchId]: catalogByBranch[servingBranchId] || [] }
    : catalogByBranch

  const columns = collectColumns({
    invoices: scoped,
    catalogByBranch: catalogScope,
    branchNames,
  })
  const byKey = new Map(columns.map((column) => [column.key, {
    ...column,
    quantity: 0,
    revenue: 0,
  }]))

  let totalQuantity = 0
  let totalRevenue = 0
  for (const invoice of scoped) {
    const branchId = resolveCanonicalBranchId(invoice.branchId) || invoice.branchId || 'unknown'
    for (const line of invoice.services || []) {
      const key = serviceOccurrenceKey(branchId, line)
      const row = byKey.get(key)
      if (!row) continue
      const price = linePrice(line)
      row.quantity += 1
      row.revenue += price
      totalQuantity += 1
      totalRevenue += price
    }
  }

  const rows = [...byKey.values()].map((row) => ({
    key: row.key,
    serviceId: row.serviceId,
    name: row.label,
    serviceName: row.name,
    branchId: row.branchId,
    branchName: row.branchName,
    quantity: row.quantity,
    revenue: row.revenue,
    share: totalQuantity > 0 ? row.quantity / totalQuantity : 0,
    fromCatalog: row.fromCatalog,
  }))

  return {
    rows,
    totalQuantity,
    totalRevenue,
    invoiceCount: scoped.length,
    missingEmployeeInvoiceCount: scoped.filter((invoice) => !String(invoice.employeeId || '').trim()).length,
    discrepancies: reconcileInvoiceServiceTotals(scoped),
  }
}

function employeeHomeBranch(employee) {
  return resolveCanonicalBranchId(employee?.branchId) || String(employee?.branchId || '').trim()
}

export function isCrossBranchInvoice(employee, invoice) {
  const serving = resolveCanonicalBranchId(invoice?.branchId) || String(invoice?.branchId || '').trim()
  const home = getEmployeeBranchAtDate(employee, invoice?.date)
    || employeeHomeBranch(employee)
  return Boolean(serving && home && serving !== home)
}

export function buildEmployeeServiceRanking({
  invoices = [],
  employees = [],
  homeBranchId = '',
  fromDate = '',
  toDate = '',
  catalogByBranch = {},
  branchNames = {},
  sortKey = 'revenue',
  sortDir = 'desc',
} = {}) {
  const roster = (employees || []).filter((employee) => {
    if (!employee?.id || employee.status === 'deleted') return false
    if (!homeBranchId) return true
    return employeeHomeBranch(employee) === homeBranchId
  })
  const rosterIds = new Set(roster.map((employee) => employee.id))
  const scoped = (invoices || []).filter((invoice) => {
    if (!inDateRange(invoice, fromDate, toDate)) return false
    const employeeId = String(invoice.employeeId || '').trim()
    return Boolean(employeeId && rosterIds.has(employeeId))
  })

  const servingBranches = new Set(scoped.map((invoice) => (
    resolveCanonicalBranchId(invoice.branchId) || invoice.branchId
  )).filter(Boolean))
  if (homeBranchId) servingBranches.add(homeBranchId)
  const catalogScope = {}
  for (const branchId of servingBranches) {
    if (catalogByBranch[branchId]) catalogScope[branchId] = catalogByBranch[branchId]
  }
  for (const employee of roster) {
    const branchId = employeeHomeBranch(employee)
    if (branchId && catalogByBranch[branchId]) catalogScope[branchId] = catalogByBranch[branchId]
  }

  const columns = collectColumns({
    invoices: scoped,
    catalogByBranch: catalogScope,
    branchNames,
  })

  const rows = roster.map((employee) => {
    const own = scoped.filter((invoice) => invoice.employeeId === employee.id)
    const quantities = Object.fromEntries(columns.map((column) => [column.key, 0]))
    let quantity = 0
    let revenue = 0
    let crossBranchInvoiceCount = 0
    for (const invoice of own) {
      if (isCrossBranchInvoice(employee, invoice)) crossBranchInvoiceCount += 1
      const branchId = resolveCanonicalBranchId(invoice.branchId) || invoice.branchId || 'unknown'
      for (const line of invoice.services || []) {
        const key = serviceOccurrenceKey(branchId, line)
        if (quantities[key] == null) continue
        quantities[key] += 1
        quantity += 1
        revenue += linePrice(line)
      }
    }
    const home = employeeHomeBranch(employee)
    return {
      employeeId: employee.id,
      employeeName: employee.name || employee.id,
      homeBranchId: home,
      homeBranchName: branchNames[home] || employee.branchName || home || '—',
      quantity,
      revenue,
      quantities,
      crossBranchInvoiceCount,
      invoiceCount: own.length,
    }
  })

  const decorated = rows.map((row) => ({
    ...row,
    sortValue: sortKey === 'quantity'
      ? row.quantity
      : sortKey.startsWith('svc:')
        ? (row.quantities[sortKey.slice(4)] ?? 0)
        : row.revenue,
  }))
  decorated.sort((a, b) => compareRank(a, b, sortKey, sortDir))

  return {
    columns,
    rows: decorated.map((row, index) => ({ ...row, rank: index + 1 })),
    discrepancies: reconcileInvoiceServiceTotals(scoped),
    missingEmployeeInvoiceCount: (invoices || []).filter((invoice) => (
      inDateRange(invoice, fromDate, toDate) && !String(invoice.employeeId || '').trim()
    )).length,
  }
}

export function buildEmployeeServiceDetail({
  invoices = [],
  employee,
  fromDate = '',
  toDate = '',
  catalogByBranch = {},
  branchNames = {},
} = {}) {
  if (!employee?.id) {
    return {
      quantity: 0,
      revenue: 0,
      services: [],
      servingBranches: [],
      crossBranchInvoiceCount: 0,
    }
  }
  const own = (invoices || []).filter((invoice) => (
    inDateRange(invoice, fromDate, toDate) && invoice.employeeId === employee.id
  ))
  const ranking = buildEmployeeServiceRanking({
    invoices: own,
    employees: [employee],
    fromDate,
    toDate,
    catalogByBranch,
    branchNames,
  })
  const row = ranking.rows[0]
  const branches = new Map()
  for (const invoice of own) {
    const branchId = resolveCanonicalBranchId(invoice.branchId) || invoice.branchId || 'unknown'
    const current = branches.get(branchId) ?? {
      branchId,
      branchName: invoice.branchName || branchNames[branchId] || branchId,
      invoiceCount: 0,
      quantity: 0,
      revenue: 0,
    }
    current.invoiceCount += 1
    for (const line of invoice.services || []) {
      current.quantity += 1
      current.revenue += linePrice(line)
    }
    branches.set(branchId, current)
  }
  return {
    employeeId: employee.id,
    employeeName: employee.name || employee.id,
    homeBranchId: row?.homeBranchId || '',
    homeBranchName: row?.homeBranchName || '',
    quantity: row?.quantity ?? 0,
    revenue: row?.revenue ?? 0,
    services: (ranking.columns || []).map((column) => ({
      key: column.key,
      name: column.label,
      quantity: row?.quantities?.[column.key] ?? 0,
      revenue: own.reduce((sum, invoice) => {
        const branchId = resolveCanonicalBranchId(invoice.branchId) || invoice.branchId
        return sum + (invoice.services || []).reduce((lineSum, line) => (
          serviceOccurrenceKey(branchId, line) === column.key ? lineSum + linePrice(line) : lineSum
        ), 0)
      }, 0),
    })).filter((service) => service.quantity > 0),
    servingBranches: [...branches.values()].sort((a, b) => b.revenue - a.revenue),
    crossBranchInvoiceCount: row?.crossBranchInvoiceCount ?? 0,
  }
}
