import { useState } from 'react'
import {
  addExpenseCategory,
  removeExpenseCategory,
  renameExpenseCategory,
} from '../../utils/expenseCategoryStorage'
import './ExpenseModules.css'

export default function ExpenseCategoryManager({
  categories = [],
  canManage = false,
  onChanged,
}) {
  const [newLabel, setNewLabel] = useState('')
  const [editingId, setEditingId] = useState('')
  const [draftLabel, setDraftLabel] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!canManage) return null

  const variableCategories = categories.filter((item) => !item.isFixed)

  const handleAdd = async () => {
    setBusy(true)
    setError('')
    const result = await addExpenseCategory(newLabel)
    setBusy(false)
    if (!result.success) {
      setError(result.error ?? 'Không thể thêm')
      return
    }
    setNewLabel('')
    onChanged?.()
  }

  const handleRename = async (id) => {
    setBusy(true)
    setError('')
    const result = await renameExpenseCategory(id, draftLabel)
    setBusy(false)
    if (!result.success) {
      setError(result.error ?? 'Không thể sửa')
      return
    }
    setEditingId('')
    setDraftLabel('')
    onChanged?.()
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Xóa nhóm chi phí "${item.label}"?`)) return
    setBusy(true)
    setError('')
    const result = await removeExpenseCategory(item.id)
    setBusy(false)
    if (!result.success) {
      setError(result.error ?? 'Không thể xóa')
      return
    }
    onChanged?.()
  }

  return (
    <section className="exp-mod__section">
      <div className="exp-mod__section-head">
        <h3 className="exp-mod__section-title">Nhóm chi phí phát sinh</h3>
        <p className="exp-mod__section-desc">
          Admin được thêm / đổi tên / xóa nhóm tùy chỉnh. Nhóm hệ thống mặc định không xóa được.
        </p>
      </div>

      {error && <div className="exp-mod__inline-error">{error}</div>}

      <div className="exp-mod__category-manage">
        <div className="exp-mod__category-add">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Tên nhóm mới"
            disabled={busy}
          />
          <button type="button" className="exp-mod__btn exp-mod__btn--primary" disabled={busy} onClick={handleAdd}>
            Thêm nhóm
          </button>
        </div>

        <ul className="exp-mod__category-list">
          {variableCategories.map((item) => (
            <li key={item.id}>
              {editingId === item.id ? (
                <>
                  <input
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    disabled={busy}
                  />
                  <button type="button" className="exp-mod__btn exp-mod__btn--primary" disabled={busy} onClick={() => handleRename(item.id)}>
                    Lưu
                  </button>
                  <button type="button" className="exp-mod__btn" disabled={busy} onClick={() => setEditingId('')}>
                    Hủy
                  </button>
                </>
              ) : (
                <>
                  <span>{item.label}{item.isSystem ? ' · mặc định' : ''}</span>
                  <button
                    type="button"
                    className="exp-mod__link-btn"
                    onClick={() => {
                      setEditingId(item.id)
                      setDraftLabel(item.label)
                    }}
                  >
                    Đổi tên
                  </button>
                  {!item.isSystem && (
                    <button type="button" className="exp-mod__link-btn is-danger" onClick={() => handleDelete(item)}>
                      Xóa
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
