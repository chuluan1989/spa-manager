import { useMemo, useState } from 'react'
import BranchBanner from '../common/BranchBanner'
import {
  canSelectBranch,
  getCurrentUserBranch,
  getCurrentUserBranchName,
  getCurrentUserName,
  isEmployee,
} from '../../constants/auth'
import { getActiveBranches } from '../../constants/branches'
import { SALARY_ADVANCE_EXPENSE_TYPE } from '../../constants/salaryAdvanceTypes'
import { loadEmployees } from '../../utils/employeeStorage'
import { isEmployeeInBranch } from '../../utils/employeeStorage'
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
  expenseTypes = [],
}) {
  const lockedBranch = !canSelectBranch()
  const [form, setForm] = useState(() => initialData ?? {
    date: getTodayDate(),
    advanceDate: getTodayDate(),
    expenseTime: getCurrentTime(),
    branchId: lockedBranch ? getCurrentUserBranch() : '',
    expenseType: '',
    employeeId: '',
    content: '',
    amount: '',
    paidBy: '',
    enteredBy: getCurrentUserName(),
    note: '',
    receiptImage: '',
  })
  const [errors, setErrors] = useState({})
  const [receiptName, setReceiptName] = useState('')

  const isSalaryAdvance = form.expenseType === SALARY_ADVANCE_EXPENSE_TYPE
  const branchId = lockedBranch ? getCurrentUserBranch() : form.branchId

  const employeeOptions = useMemo(() => {
    const all = loadEmployees().filter((emp) => emp.status !== 'inactive')
    if (!branchId) return all
    return all.filter((emp) => isEmployeeInBranch(emp.id, branchId))
  }, [branchId, open])

  if (!open) return null

  const validate = () => {
    const next = {}
    if (!form.date) next.date = 'Vui lòng chọn ngày'
    if (!branchId) next.branchId = 'Vui lòng chọn chi nhánh'
    if (!form.expenseType) next.expenseType = 'Vui lòng chọn nhóm chi phí'
    if (isSalaryAdvance) {
      if (!form.employeeId) next.employeeId = 'Vui lòng chọn nhân viên'
      if (!form.advanceDate) next.advanceDate = 'Vui lòng chọn ngày ứng'
    }
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
      branchId,
      date: isSalaryAdvance ? (form.advanceDate || form.date) : form.date,
      advanceDate: isSalaryAdvance ? (form.advanceDate || form.date) : '',
    }
    if (!validate()) return
    onSubmit(payload)
  }

  const handleReceiptChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await readReceiptImage(file, initialData?.id || form.branchId || 'expense')
    if (!result.success) {
      setErrors((prev) => ({ ...prev, receiptImage: result.error }))
      return
    }
    setForm({ ...form, receiptImage: result.dataUrl })
    setReceiptName(file.name)
    setErrors((prev) => ({ ...prev, receiptImage: undefined }))
  }

  const visibleTypes = expenseTypes.filter((type) => {
    if (type.isFixed) return false
    if (type.id === SALARY_ADVANCE_EXPENSE_TYPE && isEmployee()) return false
    return true
  })

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
            {!isSalaryAdvance && (
              <label>
                <span>Ngày</span>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                {errors.date && <em>{errors.date}</em>}
              </label>
            )}
            <label>
              <span>Giờ</span>
              <input type="time" value={form.expenseTime} onChange={(e) => setForm({ ...form, expenseTime: e.target.value })} />
            </label>
            {canSelectBranch() && (
              <label>
                <span>Chi nhánh</span>
                <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value, employeeId: '' })}>
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
                {visibleTypes.map((type) => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
              {errors.expenseType && <em>{errors.expenseType}</em>}
            </label>
            {isSalaryAdvance && (
              <>
                <label>
                  <span>Nhân viên</span>
                  <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                    <option value="">Chọn nhân viên</option>
                    {employeeOptions.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                  {errors.employeeId && <em>{errors.employeeId}</em>}
                </label>
                <label>
                  <span>Ngày ứng</span>
                  <input type="date" value={form.advanceDate || form.date} onChange={(e) => setForm({ ...form, advanceDate: e.target.value, date: e.target.value })} />
                  {errors.advanceDate && <em>{errors.advanceDate}</em>}
                </label>
              </>
            )}
            <label>
              <span>Số tiền</span>
              <input type="number" min="0" step="1000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              {errors.amount && <em>{errors.amount}</em>}
            </label>
            {!isSalaryAdvance && (
              <label>
                <span>Người chi</span>
                <input value={form.paidBy} onChange={(e) => setForm({ ...form, paidBy: e.target.value })} placeholder="Tên người chi" />
              </label>
            )}
            <label className="is-full">
              <span>{isSalaryAdvance ? 'Nội dung / ghi chú' : 'Nội dung chi'}</span>
              <input value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder={isSalaryAdvance ? 'Lý do ứng lương' : 'Mô tả nội dung chi phí'} />
              {errors.content && <em>{errors.content}</em>}
            </label>
            <label>
              <span>Người nhập</span>
              <input value={form.enteredBy} onChange={(e) => setForm({ ...form, enteredBy: e.target.value })} readOnly={isSalaryAdvance} />
              {errors.enteredBy && <em>{errors.enteredBy}</em>}
            </label>
            <label className="is-full">
              <span>Ghi chú</span>
              <textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
            {!isSalaryAdvance && (
              <label className="is-full">
                <span>Ảnh hóa đơn</span>
                <input type="file" accept="image/*" onChange={handleReceiptChange} />
                {receiptName && <small>{receiptName}</small>}
                {form.receiptImage && (
                  <img src={form.receiptImage} alt="Hóa đơn" className="exp-mod__receipt-preview" />
                )}
                {errors.receiptImage && <em>{errors.receiptImage}</em>}
              </label>
            )}
          </div>
          {isSalaryAdvance && (
            <p className="exp-mod__hint">Khoản ứng sẽ tự động khấu trừ vào bảng lương kỳ chứa ngày ứng (01–15 hoặc 16–cuối tháng).</p>
          )}
          <div className="exp-mod__modal-actions">
            <button type="submit" className="exp-mod__btn exp-mod__btn--primary">Lưu</button>
            <button type="button" className="exp-mod__btn" onClick={onClose}>Hủy</button>
          </div>
        </form>
      </div>
    </div>
  )
}
