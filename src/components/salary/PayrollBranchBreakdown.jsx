import { PAYROLL_DETAIL_LABELS } from '../../constants/payrollTypes'
import { formatCurrency } from '../../utils/invoice'
import { resolveCanonicalBranchId } from '../../constants/canonicalBranches'

const SECTION_ROWS = [
  ['ticketRevenue', 'revenue'],
  ['commission', 'commission'],
  ['tips', 'tips'],
  ['bonus', 'bonus'],
  ['kpi', 'neutral'],
  ['penalty', 'penalty'],
  ['reduction', 'reduction'],
  ['advance', 'advance'],
  ['otherAdjustment', 'neutral'],
  ['netSalary', 'net'],
]

function formatWorkDays(value) {
  if (value === undefined || value === null) return '0'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatPeriod(fromDate, toDate) {
  if (!fromDate && !toDate) return ''
  if (fromDate && toDate && fromDate === toDate) return fromDate
  if (fromDate && toDate) return `${fromDate} → ${toDate}`
  return fromDate || toDate || ''
}

function BranchSection({ section }) {
  const period = formatPeriod(section.fromDate, section.toDate)
  return (
    <article className="salary-branch-breakdown__section">
      <header className="salary-branch-breakdown__section-head">
        <h4>{section.branchName}</h4>
        <span>
          {period ? `${period} · ` : ''}
          {section.invoiceCount ?? 0} hóa đơn · {formatWorkDays(section.workDays)} ngày công
        </span>
      </header>
      <dl className="salary-branch-breakdown__grid">
        {SECTION_ROWS.map(([key, tone]) => (
          <div key={key} className={`salary-branch-breakdown__item salary-branch-breakdown__item--${tone}`}>
            <dt>{PAYROLL_DETAIL_LABELS[key] ?? key}</dt>
            <dd>{formatCurrency(section[key] ?? 0)}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

export default function PayrollBranchBreakdown({
  sections,
  totalStats,
  viewBranchId = '',
  listInvoiceCount = null,
}) {
  if (!sections?.length || !totalStats) return null

  const scopedSections = viewBranchId
    ? sections.filter(
      (section) => resolveCanonicalBranchId(section.branchId) === resolveCanonicalBranchId(viewBranchId),
    )
    : sections
  const hiddenOtherBranches = viewBranchId
    ? sections.filter(
      (section) => resolveCanonicalBranchId(section.branchId) !== resolveCanonicalBranchId(viewBranchId),
    )
    : []
  const displayInvoiceCount = listInvoiceCount != null
    ? listInvoiceCount
    : (scopedSections[0]?.invoiceCount ?? totalStats.invoiceCount ?? 0)

  return (
    <section className="salary-branch-breakdown">
      <header className="salary-branch-breakdown__head">
        <h3>Phân bổ theo chi nhánh</h3>
      </header>

      {scopedSections.map((section) => (
        <BranchSection key={section.branchId} section={section} />
      ))}

      {hiddenOtherBranches.length > 0 && (
        <p className="salary-branch-breakdown__other-note" role="note">
          Lương thực nhận đã gồm thu nhập tại chi nhánh khác
          {' '}({hiddenOtherBranches.map((s) => s.branchName).join(', ')}).
          Không liệt kê hóa đơn các chi nhánh đó trong danh sách của chi nhánh đang xem.
        </p>
      )}

      <article className="salary-branch-breakdown__section salary-branch-breakdown__section--total">
        <header className="salary-branch-breakdown__section-head">
          <h4>Tổng</h4>
          <span>
            {viewBranchId
              ? `${displayInvoiceCount} hóa đơn (chi nhánh đang xem)`
              : `${totalStats.invoiceCount ?? 0} hóa đơn`}
            {' · '}
            {formatWorkDays(totalStats.workDays)} ngày công
          </span>
        </header>
        <dl className="salary-branch-breakdown__grid">
          <div className="salary-branch-breakdown__item">
            <dt>{PAYROLL_DETAIL_LABELS.baseSalary ?? 'Lương cơ bản'}</dt>
            <dd>{formatCurrency(totalStats.baseSalary ?? 0)}</dd>
          </div>
          {SECTION_ROWS.map(([key, tone]) => (
            <div key={key} className={`salary-branch-breakdown__item salary-branch-breakdown__item--${tone}`}>
              <dt>{PAYROLL_DETAIL_LABELS[key] ?? key}</dt>
              <dd>{formatCurrency(totalStats[key] ?? 0)}</dd>
            </div>
          ))}
        </dl>
      </article>
    </section>
  )
}
