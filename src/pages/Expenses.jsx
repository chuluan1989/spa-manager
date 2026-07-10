import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import ErpBreadcrumb from '../components/erp/ErpBreadcrumb'
import ErpPageHeader from '../components/erp/ErpPageHeader'
import ExpenseBranchDetail from '../components/expenses/ExpenseBranchDetail'
import ExpenseBranchGrid from '../components/expenses/ExpenseBranchGrid'
import ExpenseCategoryCards from '../components/expenses/ExpenseCategoryCards'
import ExpenseDetailModal from '../components/expenses/ExpenseDetailModal'
import ExpenseFilters from '../components/expenses/ExpenseFilters'
import ExpenseFormModal from '../components/expenses/ExpenseFormModal'
import ExpenseOverview from '../components/expenses/ExpenseOverview'
import ExpenseTable from '../components/expenses/ExpenseTable'
import {
  canSelectBranch,
  getCurrentUserBranch,
  isAdmin,
} from '../constants/auth'
import { EXPENSE_CATEGORY_CARDS } from '../constants/expenseTypes'
import { buildDefaultExpenseFilters, useExpensesData } from '../hooks/useExpensesData'
import {
  computeAdminExpenseOverview,
  computeAllCategoryCards,
  filterExpensesAdvanced,
} from '../utils/expenseAnalytics'
import { exportExpensesCsv } from '../utils/expenseExport'
import {
  addExpense,
  canDeleteExpenseRecord,
  canEditExpenseRecord,
  deleteExpense,
  updateExpense,
} from '../utils/expenseStorage'
import { formatCurrency } from '../utils/invoice'
import { getBranchName } from '../utils/branchStorage'
import { getMonthStartDate, getTodayDate } from '../utils/invoiceStorage'
import './Expenses.css'

