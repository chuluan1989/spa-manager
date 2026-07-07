import { useState } from 'react'
import BranchBanner from '../common/BranchBanner'
import { canSelectBranch, getCurrentUserBranch, getCurrentUserBranchName, getCurrentUserName } from '../../constants/auth'
import { getActiveBranches } from '../../constants/branches'
import { EXPENSE_TYPES } from '../../constants/expenseTypes'
import { readReceiptImage } from '../../utils/expenseStorage'
import { getTodayDate } from '../../utils/invoiceStorage'
import './ExpenseModules.css'

function getCurrentTime() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export default function ExpenseFormModal({
  open,
  onClose,
  onSubmit,
  initialData = null,
  title = 'Thêm chi phí',
}) {
  const lockedBranch = !canSelectBranch()
  const [form, setForm] = useState(() => initialData ?? {
    date: getTodayDate(),
    expenseTime: getCurrentTime(),
    branchId: lockedBranch ? getCurrentUserBranch() : '',
    expenseType: '',
    content: '',
    amount: '',
    paidBy: '',
    enteredBy: getCurrentUserName(),
    note: '',
    receiptImage: '',
  })
  const [errors, setErrors] = useState({})
  const [receiptName, setReceiptName] = useState('')

  if (!open) return null

  const validate = () => {
    const next = {}
    if (!form.date) next.date = 'Vui lòng chọn ngày'
    if (!form.branchId) next.branchId = 'Vui lòng chọn chi nhánh'
    if (!form.expenseType) next.expenseType = 'Vui lòng chọn nhóm chi phí'
    if (!form.content?.trim()) next.content = 'Vui lòng nhập nội dung'
    if (!form.amount || Number(form.amount) <= 0) next.amount = 'Số tiền không hợp lệ'
    if (!form.enteredBy?.trim()) next.enteredBy = 'Vui lòng nhập người nhập'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      branchId: lockedBranch ? getCurrentUserBranch() : form.branchId,
    }
    if (!validate()) return
    onSubmit(payload)
  }

  const handleReceiptChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await readReceiptImage(file)
    if (!result.success) {
      setErrors((prev) => ({ ...prev, receiptImage: result.error }))
      return
    }
    setForm({ ...form, receiptImage: result.dataUrl })
    setReceiptName(file.name)
    setErrors((prev) => ({ ...prev, receiptImage: undefined }))
  }

  return (
    <div className="exp-mod__modal-overlay" onClick={onClose}>
      <div className="exp-mod__modal" onClick={(e) => e.stopPropagation()}>
        <div className="exp-mod__modal-head">
          <h3>{title}</h3>
          <button type="button" className="exp-mod__modal-close" onClick={onClose}>×</button>
        </div>
        <form className="exp-mod__form" onSubmit={handleSubmit}>
          {lockedBranch && <BranchBanner branchName={getCurrentUserBranchName()} />}

          <div className="exp-mod__form-grid">
            <label>
              <span>Ngày</span>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              {errors.date && <em>{errors.date}</em>}
            </label>
            <label>
              <span>Giờ</span>
              <input type="time" value={form.expenseTime} onChange={(e) => setForm({ ...form, expenseTime: e.target.value })} />
            </label>
            {canSelectBranch() && (
              <label>
                <span>Chi nhánh</span>
                <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                  <option value="">Chọn chi nhánh</option>
                  {getActiveBranches().map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                {errors.branchId && <em>{errors.branchId}</em>}
              </label>
            )}
            <label>
              <span>Nhóm chi phí</span>
              <select value={form.expenseType} onChange={(e) => setForm({ ...form, expenseType: e.target.value })}>
                <option value="">Chọn nhóm</option>
                {EXPENSE_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
              {errors.expenseType && <em>{errors.expenseType}</em>}
            </label>
            <label>
              <span>Số tiền</span>
              <input type="number" min="0" step="1000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              {errors.amount && <em>{errors.amount}</em>}
            </label>
            <label>
              <span>Người chi</span>
              <input value={form.paidBy} onChange={(e) => setForm({ ...form, paidBy: e.target.value })} placeholder="Tên người chi" />
            </label>
            <label className="is-full">
              <span>Nội dung chi</span>
              <input value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Mô tả nội dung chi phí" />
              {errors.content && <em>{errors.content}</em>}
            </label>
            <label>
              <span>Người nhập</span>
              <input value={form.enteredBy} onChange={(e) => setForm({ ...form, enteredBy: e.target.value })} />
              {errors.enteredBy && <em>{errors.enteredBy}</em>}
            </label>
            <label className="is-full">
              <span>Ghi chú</span>
              <textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
            <label className="is-full">
              <span>Ảnh hóa đơn</span>
              <input type="file" accept="image/*" onChange={handleReceiptChange} />
              {receiptName && <small>{receiptName}</small>}
              {form.receiptImage && (
                <img src={form.receiptImage} alt="Hóa đơn" className="exp-mod__receipt-preview" />
              )}
              {errors.receiptImage && <em>{errors.receiptImage}</em>}
            </label>
          </div>
          <div className="exp-mod__modal-actions">
            <button type="submit" className="exp-mod__btn exp-mod__btn--primary">Lưu</button>
            <button type="button" className="exp-mod__btn" onClick={onClose}>Hủy</button>
          </div>
        </form>
      </div>
    </div>
  )
}
