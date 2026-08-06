import { formatCurrency } from '../../utils/invoice'
import { isExpenseVoided } from '../../utils/expenseStorage'
import './ExpenseModules.css'

export default function ExpenseTable({
  expenses,
  onView,
  onEdit,
  onVoid,
  onHistory,
  canEdit,
  canVoid,
  showBranch = true,
  showVoided = false,
}) {
  const rows = showVoided ? expenses : expenses.filter((exp) => !isExpenseVoided(exp))

  if (rows.length === 0) {
    return <p className="exp-mod__empty">Chưa có khoản chi nào trong phạm vi đã chọn.</p>
  }

  return (
    <div className="exp-mod__table-wrap">
      <table className="exp-mod__table">
        <thead>
          <tr>
            <th>Ngày</th>
            {showBranch && <th>Chi nhánh</th>}
            <th>Nhóm chi phí</th>
            <th>Nội dung</th>
            <th className="is-money">Số tiền</th>
            <th>Người nhập</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((exp) => {
            const voided = isExpenseVoided(exp)
            return (
              <tr key={exp.id} className={voided ? 'is-voided' : undefined}>
                <td>{exp.date}</td>
                {showBranch && <td>{exp.branchName}</td>}
                <td>{exp.expenseTypeLabel}</td>
                <td className="exp-mod__content">
                  {voided && <span className="exp-mod__void-badge">Đã hủy</span>}
                  {exp.content}
                </td>
                <td className="is-money">{formatCurrency(exp.amount)}</td>
                <td>{exp.enteredBy || '—'}</td>
                <td className="exp-mod__actions">
                  <button type="button" className="exp-mod__btn exp-mod__btn--small" onClick={() => onView?.(exp)}>
                    Xem
                  </button>
                  {!voided && canEdit?.(exp) && (
                    <button type="button" className="exp-mod__btn exp-mod__btn--small exp-mod__btn--gold" onClick={() => onEdit?.(exp)}>
                      Sửa
                    </button>
                  )}
                  {!voided && canVoid?.(exp) && (
                    <button type="button" className="exp-mod__btn exp-mod__btn--small exp-mod__btn--danger" onClick={() => onVoid?.(exp)}>
                      Xóa
                    </button>
                  )}
                  <button type="button" className="exp-mod__btn exp-mod__btn--small" onClick={() => onHistory?.(exp)}>
                    Lịch sử
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
