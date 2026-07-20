import { useEffect, useState } from 'react'
import { getPayrollBranchDisplayTitle } from '../../constants/branchPayrollDisplay'
import {
  canEditBranchServicePricing,
  getCurrentUserBranch,
  isAdmin,
} from '../../constants/auth'
import { getActiveBranches } from '../../constants/branches'
import { formatCurrency } from '../../utils/invoice'
import {
  deleteDurationSafe,
  deleteServiceSafe,
  ITEM_STATUS,
  loadBranchCatalog,
  setBranchDurationPrice,
  setDurationVisibility,
  setServiceVisibility,
} from '../../utils/serviceCatalogV2Storage'
import {
  attachInvoiceStats,
  buildServiceManagementRows,
  computeServiceKpis,
  filterServiceRows,
  formatCompactMoney,
  getDateRangeForTimeFilter,
  groupRowsByCategory,
  parseCommissionPercentInput,
  parsePriceInput,
  sortServiceRows,
  SORT_OPTIONS,
  summarizeCategoryStats,
  TIME_FILTER_OPTIONS,
  TIME_FILTERS,
} from '../../utils/serviceManagementHelpers'
import ServiceChangeLogModal from './ServiceChangeLogModal'
import ServiceConfirmSaveModal from './ServiceConfirmSaveModal'
import ServiceFormModal from './ServiceFormModal'

const COMMISSION_CHIPS = [10, 20, 25, 30, 35, 40]

function StatCell({ value, money = false }) {
  if (value == null) return <span className="svc-mgmt__dash">—</span>
  return money ? formatCurrency(value) : String(value)
}

