import { formatCurrency } from '../../utils/invoice'
import './ExpenseModules.css'

export default function ExpenseDetailModal({ expense, onClose, onEdit, canEdit }) {
  if (!expense) return null

  return (
    <div className="exp-mod__modal-overlay" onClick={onClose}>
      <div className="exp-mod__modal exp-mod__modal--detail" onClick={(e) => e.stopPropagation()}>
        <div className="exp-mod__modal-head">
          <h3>Chi tiết khoản chi</h3>
          <button type="button" className="exp-mod__modal-close" onClick={onClose}>×</button>
        </div>
        <dl className="exp-mod__detail-list">
          <div><dt>Ngày</dt><dd>{expense.date}</dd></div>
          <div><dt>Giờ</dt><dd>{expense.expenseTime || '—'}</dd></div>
          <div><dt>Chi nhánh</dt><dd>{expense.branchName}</dd></div>
          <div><dt>Nhóm chi phí</dt><dd>{expense.expenseTypeLabel}</dd></div>
          <div><dt>Nội dung</dt><dd>{expense.content}</dd></div>
          <div><dt>Số tiền</dt><dd>{formatCurrency(expense.amount)}</dd></div>
          <div><dt>Người chi</dt><dd>{expense.paidBy || '—'}</dd></div>
          <div><dt>Người nhập</dt><dd>{expense.enteredBy || '—'}</dd></div>
          <div><dt>Ghi chú</dt><dd>{expense.note || '—'}</dd></div>
        </dl>
        {expense.receiptImage && (
          <div className="exp-mod__receipt-box">
            <p>Ảnh hóa đơn</p>
            <img src={expense.receiptImage} alt="Hóa đơn chi phí" />
          </div>
        )}
        <div className="exp-mod__modal-actions">
          {canEdit?.(expense) && (
            <button type="button" className="exp-mod__btn exp-mod__btn--primary" onClick={() => onEdit(expense)}>
              Sửa
            </button>
          )}
          <button type="button" className="exp-mod__btn" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  )
}
