import { useMemo, useState } from 'react'
import { Plus, Settings2, Tags } from 'lucide-react'
import ErpPageHeader from '../components/erp/ErpPageHeader'
import ExpenseCategoryManager from '../components/expenses/ExpenseCategoryManager'
import ExpenseDetailModal from '../components/expenses/ExpenseDetailModal'
import ExpenseFilters from '../components/expenses/ExpenseFilters'
import ExpenseFormModal from '../components/expenses/ExpenseFormModal'
import ExpenseHistoryModal from '../components/expenses/ExpenseHistoryModal'
import ExpenseKpiStrip from '../components/expenses/ExpenseKpiStrip'
import ExpenseReasonModal from '../components/expenses/ExpenseReasonModal'
import ExpenseTable from '../components/expenses/ExpenseTable'
import FixedCostsPanel from '../components/expenses/FixedCostsPanel'
import {
  canSelectBranch,
  getCurrentUserBranch,
  isAdmin,
} from '../constants/auth'
import { getVariableExpenseTypes } from '../constants/expenseTypes'
import { buildDefaultExpenseFilters, useExpensesData } from '../hooks/useExpensesData'
import {
  computeExpenseByType,
  filterExpensesAdvanced,
} from '../utils/expenseAnalytics'
import { exportExpensesCsv } from '../utils/expenseExport'
import {
  addExpense,
  canDeleteExpenseRecord,
  canEditExpenseRecord,
  updateExpense,
  voidExpense,
} from '../utils/expenseStorage'
import { filterVariableExpenses } from '../utils/branchProfitBreakdown'
import { computeFixedCostTotals } from '../utils/fixedCostStorage'
import { formatCurrency } from '../utils/invoice'
import { getMonthStartDate, getTodayDate } from '../utils/invoiceStorage'
import './Expenses.css'

function monthRange(monthValue) {
  if (!/^\d{4}-\d{2}$/.test(monthValue || '')) {
    return { fromDate: getMonthStartDate(), toDate: getTodayDate(), monthValue: getMonthStartDate().slice(0, 7) }
  }
  const [y, m] = monthValue.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  const fromDate = `${y}-${mm}-01`
  const toDate = `${y}-${mm}-${String(last).padStart(2, '0')}`
  const today = getTodayDate()
  return {
    monthValue,
    fromDate,
    toDate: toDate > today && monthValue === today.slice(0, 7) ? today : toDate,
  }
}

