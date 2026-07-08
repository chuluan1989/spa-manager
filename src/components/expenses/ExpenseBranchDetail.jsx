import { getActiveBranches } from '../../constants/branches'
import { formatCurrency } from '../../utils/invoice'
import { computeExpenseByDate, computeExpenseByType } from '../../utils/expenseAnalytics'
import ExpenseTable from './ExpenseTable'
import { getBranchShortLabel } from './ExpenseBranchGrid'
import './ExpenseModules.css'

export default function ExpenseBranchDetail({
  branchId,
  expenses,
  onBack,
  onViewExpense,
  onEditExpense,
  onDeleteExpense,
  canEdit,
  canDelete,
}) {
  const branch = getActiveBranches().find((item) => item.id === branchId)
  const branchExpenses = expenses.filter((exp) => exp.branchId === branchId)
  const byDate = computeExpenseByDate(branchExpenses)
  const byType = computeExpenseByType(branchExpenses)
  const total = branchExpenses.reduce((sum, exp) => sum + exp.amount, 0)

  return (
    <section className="exp-mod__branch-detail">
      <div className="exp-mod__detail-head">
        <button type="button" className="exp-mod__back-btn" onClick={onBack}>
          ← Quay lại tổng quan
        </button>
        <div>
          <h3 className="exp-mod__section-title">
            {branch ? getBranchShortLabel(branch) : ''} · {branch?.name}
          </h3>
          <p className="exp-mod__section-desc">Tổng chi phí: {formatCurrency(total)} · {branchExpenses.length} khoản</p>
        </div>
      </div>

      <div className="exp-mod__detail-panels">
        <div className="exp-mod__panel">
          <h4>Chi phí theo ngày</h4>
          <div className="exp-mod__mini-table-wrap">
            <table className="exp-mod__mini-table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th className="is-money">Số tiền</th>
                  <th>Số khoản</th>
                </tr>
              </thead>
              <tbody>
                {byDate.length === 0 ? (
                  <tr><td colSpan={3}>Chưa có dữ liệu</td></tr>
                ) : byDate.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td className="is-money">{formatCurrency(row.total)}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="exp-mod__panel">
          <h4>Chi phí theo nhóm</h4>
          <div className="exp-mod__mini-table-wrap">
            <table className="exp-mod__mini-table">
              <thead>
                <tr>
                  <th>Nhóm</th>
                  <th className="is-money">Số tiền</th>
                  <th>Số khoản</th>
                </tr>
              </thead>
              <tbody>
                {byType.length === 0 ? (
                  <tr><td colSpan={3}>Chưa có dữ liệu</td></tr>
                ) : byType.map((row) => (
                  <tr key={row.typeId}>
                    <td>{row.label}</td>
                    <td className="is-money">{formatCurrency(row.total)}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="exp-mod__panel exp-mod__panel--full">
        <h4>Danh sách khoản chi</h4>
        <ExpenseTable
          expenses={branchExpenses}
          onView={onViewExpense}
          onEdit={onEditExpense}
          onDelete={onDeleteExpense}
          canEdit={canEdit}
          canDelete={canDelete}
          showBranch={false}
        />
      </div>
    </section>
  )
}
