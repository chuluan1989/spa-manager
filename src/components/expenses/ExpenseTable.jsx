import { formatCurrency } from '../../utils/invoice'
import './ExpenseModules.css'

export default function ExpenseTable({
  expenses,
  onView,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  showBranch = true,
}) {
  if (expenses.length === 0) {
    return <p className="exp-mod__empty">Chưa có khoản chi nào trong phạm vi đã chọn.</p>
  }

  return (
    <div className="exp-mod__table-wrap">
      <table className="exp-mod__table">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Giờ</th>
            {showBranch && <th>Chi nhánh</th>}
            <th>Nhóm chi phí</th>
            <th>Nội dung chi</th>
            <th className="is-money">Số tiền</th>
            <th>Người chi</th>
            <th>Người nhập</th>
            <th>Ghi chú</th>
            <th>Ảnh HĐ</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((exp) => (
            <tr key={exp.id}>
              <td>{exp.date}</td>
              <td>{exp.expenseTime || '—'}</td>
              {showBranch && <td>{exp.branchName}</td>}
              <td>{exp.expenseTypeLabel}</td>
              <td className="exp-mod__content">{exp.content}</td>
              <td className="is-money">{formatCurrency(exp.amount)}</td>
              <td>{exp.paidBy || '—'}</td>
              <td>{exp.enteredBy || '—'}</td>
              <td className="exp-mod__note">{exp.note || '—'}</td>
              <td>{exp.receiptImage ? 'Có' : '—'}</td>
              <td className="exp-mod__actions">
                <button type="button" className="exp-mod__btn exp-mod__btn--small" onClick={() => onView?.(exp)}>
                  Chi tiết
                </button>
                {canEdit?.(exp) && (
                  <button type="button" className="exp-mod__btn exp-mod__btn--small exp-mod__btn--gold" onClick={() => onEdit?.(exp)}>
                    Sửa
                  </button>
                )}
                {canDelete?.(exp) && (
                  <button type="button" className="exp-mod__btn exp-mod__btn--small exp-mod__btn--danger" onClick={() => onDelete?.(exp)}>
                    Xóa
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
