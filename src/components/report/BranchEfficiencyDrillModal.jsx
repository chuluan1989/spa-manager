import { BRANCH_EFFICIENCY_DRILL_TYPES } from '../../utils/managementReports/branchEfficiencyDrillDown'
import { formatCurrency } from '../../utils/invoice'

function money(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return formatCurrency(Number(value))
}

function Empty({ text = 'Không có dòng chi tiết.' }) {
  return <p className="bep-drill__empty">{text}</p>
}

function TotalRow({ label = 'Tổng', value, colSpan, trailingSpan = 0 }) {
  return (
    <tfoot>
      <tr className="bep-drill__total">
        <td colSpan={colSpan}>{label}</td>
        <td className="is-num">{money(value)}</td>
        {trailingSpan > 0 ? <td colSpan={trailingSpan} /> : null}
      </tr>
    </tfoot>
  )
}

function RevenueTable({ model }) {
  if (!model.lines.length) return <Empty />
  return (
    <div className="bep-drill__scroll">
      <table className="bep-drill__table">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Mã hóa đơn</th>
            <th>Nhân viên</th>
            <th>Chi nhánh phục vụ</th>
            <th>Dịch vụ</th>
            <th className="is-num">Doanh thu dịch vụ</th>
            <th>Phương thức thanh toán</th>
          </tr>
        </thead>
        <tbody>
          {model.lines.map((line, idx) => (
            <tr key={`${line.invoiceId}-${idx}`}>
              <td>{line.date || '—'}</td>
              <td className="bep-mono">{line.invoiceId || '—'}</td>
              <td>{line.employeeName}</td>
              <td>{line.servingBranchName}</td>
              <td className="bep-drill__services">{line.services}</td>
              <td className="is-num">{money(line.revenue)}</td>
              <td>{line.paymentMethodLabel}</td>
            </tr>
          ))}
        </tbody>
        <TotalRow value={model.total} colSpan={5} trailingSpan={1} />
      </table>
    </div>
  )
}

