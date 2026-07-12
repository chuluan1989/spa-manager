import { useMemo, useState } from 'react'
import { formatCurrency } from '../../utils/invoice'
import { updateBranchFixedCostAmount } from '../../utils/fixedCostStorage'
import './ExpenseModules.css'

export default function FixedCostsPanel({
  fixedCosts = [],
  canEdit = false,
  onUpdated,
}) {
  const [editingId, setEditingId] = useState('')
  const [draftAmount, setDraftAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const total = useMemo(
    () => fixedCosts.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    [fixedCosts],
  )

  const startEdit = (row) => {
    setEditingId(row.id)
    setDraftAmount(String(row.amount ?? 0))
    setError('')
  }

  const cancelEdit = () => {
    setEditingId('')
    setDraftAmount('')
    setError('')
  }

  const saveEdit = async (row) => {
    setSaving(true)
    setError('')
    const result = await updateBranchFixedCostAmount(row.id, draftAmount)
    setSaving(false)
    if (!result.success) {
      setError(result.error ?? 'Không thể lưu')
      return
    }
    cancelEdit()
    onUpdated?.(result.data)
  }

  return (
    <section className="exp-mod__section">
      <div className="exp-mod__section-head">
        <h3 className="exp-mod__section-title">Chi phí cố định</h3>
        <p className="exp-mod__section-desc">
          Tiền thuê mặt bằng theo tháng — tự động tính mỗi tháng, không cần nhập lại.
          {canEdit ? ' Chỉ Admin được sửa khi cần thay đổi.' : ' Quản lý chi nhánh chỉ xem, không được sửa.'}
        </p>
      </div>

      {error && <div className="exp-mod__inline-error">{error}</div>}

      <div className="exp-mod__mini-table-wrap">
        <table className="exp-mod__mini-table">
          <thead>
            <tr>
              <th>Chi nhánh</th>
              <th>Khoản mục</th>
              <th className="is-money">Số tiền / tháng</th>
              {canEdit && <th>Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {fixedCosts.length === 0 ? (
              <tr><td colSpan={canEdit ? 4 : 3}>Chưa có chi phí cố định</td></tr>
            ) : fixedCosts.map((row) => (
              <tr key={row.id}>
                <td>{row.branchName}</td>
                <td>{row.expenseTypeLabel || 'Mặt bằng'}</td>
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
                      <button type="button" className="exp-mod__link-btn" onClick={() => startEdit(row)}>
                        Sửa
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}><strong>Tổng mặt bằng / tháng</strong></td>
              <td className="is-money"><strong>{formatCurrency(total)}</strong></td>
              {canEdit && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