export default function Expenses() {
  const initialMonth = monthRange(getMonthStartDate().slice(0, 7))
  const [monthValue, setMonthValue] = useState(initialMonth.monthValue)
  const [draftFilters, setDraftFilters] = useState(() => buildDefaultExpenseFilters({
    fromDate: initialMonth.fromDate,
    toDate: initialMonth.toDate,
    branchId: isAdmin() ? '' : getCurrentUserBranch(),
    enteredBy: '',
    search: '',
  }))
  const [appliedFilters, setAppliedFilters] = useState(draftFilters)
  const [toast, setToast] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [viewingExpense, setViewingExpense] = useState(null)
  const [historyExpense, setHistoryExpense] = useState(null)
  const [fixedOpen, setFixedOpen] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [showVoided, setShowVoided] = useState(false)
  const [pendingEditPayload, setPendingEditPayload] = useState(null)
  const [voidTarget, setVoidTarget] = useState(null)

  const {
    expenses,
    fixedCosts,
    categories,
    loading,
    error,
    reload,
  } = useExpensesData(appliedFilters)

  const variableExpenseTypes = useMemo(
    () => getVariableExpenseTypes(categories),
    [categories],
  )

  const activeVariableExpenses = useMemo(
    () => filterVariableExpenses(expenses),
    [expenses],
  )

  const filteredExpenses = useMemo(() => {
    const rows = filterExpensesAdvanced(expenses, {
      ...appliedFilters,
      includeVoided: showVoided,
    }).filter((exp) => {
      if (exp.expenseType === 'mat-bang') return false
      if (exp.payrollAdjustmentId) return false
      return true
    })
    return rows.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date)
      if (dateCmp !== 0) return dateCmp
      return (b.expenseTime || '').localeCompare(a.expenseTime || '')
    })
  }, [expenses, appliedFilters, showVoided])

  const activeTableRows = useMemo(
    () => filteredExpenses.filter((exp) => exp.status !== 'void' && exp.status !== 'cancelled'),
    [filteredExpenses],
  )

  const tableRows = showVoided ? filteredExpenses : activeTableRows

  const variableTotal = useMemo(
    () => filterExpensesAdvanced(activeVariableExpenses, appliedFilters).reduce((s, e) => s + Number(e.amount || 0), 0),
    [activeVariableExpenses, appliedFilters],
  )

  const fixedTotals = useMemo(
    () => computeFixedCostTotals(fixedCosts, {
      fromDate: appliedFilters.fromDate,
      toDate: appliedFilters.toDate,
      branchId: appliedFilters.branchId || '',
    }),
    [fixedCosts, appliedFilters],
  )

  const byType = useMemo(
    () => computeExpenseByType(filterExpensesAdvanced(activeVariableExpenses, {
      fromDate: appliedFilters.fromDate,
      toDate: appliedFilters.toDate,
      branchId: appliedFilters.branchId,
      enteredBy: appliedFilters.enteredBy,
      search: appliedFilters.search,
    })),
    [activeVariableExpenses, appliedFilters],
  )

  const enteredByOptions = useMemo(() => {
    const names = new Set()
    for (const exp of expenses) {
      if (exp.enteredBy) names.add(exp.enteredBy)
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [expenses])

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 3200)
  }

  const applyFilters = (next) => {
    setDraftFilters(next)
    setAppliedFilters(next)
  }

  const handleFilterChange = (next) => {
    setDraftFilters(next)
    setAppliedFilters(next)
  }

  const handleMonthChange = (value) => {
    const range = monthRange(value)
    setMonthValue(range.monthValue)
    applyFilters({
      ...draftFilters,
      fromDate: range.fromDate,
      toDate: range.toDate,
    })
  }

  const handleSearch = () => setAppliedFilters({ ...draftFilters })
  const handleReset = () => {
    const range = monthRange(getMonthStartDate().slice(0, 7))
    setMonthValue(range.monthValue)
    const defaults = buildDefaultExpenseFilters({
      fromDate: range.fromDate,
      toDate: range.toDate,
      branchId: isAdmin() ? '' : getCurrentUserBranch(),
      enteredBy: '',
      search: '',
      expenseType: '',
    })
    setDraftFilters(defaults)
    setAppliedFilters(defaults)
  }

  const handleExport = () => exportExpensesCsv(tableRows, appliedFilters)

  const openCreateForm = () => {
    setEditingExpense(null)
    setFormOpen(true)
  }

  const openEditForm = (expense) => {
    setViewingExpense(null)
    setEditingExpense(expense)
    setFormOpen(true)
  }

  const persistExpense = async (payload, options = {}) => {
    const result = editingExpense
      ? await updateExpense(editingExpense.id, payload, options)
      : await addExpense(payload, options)

    if (result.needsConfirmation) {
      const ok = window.confirm(`${result.error}\n\nBạn có muốn đưa khoản ứng vào kỳ lương kế tiếp?`)
      if (!ok) {
        showToast(result.error ?? 'Kỳ lương đã chốt')
        return
      }
      return persistExpense(payload, { ...options, forceNextPeriod: true })
    }

    if (result.needsReason) {
      setPendingEditPayload(payload)
      setFormOpen(false)
      return
    }

    if (!result.success) {
      showToast(result.error ?? 'Không thể lưu chi phí')
      return
    }

    setFormOpen(false)
    setEditingExpense(null)
    setPendingEditPayload(null)
    await reload()
    showToast(editingExpense ? 'Cập nhật chi phí thành công' : 'Thêm chi phí thành công')
  }

  const handleSaveExpense = async (payload) => persistExpense(payload)

  const handleConfirmEditReason = async (reason) => {
    if (!pendingEditPayload || !editingExpense) return
    await persistExpense(pendingEditPayload, { reason })
  }

  const handleCancelEditReason = () => {
    setPendingEditPayload(null)
    setFormOpen(true)
  }

  const handleVoidExpense = (expense) => setVoidTarget(expense)

  const handleConfirmVoid = async (reason) => {
    if (!voidTarget) return
    const result = await voidExpense(voidTarget.id, reason)
    setVoidTarget(null)
    if (!result.success) {
      showToast(result.error ?? 'Không thể hủy khoản chi')
      return
    }
    await reload()
    showToast('Đã hủy khoản chi (không còn tính vào tổng)')
  }

  const canEdit = (expense) => canEditExpenseRecord(expense).allowed
  const canVoidRow = (expense) => canDeleteExpenseRecord(expense).allowed || isAdmin()

  return (
    <div className="expenses erp-page">
      {toast && <div className="expenses__toast">{toast}</div>}

      <ErpPageHeader
        title="Chi phí"
        subtitle="Một màn hình: lọc → KPI → bảng khoản chi. Chi phí cố định và nhóm chi phí mở khi cần."
        actions={(
          <div className="expenses__header-actions">
            {isAdmin() && (
              <>
                <button type="button" className="exp-mod__btn" onClick={() => setFixedOpen(true)}>
                  <Settings2 size={16} /> Quản lý chi phí cố định
                </button>
                <button type="button" className="exp-mod__btn" onClick={() => setGroupsOpen(true)}>
                  <Tags size={16} /> Quản lý nhóm chi phí
                </button>
              </>
            )}
            <button type="button" className="expenses__add-btn" onClick={openCreateForm}>
              <Plus size={18} />
              Thêm chi phí
            </button>
          </div>
        )}
      />

      {error && <div className="expenses__alert">{error}</div>}
      {loading && <div className="expenses__loading">Đang tải dữ liệu chi phí...</div>}

      <ExpenseFilters
        draftFilters={draftFilters}
        onChange={handleFilterChange}
        onSearch={handleSearch}
        onReset={handleReset}
        onExport={handleExport}
        expenseTypes={variableExpenseTypes}
        enteredByOptions={enteredByOptions}
        monthValue={monthValue}
        onMonthChange={handleMonthChange}
      />

      <ExpenseKpiStrip
        total={variableTotal + fixedTotals.total}
        fixedTotal={fixedTotals.total}
        variableTotal={variableTotal}
        count={filterExpensesAdvanced(activeVariableExpenses, appliedFilters).length}
        byType={byType}
        activeTypeId={appliedFilters.expenseType}
        onSelectTotal={() => applyFilters({ ...appliedFilters, expenseType: '' })}
        onSelectFixed={() => setFixedOpen(true)}
        onSelectVariable={() => applyFilters({ ...appliedFilters, expenseType: '' })}
        onSelectType={(typeId) => applyFilters({ ...draftFilters, ...appliedFilters, expenseType: typeId })}
      />

      <section className="expenses__card">
        <div className="expenses__card-head">
          <h3>Bảng chi phí</h3>
          <div className="expenses__card-head-meta">
            <label className="expenses__void-toggle">
              <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
              Hiện khoản đã hủy
            </label>
            <span>{activeTableRows.length} khoản · {formatCurrency(activeTableRows.reduce((s, e) => s + e.amount, 0))}</span>
          </div>
        </div>
        <ExpenseTable
          expenses={tableRows}
          onView={setViewingExpense}
          onEdit={openEditForm}
          onVoid={handleVoidExpense}
          onHistory={setHistoryExpense}
          canEdit={canEdit}
          canVoid={canVoidRow}
          showBranch={canSelectBranch()}
          showVoided={showVoided}
        />
      </section>

      <ExpenseFormModal
        key={editingExpense?.id ?? 'new'}
        open={formOpen}
        title={editingExpense ? 'Sửa chi phí' : 'Thêm chi phí'}
        onClose={() => {
          setFormOpen(false)
          setEditingExpense(null)
          setPendingEditPayload(null)
        }}
        onSubmit={handleSaveExpense}
        expenseTypes={variableExpenseTypes}
        initialData={editingExpense ? {
          date: editingExpense.date,
          advanceDate: editingExpense.advanceDate || editingExpense.date,
          expenseTime: editingExpense.expenseTime,
          branchId: editingExpense.branchId,
          expenseType: editingExpense.expenseType,
          employeeId: editingExpense.employeeId || '',
          content: editingExpense.content,
          amount: String(editingExpense.amount),
          paidBy: editingExpense.paidBy,
          enteredBy: editingExpense.enteredBy,
          note: editingExpense.note,
          receiptImage: editingExpense.receiptImage,
        } : null}
      />

      <ExpenseDetailModal
        expense={viewingExpense}
        onClose={() => setViewingExpense(null)}
        onEdit={canEdit(viewingExpense || {}) ? openEditForm : undefined}
      />

      <ExpenseHistoryModal
        open={Boolean(historyExpense)}
        expense={historyExpense}
        onClose={() => setHistoryExpense(null)}
      />

      <ExpenseReasonModal
        open={Boolean(pendingEditPayload)}
        title="Lý do Admin sửa khoản chi"
        confirmLabel="Lưu thay đổi"
        onClose={handleCancelEditReason}
        onConfirm={handleConfirmEditReason}
      />

      <ExpenseReasonModal
        open={Boolean(voidTarget)}
        title="Lý do hủy khoản chi"
        confirmLabel="Hủy khoản chi"
        onClose={() => setVoidTarget(null)}
        onConfirm={handleConfirmVoid}
      />

      {fixedOpen && (
        <div className="salary-modal" role="dialog" aria-modal="true">
          <div className="salary-modal__backdrop" onClick={() => setFixedOpen(false)} />
          <div className="salary-modal__panel expenses__side-panel">
            <header>
              <h3>Quản lý chi phí cố định</h3>
              <button type="button" onClick={() => setFixedOpen(false)} aria-label="Đóng">×</button>
            </header>
            <FixedCostsPanel
              fixedCosts={fixedCosts}
              canEdit={isAdmin()}
              onUpdated={() => reload()}
            />
          </div>
        </div>
      )}

      {groupsOpen && (
        <div className="salary-modal" role="dialog" aria-modal="true">
          <div className="salary-modal__backdrop" onClick={() => setGroupsOpen(false)} />
          <div className="salary-modal__panel expenses__side-panel">
            <header>
              <h3>Quản lý nhóm chi phí</h3>
              <button type="button" onClick={() => setGroupsOpen(false)} aria-label="Đóng">×</button>
            </header>
            <ExpenseCategoryManager
              categories={categories}
              canManage={isAdmin()}
              onChanged={() => reload()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
