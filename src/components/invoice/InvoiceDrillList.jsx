import { useMemo, useState } from 'react'
import InvoiceFilters from './InvoiceFilters'
import InvoiceList from './InvoiceList'
import ErpBranchCardGrid from '../erp/ErpBranchCardGrid'
import ErpBreadcrumb from '../erp/ErpBreadcrumb'
import { canSelectBranch, getCurrentUserBranch, isAdmin, isEmployee } from '../../constants/auth'
import { getActiveBranches } from '../../constants/branches'
import { getActiveEmployeesByBranch } from '../../utils/employeeStorage'
import { formatCurrency } from '../../utils/invoice'
import { filterInvoices, hasActiveInvoiceFilters, sortInvoicesDesc } from '../../utils/invoiceFilters'
import {
  aggregateInvoiceBranchSummaries,
  aggregateInvoiceEmployeeSummaries,
  formatInvoiceBranchStats,
} from '../../utils/invoiceViewHelpers'

const LEVEL = { BRANCHES: 'branches', EMPLOYEES: 'employees', INVOICES: 'invoices' }

function getInitialLevel() {
  if (isAdmin()) return LEVEL.BRANCHES
  if (isEmployee()) return LEVEL.INVOICES
  return LEVEL.EMPLOYEES
}

export default function InvoiceDrillList({
  invoices,
  filters,
  onChangeFilters,
  onResetFilters,
  lockedBranch,
  branchName,
  serviceOptions,
  page,
  onPageChange,
  onDelete,
  onEdit,
  onView,
  allowDelete,
  canEdit,
}) {
  const [level, setLevel] = useState(getInitialLevel)
  const [selectedBranchId, setSelectedBranchId] = useState(() =>
    (canSelectBranch() ? '' : getCurrentUserBranch()),
  )
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')

  const visibleBranches = useMemo(() => {
    const all = getActiveBranches()
    if (isAdmin()) return all
    return all.filter((b) => b.id === getCurrentUserBranch())
  }, [])

  const branchSummaries = useMemo(
    () => aggregateInvoiceBranchSummaries(visibleBranches, invoices),
    [visibleBranches, invoices],
  )

  const employeeRows = useMemo(
    () => aggregateInvoiceEmployeeSummaries(invoices, selectedBranchId || getCurrentUserBranch()),
    [invoices, selectedBranchId],
  )

  const scopedInvoices = useMemo(() => {
    let rows = invoices
    const branch = selectedBranchId || (lockedBranch ? getCurrentUserBranch() : filters.branchId)
    if (branch) rows = rows.filter((inv) => inv.branchId === branch)
    if (selectedEmployeeId) {
      rows = rows.filter((inv) =>
        inv.employeeId === selectedEmployeeId || inv.supportEmployeeId === selectedEmployeeId,
      )
    }
    return rows
  }, [invoices, selectedBranchId, selectedEmployeeId, filters.branchId, lockedBranch])

  const effectiveFilters = useMemo(() => ({
    ...filters,
    branchId: selectedBranchId || filters.branchId,
    employeeId: selectedEmployeeId || filters.employeeId,
  }), [filters, selectedBranchId, selectedEmployeeId])

  const filteredInvoices = useMemo(
    () => sortInvoicesDesc(filterInvoices(scopedInvoices, effectiveFilters)),
    [scopedInvoices, effectiveFilters],
  )

  const breadcrumbItems = useMemo(() => {
    if (isEmployee()) return []
    const items = [{ id: 'inv', label: 'Hóa đơn', onClick: () => { setLevel(isAdmin() ? LEVEL.BRANCHES : LEVEL.EMPLOYEES); setSelectedEmployeeId('') } }]
    if (level === LEVEL.BRANCHES) return items
    if (selectedBranchId || !isAdmin()) {
      items.push({
        id: 'branch',
        label: visibleBranches.find((b) => b.id === selectedBranchId)?.name ?? branchName ?? 'Chi nhánh',
        onClick: () => { setLevel(LEVEL.EMPLOYEES); setSelectedEmployeeId('') },
      })
    }
    if (level === LEVEL.INVOICES && selectedEmployeeId) {
      const emp = employeeRows.find((e) => e.employeeId === selectedEmployeeId)
      items.push({ id: 'emp', label: emp?.employeeName ?? 'Nhân viên' })
    }
    return items
  }, [level, selectedBranchId, selectedEmployeeId, employeeRows, visibleBranches, branchName])

  const listEmptyMessage = hasActiveInvoiceFilters(effectiveFilters)
    ? 'Không có hóa đơn phù hợp với bộ lọc.'
    : 'Chưa có hóa đơn nào.'

  if (level === LEVEL.BRANCHES) {
    return (
      <>
        <ErpBreadcrumb items={breadcrumbItems} />
        <ErpBranchCardGrid
          branches={branchSummaries}
          onSelectBranch={(branchId) => {
            setSelectedBranchId(branchId)
            setLevel(LEVEL.EMPLOYEES)
          }}
          renderStat={formatInvoiceBranchStats}
        />
      </>
    )
  }

  if (level === LEVEL.EMPLOYEES && !isEmployee()) {
    return (
      <>
        <ErpBreadcrumb items={breadcrumbItems} />
        <div className="invoice-drill-emp">
          {employeeRows.map((row) => (
            <button
              key={row.employeeId}
              type="button"
              className="invoice-drill-emp__card"
              onClick={() => {
                setSelectedEmployeeId(row.employeeId)
                setLevel(LEVEL.INVOICES)
              }}
            >
              <strong>{row.employeeName}</strong>
              <span>{row.position || 'Nhân viên'}</span>
              <div>
                <small>{row.invoiceCount} HĐ</small>
                <strong>{formatCurrency(row.ticketRevenue)}</strong>
              </div>
            </button>
          ))}
          {employeeRows.length === 0 && <p className="erp-empty">Chưa có nhân viên / hóa đơn.</p>}
        </div>
      </>
    )
  }

  return (
    <>
      <ErpBreadcrumb items={breadcrumbItems} />
      <InvoiceFilters
        filters={effectiveFilters}
        onChange={onChangeFilters}
        onReset={onResetFilters}
        lockedBranch={lockedBranch}
        branchName={branchName}
        resultCount={filteredInvoices.length}
        serviceOptions={serviceOptions}
        employees={selectedBranchId ? getActiveEmployeesByBranch(selectedBranchId) : []}
      />
      <InvoiceList
        invoices={filteredInvoices}
        page={page}
        onPageChange={onPageChange}
        onDelete={onDelete}
        onEdit={onEdit}
        onView={onView}
        allowDelete={allowDelete}
        canEdit={canEdit}
        emptyMessage={listEmptyMessage}
      />
    </>
  )
}
