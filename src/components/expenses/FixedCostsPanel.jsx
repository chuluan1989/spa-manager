import { useMemo, useState } from 'react'
import { getActiveBranches } from '../../constants/branches'
import { formatCurrency } from '../../utils/invoice'
import {
  addBranchFixedCost,
  setBranchFixedCostStatus,
  updateBranchFixedCostAmount,
  updateBranchFixedCostFields,
} from '../../utils/fixedCostStorage'
import ExpenseHistoryModal from './ExpenseHistoryModal'
import './ExpenseModules.css'

export default function FixedCostsPanel({
  fixedCosts = [],
  canEdit = false,
  onUpdated,
}) {
  const [editingId, setEditingId] = useState('')
  const [draftAmount, setDraftAmount] = useState('')
  const [draftStartDate, setDraftStartDate] = useState('')
  const [draftLabel, setDraftLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [historyRow, setHistoryRow] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState({
    branchId: '',
    expenseTypeLabel: 'Mặt bằng',
    amount: '',
    startDate: '',
  })

  const activeTotal = useMemo(
    () => fixedCosts
      .filter((row) => row.status !== 'paused')
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    [fixedCosts],
  )

  const startEdit = (row) => {
    setEditingId(row.id)
    setDraftAmount(String(row.amount ?? 0))
    setDraftStartDate(row.startDate || '')
    setDraftLabel(row.expenseTypeLabel || 'Mặt bằng')
    setError('')
  }

  const cancelEdit = () => {
    setEditingId('')
    setDraftAmount('')
    setDraftStartDate('')
    setDraftLabel('')
    setError('')
  }

  const saveEdit = async (row) => {
    setSaving(true)
    setError('')
    const result = await updateBranchFixedCostFields(row.id, {
      amount: draftAmount,
      startDate: draftStartDate,
      expenseTypeLabel: draftLabel,
    })
    setSaving(false)
    if (!result.success) {
      // Fallback nếu chưa có cột start_date
      const amountOnly = await updateBranchFixedCostAmount(row.id, draftAmount)
      if (!amountOnly.success) {
        setError(result.error ?? amountOnly.error ?? 'Không thể lưu')
        return
      }
    }
    cancelEdit()
    onUpdated?.(result.data)
  }

  const togglePause = async (row) => {
    setSaving(true)
    setError('')
    const next = row.status === 'paused' ? 'active' : 'paused'
    const result = await setBranchFixedCostStatus(row.id, next)
    setSaving(false)
    if (!result.success) {
      setError(result.error ?? 'Không thể cập nhật trạng thái')
      return
    }
    onUpdated?.(result.data)
  }

  const handleAdd = async () => {
    setSaving(true)
    setError('')
    const result = await addBranchFixedCost(newRow)
    setSaving(false)
    if (!result.success) {
      setError(result.error ?? 'Không thể thêm')
      return
    }
    setAdding(false)
    setNewRow({ branchId: '', expenseTypeLabel: 'Mặt bằng', amount: '', startDate: '' })
    onUpdated?.(result.data)
  }

  return (
    <section className="exp-mod__section">
      <div className="exp-mod__section-head">
        <h3 className="exp-mod__section-title">Chi phí cố định</h3>
        <p className="exp-mod__section-desc">
          Tự động tính theo tháng. Tạm ngưng không xóa lịch sử các tháng đã phát sinh.
          {canEdit ? ' Chỉ Admin được thêm / sửa / tạm ngưng.' : ' Chỉ xem.'}
        </p>
      </div>

      {error && <div className="exp-mod__inline-error">{error}</div>}

      {canEdit && (
        <div className="exp-mod__category-add" style={{ marginBottom: 12 }}>
          {!adding ? (
            <button type="button" className="exp-mod__btn exp-mod__btn--primary" onClick={() => setAdding(true)}>
              Thêm khoản cố định
            </button>
          ) : (
            <>
              <select
                value={newRow.branchId}
                onChange={(e) => setNewRow({ ...newRow, branchId: e.target.value })}
                disabled={saving}
              >
                <option value="">Chọn chi nhánh</option>
                {getActiveBranches().map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <input
                value={newRow.expenseTypeLabel}
                onChange={(e) => setNewRow({ ...newRow, expenseTypeLabel: e.target.value })}
                placeholder="Khoản mục"
                disabled={saving}
              />
              <input
                type="number"
                min="0"
                step="1000"
                value={newRow.amount}
                onChange={(e) => setNewRow({ ...newRow, amount: e.target.value })}
                placeholder="Số tiền/tháng"
                disabled={saving}
              />
              <input
                type="date"
                value={newRow.startDate}
                onChange={(e) => setNewRow({ ...newRow, startDate: e.target.value })}
                disabled={saving}
                title="Ngày bắt đầu"
              />
              <button type="button" className="exp-mod__btn exp-mod__btn--primary" disabled={saving} onClick={handleAdd}>
                Lưu
              </button>
              <button type="button" className="exp-mod__btn" disabled={saving} onClick={() => setAdding(false)}>
                Hủy
              </button>
            </>
          )}
        </div>
      )}

      <div className="exp-mod__mini-table-wrap">
        <table className="exp-mod__mini-table">
          <thead>
            <tr>
              <th>Chi nhánh</th>
              <th>Khoản mục</th>
              <th className="is-money">Số tiền/tháng</th>
              <th>Ngày bắt đầu</th>
              <th>Trạng thái</th>
              {canEdit && <th>Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {fixedCosts.length === 0 ? (
              <tr><td colSpan={canEdit ? 6 : 5}>Chưa có chi phí cố định</td></tr>
            ) : fixedCosts.map((row) => (
              <tr key={row.id} className={row.status === 'paused' ? 'is-voided' : undefined}>
                <td>{row.branchName}</td>
                <td>
                  {editingId === row.id ? (
                    <input
                      className="exp-mod__inline-input"
                      value={draftLabel}
                      onChange={(e) => setDraftLabel(e.target.value)}
                      disabled={saving}
                    />
                  ) : (
                    row.expenseTypeLabel || 'Mặt bằng'
                  )}
                </td>
                <td className="is-money">
                  {editingId === row.id ? (
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      className="exp-mod__inline-input"
                      value={draftAmount}
                      onChange={(e) => setDraftAmount(e.target.value)}
                      disabled={saving}
                    />
                  ) : (
                    formatCurrency(row.amount)
                  )}
                </td>
                <td>
                  {editingId === row.id ? (
                    <input
                      type="date"
                      className="exp-mod__inline-input"
                      value={draftStartDate}
                      onChange={(e) => setDraftStartDate(e.target.value)}
                      disabled={saving}
                    />
                  ) : (
                    row.startDate || '—'
                  )}
                </td>
                <td>{row.status === 'paused' ? 'Tạm ngưng' : 'Đang áp dụng'}</td>
                {canEdit && (
                  <td>
                    {editingId === row.id ? (
                      <div className="exp-mod__inline-actions">
                        <button type="button" className="exp-mod__btn exp-mod__btn--primary" disabled={saving} onClick={() => saveEdit(row)}>
                          Lưu
                        </button>
                        <button type="button" className="exp-mod__btn" disabled={saving} onClick={cancelEdit}>
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <div className="exp-mod__inline-actions">
                        <button type="button" className="exp-mod__link-btn" onClick={() => startEdit(row)}>Sửa</button>
                        <button type="button" className="exp-mod__link-btn" disabled={saving} onClick={() => togglePause(row)}>
                          {row.status === 'paused' ? 'Kích hoạt' : 'Tạm ngưng'}
                        </button>
                        <button type="button" className="exp-mod__link-btn" onClick={() => setHistoryRow(row)}>Lịch sử</button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}><strong>Tổng đang áp dụng / tháng</strong></td>
              <td className="is-money"><strong>{formatCurrency(activeTotal)}</strong></td>
              <td colSpan={canEdit ? 3 : 2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <ExpenseHistoryModal
        open={Boolean(historyRow)}
        expense={historyRow ? { id: historyRow.id, content: `${historyRow.branchName} · ${historyRow.expenseTypeLabel}` } : null}
        entityType="fixed_cost"
        onClose={() => setHistoryRow(null)}
      />
    </section>
  )
}