function OpexTable({ model }) {
  if (!model.lines.length) return <Empty />
  const Section = ({ title, lines, sectionTotal }) => (
    <section className="bep-drill__section">
      <h4>{title} <span className="bep-drill__section-total">{money(sectionTotal)}</span></h4>
      {lines.length === 0 ? (
        <p className="bep-drill__empty">Không có</p>
      ) : (
        <div className="bep-drill__scroll">
          <table className="bep-drill__table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Nhóm chi phí</th>
                <th>Nội dung</th>
                <th className="is-num">Số tiền</th>
                <th>Chi nhánh</th>
                <th>Người nhập</th>
                <th>Nguồn</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={`${line.source}-${line.date}-${idx}`}>
                  <td>{line.date || '—'}</td>
                  <td>{line.expenseTypeLabel}</td>
                  <td>{line.content}</td>
                  <td className="is-num">{money(line.amount)}</td>
                  <td>{line.branchName}</td>
                  <td>{line.enteredBy}</td>
                  <td><span className="bep-pill">{line.sourceLabel}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )

  return (
    <div className="bep-drill__opex">
      <Section title="Mặt bằng cố định" lines={model.fixedLines} sectionTotal={model.fixedTotal} />
      <Section title="Chi phí phát sinh" lines={model.variableLines} sectionTotal={model.variableTotal} />
      <p className="bep-drill__grand-total">
        Tổng chi phí vận hành: <strong>{money(model.total)}</strong>
      </p>
    </div>
  )
}

function CommissionTable({ model }) {
  if (!model.lines.length) return <Empty />
  return (
    <div className="bep-drill__scroll">
      <table className="bep-drill__table">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Mã hóa đơn</th>
            <th>Nhân viên</th>
            <th>Vai trò</th>
            <th>Chi nhánh phục vụ</th>
            <th className="is-num">Doanh thu dịch vụ</th>
            <th className="is-num">% snapshot</th>
            <th>Tỷ lệ thực hưởng</th>
            <th className="is-num">Tiền % hóa đơn thực trả</th>
          </tr>
        </thead>
        <tbody>
          {model.lines.map((line, idx) => (
            <tr key={`${line.invoiceId}-${line.role}-${idx}`}>
              <td>{line.date || '—'}</td>
              <td className="bep-mono">{line.invoiceId || '—'}</td>
              <td>{line.employeeName}</td>
              <td>{line.roleLabel}</td>
              <td>{line.servingBranchName}</td>
              <td className="is-num">{money(line.invoiceRevenue)}</td>
              <td className="is-num">{money(line.snapshotCommission)}</td>
              <td>{line.rateLabel}</td>
              <td className="is-num">{money(line.amountPaid)}</td>
            </tr>
          ))}
        </tbody>
        <TotalRow label="Tổng % hóa đơn thực trả" value={model.total} colSpan={8} />
      </table>
    </div>
  )
}

function BonusTable({ model }) {
  if (!model.lines.length) return <Empty />
  return (
    <div className="bep-drill__scroll">
      <table className="bep-drill__table">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Nhân viên</th>
            <th>Chi nhánh</th>
            <th className="is-num">Số tiền</th>
            <th>Lý do</th>
            <th>Người tạo</th>
          </tr>
        </thead>
        <tbody>
          {model.lines.map((line, idx) => (
            <tr key={`${line.date}-${line.employeeName}-${idx}`}>
              <td>{line.date || '—'}</td>
              <td>{line.employeeName}</td>
              <td>{line.branchName}</td>
              <td className="is-num">{money(line.amount)}</td>
              <td>{line.reason}</td>
              <td>{line.createdBy}</td>
            </tr>
          ))}
        </tbody>
        <TotalRow value={model.total} colSpan={3} trailingSpan={2} />
      </table>
    </div>
  )
}

function PenaltyTable({ model }) {
  if (!model.lines.length && !(model.duplicateWarnings || []).length) return <Empty />
  return (
    <div>
      {(model.duplicateWarnings || []).length > 0 && (
        <div className="bep-drill__warn" role="status">
          Có {model.duplicateWarnings.length} cảnh báo nghi trùng phạt (đã loại khỏi tổng).
        </div>
      )}
      <div className="bep-drill__scroll">
        <table className="bep-drill__table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Nhân viên</th>
              <th>Chi nhánh</th>
              <th className="is-num">Số tiền</th>
              <th>Nguồn</th>
              <th>Lý do</th>
              <th>Cảnh báo</th>
            </tr>
          </thead>
          <tbody>
            {model.lines.map((line, idx) => (
              <tr key={`${line.source}-${line.date}-${idx}`} className={line.duplicateSuspect ? 'is-dup' : ''}>
                <td>{line.date || '—'}</td>
                <td>{line.employeeName}</td>
                <td>{line.branchName}</td>
                <td className="is-num">{money(line.amount)}</td>
                <td><span className="bep-pill">{line.sourceLabel}</span></td>
                <td>{line.reason}</td>
                <td>
                  {line.duplicateSuspect
                    ? <span className="bep-badge bep-badge--warn">Nghi trùng phạt</span>
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <TotalRow value={model.total} colSpan={3} trailingSpan={3} />
        </table>
      </div>
    </div>
  )
}

function ProfitExplain({ model }) {
  return (
    <div className="bep-drill__profit">
      <p className="bep-drill__formula">{model.formula}</p>
      <table className="bep-drill__table bep-drill__table--profit">
        <tbody>
          {model.components.map((c) => (
            <tr key={c.key}>
              <td className="bep-drill__sign">{c.sign}</td>
              <td>{c.label}</td>
              <td className="is-num">{money(c.amount)}</td>
            </tr>
          ))}
          <tr className="bep-drill__profit-result">
            <td>=</td>
            <td>Lợi nhuận</td>
            <td className={`is-num${model.profit < 0 ? ' is-loss' : ''}`}>{money(model.profit)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function BranchEfficiencyDrillModal({
  open,
  onClose,
  model,
  branchName = '',
  periodLabel = '',
}) {
  if (!open || !model) return null

  let body = null
  switch (model.type) {
    case BRANCH_EFFICIENCY_DRILL_TYPES.REVENUE:
      body = <RevenueTable model={model} />
      break
    case BRANCH_EFFICIENCY_DRILL_TYPES.OPEX:
      body = <OpexTable model={model} />
      break
    case BRANCH_EFFICIENCY_DRILL_TYPES.COMMISSION:
      body = <CommissionTable model={model} />
      break
    case BRANCH_EFFICIENCY_DRILL_TYPES.BONUS:
      body = <BonusTable model={model} />
      break
    case BRANCH_EFFICIENCY_DRILL_TYPES.PENALTY:
      body = <PenaltyTable model={model} />
      break
    case BRANCH_EFFICIENCY_DRILL_TYPES.PROFIT:
      body = <ProfitExplain model={model} />
      break
    default:
      body = <Empty />
  }

  return (
    <div className="bep-drill-overlay" role="presentation" onClick={onClose}>
      <div
        className="bep-drill-modal"
        role="dialog"
        aria-modal="true"
        aria-label={model.title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bep-drill-modal__header">
          <div>
            <h3>{model.title}</h3>
            <p>
              {branchName || '—'}
              {periodLabel ? ` · ${periodLabel}` : ''}
            </p>
          </div>
          <button type="button" className="bep-btn" onClick={onClose}>
            Đóng
          </button>
        </header>
        <div className="bep-drill-modal__body">
          {body}
        </div>
      </div>
    </div>
  )
}