export default function Expenses() {
  const [draftFilters, setDraftFilters] = useState(buildDefaultExpenseFilters)
  const [appliedFilters, setAppliedFilters] = useState(buildDefaultExpenseFilters)
  const [screen, setScreen] = useState(isAdmin() ? 'overview' : 'branch')
  const [selectedBranchId, setSelectedBranchId] = useState(
    isAdmin() ? '' : getCurrentUserBranch(),
  )
  const [activeCategoryId, setActiveCategoryId] = useState('')
  const [toast, setToast] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [viewingExpense, setViewingExpense] = useState(null)

  const { expenses, invoices, loading, error, reload } = useExpensesData(appliedFilters)

  const monthExpenses = useMemo(() => {
    const monthStart = getMonthStartDate()
    const today = getTodayDate()
    return expenses.filter((exp) => exp.date >= monthStart && exp.date <= today)
  }, [expenses])

  const overview = useMemo(
    () => computeAdminExpenseOverview(expenses, invoices),
    [expenses, invoices],
  )

  const categoryCards = useMemo(
    () => computeAllCategoryCards(monthExpenses),
    [monthExpenses],
  )

  const filteredExpenses = useMemo(() => {
    let rows = filterExpensesAdvanced(expenses, appliedFilters)
    if (activeCategoryId && activeCategoryId !== 'total') {
      rows = filterExpensesAdvanced(rows, { categoryId: activeCategoryId })
    }
    if (screen === 'branch' && selectedBranchId) {
      rows = rows.filter((exp) => exp.branchId === selectedBranchId)
    }
    return rows.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date)
      if (dateCmp !== 0) return dateCmp
      return (b.expenseTime || '').localeCompare(a.expenseTime || '')
    })
  }, [expenses, appliedFilters, activeCategoryId, screen, selectedBranchId])

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  const handleSearch = () => setAppliedFilters({ ...draftFilters })
  const handleReset = () => {
    const defaults = buildDefaultExpenseFilters()
    setDraftFilters(defaults)
    setAppliedFilters(defaults)
    setActiveCategoryId('')
    setScreen(isAdmin() ? 'overview' : 'branch')
    setSelectedBranchId(isAdmin() ? '' : getCurrentUserBranch())
  }

  const handleExport = () => exportExpensesCsv(filteredExpenses, appliedFilters)

  const openCreateForm = () => {
    setEditingExpense(null)
    setFormOpen(true)
  }

  const openEditForm = (expense) => {
    setViewingExpense(null)
    setEditingExpense(expense)
    setFormOpen(true)
  }

  const handleSaveExpense = async (payload) => {
    const result = editingExpense
      ? await updateExpense(editingExpense.id, payload)
      : await addExpense(payload)

    if (!result.success) {
      showToast(result.error ?? 'Không thể lưu chi phí')
      return
    }

    setFormOpen(false)
    setEditingExpense(null)
    await reload()
    showToast(editingExpense ? 'Cập nhật chi phí thành công' : 'Thêm chi phí thành công')
  }

  const handleDeleteExpense = async (expense) => {
    if (!window.confirm(`Xóa khoản chi "${expense.content}"?`)) return
    const result = await deleteExpense(expense.id)
    if (!result.success) {
      showToast(result.error ?? 'Không thể xóa chi phí')
      return
    }
    await reload()
    showToast('Đã xóa chi phí')
  }

  const drillToList = (patch = {}) => {
    const next = { ...appliedFilters, ...patch }
    setDraftFilters(next)
    setAppliedFilters(next)
    setScreen('list')
  }

  const handleSelectBranch = (branchId) => {
    setSelectedBranchId(branchId)
    setScreen('branch')
    const next = { ...appliedFilters, branchId }
    setDraftFilters(next)
    setAppliedFilters(next)
  }

  const handleSelectCategory = (categoryId) => {
    setActiveCategoryId(categoryId)
    if (categoryId === 'total') {
      drillToList({ expenseType: '' })
      return
    }
    const card = EXPENSE_CATEGORY_CARDS.find((item) => item.id === categoryId)
    if (card?.typeIds?.length === 1) {
      drillToList({ expenseType: card.typeIds[0] })
      return
    }
    drillToList({ expenseType: '' })
    setActiveCategoryId(categoryId)
    setScreen('list')
  }

  const canEdit = (expense) => canEditExpenseRecord(expense).allowed
  const canDelete = (expense) => canDeleteExpenseRecord(expense).allowed

  const breadcrumbItems = useMemo(() => {
    const items = [{ id: 'exp', label: 'Chi phí', onClick: () => { setScreen('overview'); setSelectedBranchId(''); setActiveCategoryId('') } }]
    if (screen === 'overview' && isAdmin()) return items
    if (selectedBranchId) {
      items.push({ id: 'branch', label: getBranchName(selectedBranchId), onClick: () => setScreen('branch') })
    }
    if (screen === 'list') {
      items.push({ id: 'list', label: 'Danh sách phiếu chi' })
    }
    return items
  }, [screen, selectedBranchId])

  return (
    <div className="expenses erp-page">
      {toast && <div className="expenses__toast">{toast}</div>}

      <ErpPageHeader
        title="Chi phí"
        subtitle="Quản trị chi phí — Tổng quan → Chi nhánh → Danh mục → Phiếu chi."
        actions={(
          <button type="button" className="expenses__add-btn" onClick={openCreateForm}>
            <Plus size={18} />
            Thêm chi phí
          </button>
        )}
      />

      {isAdmin() && <ErpBreadcrumb items={breadcrumbItems} />}

      {error && <div className="expenses__alert">{error}</div>}
      {loading && <div className="expenses__loading">Đang tải dữ liệu chi phí...</div>}

      <ExpenseFilters
        draftFilters={draftFilters}
        appliedFilters={appliedFilters}
        onChange={setDraftFilters}
        onSearch={handleSearch}
        onReset={handleReset}
        onExport={handleExport}
      />

      {isAdmin() && screen === 'overview' && (
        <>
          <ExpenseOverview
            overview={overview}
            onDrillTotal={() => drillToList({ fromDate: '', toDate: '', branchId: '', expenseType: '' })}
            onDrillToday={() => drillToList({ fromDate: getTodayDate(), toDate: getTodayDate() })}
            onDrillMonth={() => drillToList({ fromDate: getMonthStartDate(), toDate: getTodayDate() })}
            onDrillTopBranch={() => overview.topBranch && handleSelectBranch(overview.topBranch.branchId)}
            onDrillTopType={() => overview.topType && drillToList({ expenseType: overview.topType.typeId })}
            onDrillRatio={() => drillToList({ fromDate: getMonthStartDate(), toDate: getTodayDate() })}
          />

          <ExpenseCategoryCards
            cards={categoryCards}
            activeCategoryId={activeCategoryId}
            onSelectCategory={handleSelectCategory}
          />

          <ExpenseBranchGrid
            rows={overview.byBranch}
            onSelectBranch={handleSelectBranch}
            activeBranchId={selectedBranchId}
          />
        </>
      )}

      {screen === 'branch' && selectedBranchId && (
        <ExpenseBranchDetail
          branchId={selectedBranchId}
          expenses={expenses.filter((exp) => exp.branchId === selectedBranchId)}
          onBack={() => {
            setScreen(isAdmin() ? 'overview' : 'branch')
            if (isAdmin()) setSelectedBranchId('')
          }}
          onViewExpense={setViewingExpense}
          onEditExpense={openEditForm}
          onDeleteExpense={handleDeleteExpense}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}

      {(screen === 'list' || (screen === 'overview' && !isAdmin())) && (
        <section className="expenses__card">
          <div className="expenses__card-head">
            <h3>Danh sách khoản chi</h3>
            <span>{filteredExpenses.length} khoản · {formatCurrency(filteredExpenses.reduce((s, e) => s + e.amount, 0))}</span>
          </div>
          <ExpenseTable
            expenses={filteredExpenses}
            onView={setViewingExpense}
            onEdit={openEditForm}
            onDelete={handleDeleteExpense}
            canEdit={canEdit}
            canDelete={canDelete}
            showBranch={canSelectBranch()}
          />
        </section>
      )}

      <ExpenseFormModal
        key={editingExpense?.id ?? 'new'}
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditingExpense(null)
        }}
        onSubmit={handleSaveExpense}
        initialData={editingExpense ? {
          date: editingExpense.date,
          expenseTime: editingExpense.expenseTime,
          branchId: editingExpense.branchId,
          expenseType: editingExpense.expenseType,
          content: editingExpense.content,
          amount: String(editingExpense.amount),
          paidBy: editingExpense.paidBy,
          enteredBy: editingExpense.enteredBy,
          note: editingExpense.note,
          receiptImage: editingExpense.receiptImage,
        } : null}
        title={editingExpense ? 'Sửa chi phí' : 'Thêm chi phí'}
      />

      <ExpenseDetailModal
        expense={viewingExpense}
        onClose={() => setViewingExpense(null)}
        onEdit={openEditForm}
        canEdit={canEdit}
      />
    </div>
  )
}
