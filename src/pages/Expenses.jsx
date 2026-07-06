import { useMemo, useState } from 'react'
import BranchBanner from '../components/common/BranchBanner'
import {
  canSelectBranch,
  filterByUserBranch,
  getCurrentUserBranch,
  getCurrentUserBranchName,
  getCurrentUserName,
} from '../constants/auth'
import { getActiveBranches } from '../constants/branches'
import { EXPENSE_TYPES } from '../constants/expenseTypes'
import { formatCurrency } from '../utils/invoice'
import {
  EMPTY_EXPENSE_FORM,
  addExpense,
  computeExpenseTotals,
  deleteExpense,
  loadExpenses,
  updateExpense,
} from '../utils/expenseStorage'
import { getTodayDate } from '../utils/invoiceStorage'
import './Expenses.css'

function createInitialForm() {
  return {
    ...EMPTY_EXPENSE_FORM,
    date: getTodayDate(),
    enteredBy: getCurrentUserName(),
    branchId: canSelectBranch() ? '' : getCurrentUserBranch(),
  }
}

export default function Expenses() {
  const lockedBranch = !canSelectBranch()
  const activeBranchName = getCurrentUserBranchName()

  const [allExpenses, setAllExpenses] = useState(() => loadExpenses())
  const expenses = useMemo(() => filterByUserBranch(allExpenses), [allExpenses])
  const [form, setForm] = useState(createInitialForm)
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState('')
  const [editingId, setEditingId] = useState(null)

  const totals = useMemo(() => computeExpenseTotals(expenses), [expenses])

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  const refresh = () => setAllExpenses(loadExpenses())

  const getFormPayload = (data) => ({
    ...data,
    branchId: lockedBranch ? getCurrentUserBranch() : data.branchId,
  })

  const validateForm = (data) => {
    const next = {}
    if (!data.date) next.date = 'Vui lòng chọn ngày'
    if (!data.branchId) next.branchId = 'Vui lòng chọn chi nhánh'
    if (!data.expenseType) next.expenseType = 'Vui lòng chọn loại chi phí'
    if (!data.content?.trim()) next.content = 'Vui lòng nhập nội dung'
    if (!data.amount || Number(data.amount) <= 0) next.amount = 'Vui lòng nhập số tiền hợp lệ'
    if (!data.enteredBy?.trim()) next.enteredBy = 'Vui lòng nhập người nhập'
    return next
  }

  const resetForm = () => {
    setForm(createInitialForm())
    setEditingId(null)
    setErrors({})
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = getFormPayload(form)
    const next = validateForm(payload)
    setErrors(next)
    if (Object.keys(next).length > 0) return

    if (editingId) {
      const result = updateExpense(editingId, payload)
      if (!result.success) {
        showToast(result.error ?? 'Không thể cập nhật chi phí')
        return
      }
      showToast('Cập nhật chi phí thành công')
    } else {
      const result = addExpense(payload)
      if (!result.success) {
        showToast(result.error ?? 'Không thể thêm chi phí')
        return
      }
      showToast('Thêm chi phí thành công')
    }

    resetForm()
    refresh()
  }

  const startEdit = (expense) => {
    setEditingId(expense.id)
    setForm({
      date: expense.date,
      branchId: expense.branchId,
      expenseType: expense.expenseType,
      content: expense.content,
      amount: String(expense.amount),
      enteredBy: expense.enteredBy,
      note: expense.note,
    })
    setErrors({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = (id, content) => {
    if (!window.confirm(`Bạn có chắc muốn xóa khoản chi "${content}"?`)) return
    const result = deleteExpense(id)
    if (!result.success) {
      showToast(result.error ?? 'Không thể xóa chi phí')
      return
    }
    if (editingId === id) resetForm()
    refresh()
    showToast('Đã xóa chi phí')
  }

  return (
    <div className="expenses">
      {toast && <div className="expenses__toast">{toast}</div>}

      <header className="expenses__header">
        <h2 className="expenses__title">Chi phí</h2>
        <p className="expenses__subtitle">Quản lý các khoản chi theo chi nhánh</p>
      </header>

      <section className="expenses__summary">
        <div className="expenses-card expenses-card--blue">
          <p className="expenses-card__label">Chi phí hôm nay</p>
          <p className="expenses-card__value">{formatCurrency(totals.today)}</p>
        </div>
        <div className="expenses-card expenses-card--orange">
          <p className="expenses-card__label">Chi phí tháng này</p>
          <p className="expenses-card__value">{formatCurrency(totals.month)}</p>
        </div>
      </section>

      {totals.byBranch.length > 0 && canSelectBranch() && (
        <section className="expenses__card expenses__branch-summary">
          <h3 className="expenses__card-title">Chi phí tháng này theo chi nhánh</h3>
          <div className="expenses__branch-grid">
            {totals.byBranch.map((row) => (
              <div key={row.branchId} className="expenses-branch-card">
                <p className="expenses-branch-card__name">{row.branchName}</p>
                <p className="expenses-branch-card__value">{formatCurrency(row.total)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="expenses__card">
        <h3 className="expenses__card-title">
          {editingId ? 'Sửa chi phí' : 'Thêm chi phí mới'}
        </h3>
        <form className="expenses__form" onSubmit={handleSubmit}>
          {lockedBranch && (
            <div className="expenses__field expenses__field--full">
              <BranchBanner branchName={activeBranchName} />
            </div>
          )}

          <label className="expenses__field">
            <span>Ngày</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={errors.date ? 'expenses__input--error' : ''}
            />
            {errors.date && <span className="expenses__error">{errors.date}</span>}
          </label>

          {canSelectBranch() && (
            <label className="expenses__field">
              <span>Chi nhánh</span>
              <select
                value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                className={errors.branchId ? 'expenses__input--error' : ''}
              >
                <option value="">Chọn chi nhánh</option>
                {getActiveBranches().map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {errors.branchId && <span className="expenses__error">{errors.branchId}</span>}
            </label>
          )}

          <label className="expenses__field">
            <span>Loại chi phí</span>
            <select
              value={form.expenseType}
              onChange={(e) => setForm({ ...form, expenseType: e.target.value })}
              className={errors.expenseType ? 'expenses__input--error' : ''}
            >
              <option value="">Chọn loại chi phí</option>
              {EXPENSE_TYPES.map((type) => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
            {errors.expenseType && <span className="expenses__error">{errors.expenseType}</span>}
          </label>

          <label className="expenses__field">
            <span>Số tiền</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="Nhập số tiền"
              className={errors.amount ? 'expenses__input--error' : ''}
            />
            {errors.amount && <span className="expenses__error">{errors.amount}</span>}
          </label>

          <label className="expenses__field expenses__field--full">
            <span>Nội dung</span>
            <input
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Mô tả nội dung chi phí"
              className={errors.content ? 'expenses__input--error' : ''}
            />
            {errors.content && <span className="expenses__error">{errors.content}</span>}
          </label>

          <label className="expenses__field">
            <span>Người nhập</span>
            <input
              value={form.enteredBy}
              onChange={(e) => setForm({ ...form, enteredBy: e.target.value })}
              placeholder="Tên người nhập"
              className={errors.enteredBy ? 'expenses__input--error' : ''}
            />
            {errors.enteredBy && <span className="expenses__error">{errors.enteredBy}</span>}
          </label>

          <label className="expenses__field expenses__field--full">
            <span>Ghi chú</span>
            <textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Ghi chú thêm (tùy chọn)"
            />
          </label>

          <div className="expenses__form-actions">
            <button type="submit" className="expenses__btn expenses__btn--primary">
              {editingId ? 'Lưu thay đổi' : 'Thêm chi phí'}
            </button>
            {editingId && (
              <button type="button" className="expenses__btn" onClick={resetForm}>
                Hủy
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="expenses__card">
        <h3 className="expenses__card-title">Danh sách chi phí</h3>
        {expenses.length === 0 ? (
          <p className="expenses__empty">Chưa có khoản chi nào.</p>
        ) : (
          <div className="expenses__table-wrap">
            <table className="expenses__table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Chi nhánh</th>
                  <th>Loại chi phí</th>
                  <th>Nội dung</th>
                  <th>Số tiền</th>
                  <th>Người nhập</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr key={exp.id}>
                    <td>{exp.date}</td>
                    <td>{exp.branchName}</td>
                    <td>{exp.expenseTypeLabel}</td>
                    <td className="expenses__content">{exp.content}</td>
                    <td className="expenses__money">{formatCurrency(exp.amount)}</td>
                    <td>{exp.enteredBy || '—'}</td>
                    <td className="expenses__actions">
                      <button
                        type="button"
                        className="expenses__btn expenses__btn--small expenses__btn--secondary"
                        onClick={() => startEdit(exp)}
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        className="expenses__btn expenses__btn--small expenses__btn--danger"
                        onClick={() => handleDelete(exp.id, exp.content)}
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
