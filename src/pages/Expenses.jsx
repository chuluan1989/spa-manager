import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import ErpBreadcrumb from '../components/erp/ErpBreadcrumb'
import ErpPageHeader from '../components/erp/ErpPageHeader'
import ExpenseBranchDetail from '../components/expenses/ExpenseBranchDetail'
import ExpenseBranchGrid from '../components/expenses/ExpenseBranchGrid'
import ExpenseCategoryCards from '../components/expenses/ExpenseCategoryCards'
import ExpenseCategoryManager from '../components/expenses/ExpenseCategoryManager'
import ExpenseDetailModal from '../components/expenses/ExpenseDetailModal'
import ExpenseFilters from '../components/expenses/ExpenseFilters'
import ExpenseFormModal from '../components/expenses/ExpenseFormModal'
import ExpenseOverview from '../components/expenses/ExpenseOverview'
import ExpenseTable from '../components/expenses/ExpenseTable'
import FixedCostsPanel from '../components/expenses/FixedCostsPanel'
import {
  canSelectBranch,
  getCurrentUserBranch,
  isAdmin,
} from '../constants/auth'
import { EXPENSE_CATEGORY_CARDS, getVariableExpenseTypes } from '../constants/expenseTypes'
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
import { filterVariableExpenses } from '../utils/branchProfitBreakdown'
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

  const {
    expenses,
    invoices,
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

  const variableExpenses = useMemo(
    () => filterVariableExpenses(expenses),
    [expenses],
  )

  const monthExpenses = useMemo(() => {
    const monthStart = getMonthStartDate()
    const today = getTodayDate()
    return variableExpenses.filter((exp) => exp.date >= monthStart && exp.date <= today)
  }, [variableExpenses])

  const overview = useMemo(
    () => computeAdminExpenseOverview(variableExpenses, invoices),
    [variableExpenses, invoices],
  )

  const categoryCards = useMemo(
    () => computeAllCategoryCards(monthExpenses),
    [monthExpenses],
  )

  const filteredExpenses = useMemo(() => {
    let rows = filterExpensesAdvanced(variableExpenses, appliedFilters)
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
  }, [variableExpenses, appliedFilters, activeCategoryId, screen, selectedBranchId])

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

  const handleSaveExpense = async (payload, options = {}) => {
    const result = editingExpense
      ? await updateExpense(editingExpense.id, payload, options)
      : await addExpense(payload, options)

    if (result.needsConfirmation) {
      const ok = window.confirm(`${result.error}\n\nBạn có muốn đưa khoản ứng vào kỳ lương kế tiếp?`)
      if (!ok) {
        showToast(result.error ?? 'Kỳ lương đã chốt')
        return
      }
      return handleSaveExpense(payload, { forceNextPeriod: true })
    }

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
        subtitle="Chi phí cố định + chi phí phát sinh — đồng bộ Supabase, dùng chung với Báo cáo lợi nhuận."
        actions={(
          <button type="button" className="expenses__add-btn" onClick={openCreateForm}>
            <Plus size={18} />
            Thêm chi phí phát sinh
          </button>
        )}
      />

      {isAdmin() && <ErpBreadcrumb items={breadcrumbItems} />}

      {error && <div className="expenses__alert">{error}</div>}
      {loading && <div className="expenses__loading">Đang tải dữ liệu chi phí...</div>}

      <FixedCostsPanel
        fixedCosts={fixedCosts}
        canEdit={isAdmin()}
        onUpdated={() => reload()}
      />

      {isAdmin() && (
        <ExpenseCategoryManager
          categories={categories}
          canManage={isAdmin()}
          onChanged={() => reload()}
        />
      )}

      <section className="exp-mod__section">
        <div className="exp-mod__section-head">
          <h3 className="exp-mod__section-title">Chi phí phát sinh hàng tháng</h3>
          <p className="exp-mod__section-desc">
            Nhập Facebook, TikTok, điện, nước, wifi, Shopee, sửa chữa và các khoản khác theo ngày.
            {!isAdmin() && ' Chỉ được nhập chi phí của chi nhánh mình.'}
          </p>
        </div>
      </section>

      <ExpenseFilters
        draftFilters={draftFilters}
        appliedFilters={appliedFilters}
        onChange={setDraftFilters}
        onSearch={handleSearch}
        onReset={handleReset}
        onExport={handleExport}
        expenseTypes={variableExpenseTypes}
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
          expenses={variableExpenses.filter((exp) => exp.branchId === selectedBranchId)}
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
            <h3>Danh sách khoản chi phát sinh</h3>
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
        title={editingExpense ? 'Sửa chi phí phát sinh' : 'Thêm chi phí phát sinh'}
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
