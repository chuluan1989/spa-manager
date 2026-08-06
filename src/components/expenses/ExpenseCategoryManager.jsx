import { useMemo, useState } from 'react'
import {
  addExpenseCategory,
  moveExpenseCategory,
  renameExpenseCategory,
  setExpenseCategoryHidden,
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
  const [showHidden, setShowHidden] = useState(true)

  const variableCategories = useMemo(() => {
    const rows = categories
      .filter((item) => !item.isFixed)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    return showHidden ? rows : rows.filter((item) => !item.isHidden)
  }, [categories, showHidden])

  if (!canManage) return null

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

  const handleHide = async (item) => {
    setBusy(true)
    setError('')
    const result = await setExpenseCategoryHidden(item.id, !item.isHidden)
    setBusy(false)
    if (!result.success) {
      setError(result.error ?? 'Không thể cập nhật')
      return
    }
    onChanged?.()
  }

  const handleMove = async (id, direction) => {
    setBusy(true)
    setError('')
    const result = await moveExpenseCategory(id, direction)
    setBusy(false)
    if (!result.success) {
      setError(result.error ?? 'Không thể sắp xếp')
      return
    }
    onChanged?.()
  }

  return (
    <section className="exp-mod__section">
      <div className="exp-mod__section-head">
        <h3 className="exp-mod__section-title">Nhóm chi phí phát sinh</h3>
        <p className="exp-mod__section-desc">
          Thêm / đổi tên / ẩn / sắp xếp. Nhóm hệ thống không xóa được — có thể ẩn nếu không dùng.
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
          <label className="expenses__void-toggle">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
            Hiện nhóm đã ẩn
          </label>
        </div>

        <ul className="exp-mod__category-list">
          {variableCategories.map((item) => (
            <li key={item.id} className={item.isHidden ? 'is-voided' : undefined}>
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
                  <span>
                    {item.label}
                    {item.isSystem ? ' · hệ thống' : ''}
                    {item.isHidden ? ' · đã ẩn' : ''}
                  </span>
                  <button
                    type="button"
                    className="exp-mod__link-btn"
                    disabled={busy}
                    onClick={() => handleMove(item.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="exp-mod__link-btn"
                    disabled={busy}
                    onClick={() => handleMove(item.id, 1)}
                  >
                    ↓
                  </button>
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
                  <button
                    type="button"
                    className="exp-mod__link-btn"
                    disabled={busy}
                    onClick={() => handleHide(item)}
                  >
                    {item.isHidden ? 'Hiện' : 'Ẩn'}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