function InlinePercentEditor({ row, canEdit, onCommit }) {
  const [value, setValue] = useState(String(row.commissionPercent ?? ''))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    setValue(String(row.commissionPercent ?? ''))
  }, [row.durationId, row.commissionPercent])

  const commit = () => {
    const next = parseCommissionPercentInput(value)
    if (!Number.isFinite(next)) {
      setValue(String(row.commissionPercent ?? ''))
      return
    }
    if (next === row.commissionPercent) return
    onCommit({ price: row.price, commissionPercent: next })
    setValue(String(next))
  }

  if (!canEdit) {
    return <span>{row.commissionPercent}%</span>
  }

  return (
    <div className="svc-mgmt__inline-percent">
      <input
        className="svc-mgmt__inline-input"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
      />
      <span>%</span>
      {focused && (
        <div className="svc-mgmt__inline-chips">
          {COMMISSION_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="svc-mgmt__inline-chip"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setValue(String(chip))
                onCommit({ price: row.price, commissionPercent: chip })
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function InlinePriceEditor({ row, canEdit, onCommit }) {
  const [value, setValue] = useState(String(row.price ?? ''))

  useEffect(() => {
    setValue(String(row.price ?? ''))
  }, [row.durationId, row.price])

  const commit = () => {
    const next = parsePriceInput(value)
    if (!Number.isFinite(next)) {
      setValue(String(row.price ?? ''))
      return
    }
    if (next === row.price) return
    onCommit({ price: next, commissionPercent: row.commissionPercent })
    setValue(String(next))
  }

  if (!canEdit) {
    return <span>{formatCurrency(row.price)}</span>
  }

  return (
    <input
      className="svc-mgmt__inline-input svc-mgmt__inline-input--price"
      inputMode="numeric"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function RowActionsMenu({ row, canEdit, onEdit, onToggleStatus, onDelete, onShowLog }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="svc-mgmt__menu">
      <button
        type="button"
        className="svc-mgmt__menu-btn"
        aria-label="Thao tác"
        onClick={() => setOpen((v) => !v)}
      >
        ⋮
      </button>
      {open && (
        <>
          <div className="svc-mgmt__menu-backdrop" onClick={() => setOpen(false)} />
          <div className="svc-mgmt__menu-panel">
            <button type="button" onClick={() => { setOpen(false); onEdit(row) }}>Sửa dịch vụ</button>
            {canEdit && (
              <button type="button" onClick={() => { setOpen(false); onToggleStatus(row) }}>
                {row.isActive ? 'Ngừng sử dụng' : 'Bật lại'}
              </button>
            )}
            <button type="button" onClick={() => { setOpen(false); onShowLog(row) }}>Nhật ký thay đổi</button>
            {canEdit && (
              <button type="button" className="is-danger" onClick={() => { setOpen(false); onDelete(row) }}>
                Xóa
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function ServiceQuickTab({ showToast, readOnly = false }) {
  const branches = useMemo(() => {
    const all = getActiveBranches()
    if (isAdmin()) return all
    const branchId = getCurrentUserBranch()
    return all.filter((b) => b.id === branchId)
  }, [])

  const [branchId, setBranchId] = useState(() => {
    if (isAdmin()) return branches[0]?.id ?? ''
    return getCurrentUserBranch()
  })
  const [timeFilter, setTimeFilter] = useState(TIME_FILTERS.MONTH)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [revision, setRevision] = useState(0)
  const [expanded, setExpanded] = useState({})
  const [formModal, setFormModal] = useState(null)
  const [logModal, setLogModal] = useState(null)
  const [confirmSave, setConfirmSave] = useState(null)

  const canEdit = !readOnly && canEditBranchServicePricing(branchId)
  const dateRange = getDateRangeForTimeFilter(timeFilter, customFrom, customTo)

  const rows = useMemo(() => {
    if (!branchId) return []
    const base = buildServiceManagementRows(branchId)
    const withStats = attachInvoiceStats(base, { branchId, ...dateRange })
    const filtered = filterServiceRows(withStats, { search, statusFilter })
    return sortServiceRows(filtered, sortBy)
  }, [branchId, search, statusFilter, sortBy, revision, dateRange.fromDate, dateRange.toDate])

  const groups = useMemo(() => groupRowsByCategory(rows), [rows])
  const kpis = useMemo(
    () => computeServiceKpis(buildServiceManagementRows(branchId), { branchId, ...dateRange }),
    [branchId, revision, dateRange.fromDate, dateRange.toDate],
  )

  const refresh = () => setRevision((v) => v + 1)

  const toggleGroup = (categoryId) => {
    setExpanded((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }))
  }

  const isGroupOpen = (categoryId) => expanded[categoryId] !== false

  const handleInlineCommit = (row, next) => {
    const price = Number(next.price)
    const commissionPercent = Number(next.commissionPercent)
    if (!Number.isFinite(price) || !Number.isFinite(commissionPercent)) return
    if (price === row.price && commissionPercent === row.commissionPercent) return

    setConfirmSave({
      row,
      oldPrice: row.price,
      newPrice: price,
      oldPercent: row.commissionPercent,
      newPercent: commissionPercent,
    })
  }

  const confirmInlineSave = () => {
    if (!confirmSave) return
    const { row, newPrice, newPercent } = confirmSave
    setBranchDurationPrice(branchId, row.durationId, {
      price: newPrice,
      commissionPercent: newPercent,
    })
    setConfirmSave(null)
    refresh()

    const parts = []
    if (newPrice !== row.price) parts.push(`Giá ${formatCurrency(newPrice)}`)
    if (newPercent !== row.commissionPercent) parts.push(`HH ${newPercent}%`)
    showToast(`✓ Đã lưu ${row.serviceName} ${row.durationLabel}: ${parts.join(' · ')}. Hóa đơn cũ giữ nguyên.`)
  }

  const handleToggleStatus = (row) => {
    const next = row.isActive ? ITEM_STATUS.INACTIVE : ITEM_STATUS.ACTIVE
    setServiceVisibility(branchId, row.serviceId, next)
    setDurationVisibility(branchId, row.durationId, next)
    refresh()
    showToast(
      next === ITEM_STATUS.ACTIVE
        ? `✓ Đã bật lại ${row.serviceName} ${row.durationLabel}.`
        : `✓ Đã ngừng ${row.serviceName} ${row.durationLabel}. Không chọn được trên hóa đơn mới.`,
    )
  }

  const handleDelete = (row) => {
    const durationResult = deleteDurationSafe(branchId, row.durationId, row.serviceId)
    if (!durationResult.ok) {
      showToast(durationResult.error)
      return
    }

    const catalog = loadBranchCatalog(branchId)
    const remaining = catalog.durations.filter(
      (d) => d.serviceId === row.serviceId && d.status !== ITEM_STATUS.DELETED,
    )
    if (!remaining.length) {
      const serviceResult = deleteServiceSafe(branchId, row.serviceId)
      if (!serviceResult.ok) {
        showToast(serviceResult.error)
      }
    }

    refresh()
    showToast(`✓ Đã xóa ${row.serviceName} ${row.durationLabel}.`)
  }

  const handleFormSaved = ({ mode, message }) => {
    refresh()
    if (mode === 'add') {
      showToast('✓ Đã thêm dịch vụ mới. Hiển thị đúng chi nhánh đã chọn.')
      return
    }
    if (message === 'percent_and_price') {
      showToast('✓ Đã cập nhật giá và % hoa hồng. Hóa đơn cũ giữ nguyên.')
    } else if (message === 'percent') {
      showToast('✓ Đã cập nhật % hoa hồng. Hóa đơn cũ giữ nguyên.')
    } else {
      showToast('✓ Đã cập nhật giá. Hóa đơn cũ giữ nguyên.')
    }
  }

  if (!branches.length) {
    return <p className="svc-mgmt__empty">Bạn không có quyền xem dịch vụ.</p>
  }

  return (
    <div className="svc-mgmt-quick">
      <div className="svc-mgmt-kpis">
        <article><span>Tổng dịch vụ</span><strong>{kpis.total}</strong></article>
        <article><span>Đang sử dụng</span><strong>{kpis.active}</strong></article>
        <article><span>Ngừng sử dụng</span><strong>{kpis.inactive}</strong></article>
        <article>
          <span>Doanh thu ({TIME_FILTER_OPTIONS.find((o) => o.value === timeFilter)?.label})</span>
          <strong>{kpis.totalRevenue == null ? '—' : formatCompactMoney(kpis.totalRevenue)}</strong>
        </article>
      </div>

      <div className="svc-mgmt-toolbar">
        <label>
          <span>Chi nhánh</span>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={!isAdmin()}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{getPayrollBranchDisplayTitle(b.id, b.name)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Thời gian</span>
          <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
            {TIME_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        {timeFilter === TIME_FILTERS.CUSTOM && (
          <>
            <label>
              <span>Từ</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label>
              <span>Đến</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </>
        )}
        <label>
          <span>Trạng thái</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="active">Đang sử dụng</option>
            <option value="inactive">Ngừng sử dụng</option>
          </select>
        </label>
        <label className="svc-mgmt-toolbar__search">
          <span>Tìm kiếm</span>
          <input
            placeholder="Tên, nhóm, thời lượng…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          <span>Sắp xếp</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        {canEdit && (
          <button
            type="button"
            className="settings__btn settings__btn--primary svc-mgmt-toolbar__add"
            onClick={() => setFormModal({ mode: 'add', initial: { branchId } })}
          >
            + Thêm dịch vụ
          </button>
        )}
      </div>

      {!groups.length && (
        <p className="svc-mgmt__empty">Không có dịch vụ phù hợp bộ lọc.</p>
      )}

      {groups.map((group) => {
        const stats = summarizeCategoryStats(group.rows)
        const open = isGroupOpen(group.categoryId)
        return (
          <section key={group.categoryId} className="svc-mgmt-accordion">
            <button
              type="button"
              className="svc-mgmt-accordion__head"
              onClick={() => toggleGroup(group.categoryId)}
            >
              <span className="svc-mgmt-accordion__chevron">{open ? '▾' : '▸'}</span>
              <strong>{group.categoryName}</strong>
              <span className="svc-mgmt-accordion__meta">
                {stats.serviceCount} dịch vụ
                {stats.soldCount != null && ` · ${stats.soldCount} đã bán`}
                {stats.revenue != null && ` · ${formatCompactMoney(stats.revenue)}`}
              </span>
            </button>

            {open && (
              <div className="svc-mgmt-table-wrap">
                <table className="svc-mgmt-table">
                  <thead>
                    <tr>
                      <th>Dịch vụ</th>
                      <th>Thời lượng</th>
                      <th>Giá bán</th>
                      <th>% HH</th>
                      <th>Đã bán</th>
                      <th>Doanh thu</th>
                      <th>Trạng thái</th>
                      <th aria-label="Thao tác" />
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.durationId} className={!row.isActive ? 'is-inactive' : ''}>
                        <td data-label="Dịch vụ">{row.serviceName}</td>
                        <td data-label="Thời lượng">{row.durationLabel}</td>
                        <td data-label="Giá bán">
                          <InlinePriceEditor
                            row={row}
                            canEdit={canEdit}
                            onCommit={(next) => handleInlineCommit(row, next)}
                          />
                        </td>
                        <td data-label="% HH">
                          <InlinePercentEditor
                            row={row}
                            canEdit={canEdit}
                            onCommit={(next) => handleInlineCommit(row, next)}
                          />
                        </td>
                        <td data-label="Đã bán"><StatCell value={row.soldCount} /></td>
                        <td data-label="Doanh thu"><StatCell value={row.revenue} money /></td>
                        <td data-label="Trạng thái">
                          <span className={`svc-mgmt__status ${row.isActive ? 'is-active' : 'is-inactive'}`}>
                            {row.isActive ? 'Đang dùng' : 'Ngừng'}
                          </span>
                        </td>
                        <td data-label="Thao tác">
                          <RowActionsMenu
                            row={row}
                            canEdit={canEdit}
                            onEdit={(r) => setFormModal({ mode: 'edit', initial: { ...r, branchId } })}
                            onToggleStatus={handleToggleStatus}
                            onDelete={handleDelete}
                            onShowLog={(r) => setLogModal(r)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}

      <ServiceFormModal
        open={Boolean(formModal)}
        mode={formModal?.mode ?? 'add'}
        initial={formModal?.initial}
        onClose={() => setFormModal(null)}
        onSaved={handleFormSaved}
      />

      <ServiceConfirmSaveModal
        open={Boolean(confirmSave)}
        oldPrice={confirmSave?.oldPrice}
        newPrice={confirmSave?.newPrice}
        oldPercent={confirmSave?.oldPercent}
        newPercent={confirmSave?.newPercent}
        onCancel={() => setConfirmSave(null)}
        onConfirm={confirmInlineSave}
      />

      <ServiceChangeLogModal
        open={Boolean(logModal)}
        branchId={branchId}
        row={logModal}
        onClose={() => setLogModal(null)}
      />
    </div>
  )
}
