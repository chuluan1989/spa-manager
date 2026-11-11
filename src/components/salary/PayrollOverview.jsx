import { useState } from 'react'
import { PAY_CYCLE_OPTIONS } from '../../utils/salaryReport'
import { formatCurrency } from '../../utils/invoice'
import { isPayrollMonthLocked } from '../../utils/payrollEngine'
import { resolveCanonicalBranchId } from '../../constants/canonicalBranches'
import { buildPayrollOverviewFigures } from './payrollOverviewFigures'

function formatIso(value) {
  const text = String(value ?? '').slice(0, 10)
  const [year, month, day] = text.split('-')
  if (!year || !month || !day) return ''
  return `${day}/${month}/${year}`
}

function formatDays(value) {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) return '0'
  return Number.isInteger(number) ? String(number) : number.toFixed(1)
}

function MetricRow({ tone, cells }) {
  return (
    <div className={`salary-overview__row salary-overview__row--${tone}`}>
      {cells.map((cell) => (
        <div
          key={cell.label}
          className={`salary-overview__cell${cell.total ? ' salary-overview__cell--total' : ''}`}
        >
          <span>{cell.label}</span>
          <strong>{cell.value}</strong>
        </div>
      ))}
    </div>
  )
}

function BranchAllocation({ sections, stats, viewBranchId, figures, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const allSections = Array.isArray(sections) ? sections : []
  const scoped = viewBranchId
    ? allSections.filter(
      (section) => resolveCanonicalBranchId(section.branchId) === resolveCanonicalBranchId(viewBranchId),
    )
    : allSections
  const hidden = viewBranchId
    ? allSections.filter(
      (section) => resolveCanonicalBranchId(section.branchId) !== resolveCanonicalBranchId(viewBranchId),
    )
    : []
  const multi = allSections.length > 1

  return (
    <section className="salary-overview__block">
      <button
        type="button"
        className="salary-overview__fold"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Thu nhập & khấu trừ theo chi nhánh</span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="salary-overview__fold-body">
          {multi ? (
            <>
              {scoped.map((section) => (
                <article key={section.branchId} className="salary-overview__branch">
                  <header>
                    <strong>{section.branchName}</strong>
                    <span>
                      {section.invoiceCount ?? 0} hóa đơn
                      {' · '}
                      {formatDays(section.workDays)} ngày công
                    </span>
                  </header>
                  <MetricRow
                    tone="branch"
                    cells={[
                      { label: 'Doanh thu tiền vé', value: formatCurrency(section.ticketRevenue ?? 0) },
                      { label: 'Hoa hồng', value: formatCurrency(section.commission ?? 0) },
                      { label: 'Tips', value: formatCurrency(section.tips ?? 0) },
                      { label: 'Thưởng', value: formatCurrency(section.bonus ?? 0) },
                      { label: 'KPI', value: formatCurrency(section.kpi ?? 0) },
                      { label: 'Phạt tại chi nhánh', value: formatCurrency(section.penalty ?? 0) },
                      { label: 'Giảm lương', value: formatCurrency(section.reduction ?? 0) },
                      { label: 'Ứng lương', value: formatCurrency(section.advance ?? 0) },
                      { label: 'Lương ghi nhận tại chi nhánh', value: formatCurrency(section.netSalary ?? 0) },
                    ]}
                  />
                </article>
              ))}
              {hidden.length > 0 && (
                <p className="salary-overview__note">
                  Lương thực nhận đã gồm thu nhập tại {hidden.map((section) => section.branchName).join(', ')}.
                  Danh sách này chỉ mở chi nhánh đang xem.
                </p>
              )}
              <p className="salary-overview__note">
                Không cộng các dòng lương chi nhánh thành lương thực nhận.
                Lương cơ bản và phạt KPI nằm ở tổng kỳ, không tách theo chi nhánh.
              </p>
            </>
          ) : (
            <>
              <p className="salary-overview__note">
                {stats?.branchName || 'Chi nhánh gốc'}
                {' · '}
                {stats?.invoiceCount ?? 0} hóa đơn
                {' · '}
                {formatDays(stats?.workDays)} ngày công
              </p>
              <MetricRow
                tone="branch"
                cells={[
                  { label: 'Doanh thu tiền vé', value: formatCurrency(figures.ticketRevenue) },
                ]}
              />
              <p className="salary-overview__note">
                Doanh thu tiền vé là chỉ tiêu kinh doanh. Hoa hồng, tips và lương thực nhận nằm ở phần tổng hợp phía trên.
                Chi tiết hóa đơn ở tab Doanh thu.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default function PayrollOverview({
  employee,
  stats,
  attendanceStats,
  breakdown,
  cycle,
  month,
  fromDate,
  toDate,
  locks,
  viewBranchId = '',
  defaultAttendanceOpen = false,
  defaultBranchOpen = false,
}) {
  const [attendanceOpen, setAttendanceOpen] = useState(defaultAttendanceOpen)
  if (!stats) return null

  const figures = buildPayrollOverviewFigures(stats)
  const cycleLabel = PAY_CYCLE_OPTIONS.find((option) => option.value === cycle)?.label ?? 'Kỳ lương'
  const periodText = [formatIso(fromDate), formatIso(toDate)].filter(Boolean).join(' – ')
  const locked = Array.isArray(locks) && month
    ? isPayrollMonthLocked(month, stats.branchId || employee?.branchId, locks)
    : false
  const showKpiBridge = figures.originalKpiPenalty !== 0 || figures.kpiPenaltyReduction !== 0

  const attendanceDetails = []
  if (breakdown) {
    attendanceDetails.push(
      ['Nghỉ có phép', formatDays(breakdown.permittedDays)],
      ['Nghỉ được miễn', formatDays(breakdown.permittedFreeDays)],
      ['Nghỉ vượt hạn mức', formatDays(breakdown.permittedExceedDays)],
      ['Nghỉ không phép', formatDays(breakdown.unpermittedDays)],
      ['Nghỉ T7/CN/Lễ', formatDays(breakdown.weekendHolidayDays)],
    )
  } else if (attendanceStats) {
    attendanceDetails.push(
      ['Nghỉ có phép', formatDays(attendanceStats.permittedLeave)],
      ['Nghỉ không phép', formatDays(attendanceStats.unpermittedLeave)],
      ['Nghỉ T7/CN/Lễ', formatDays(attendanceStats.weekendHoliday)],
    )
  }
  if (attendanceStats) {
    attendanceDetails.push(['Đi làm', formatDays(attendanceStats.onTime)])
  }
  if (breakdown) {
    const latePenalty = Number(breakdown.latePenalty ?? 0)
    const earlyPenalty = Number(breakdown.earlyPenalty ?? 0)
    const permittedPenalty = Number(breakdown.permittedPenalty ?? 0)
    const unpermittedPenalty = Number(breakdown.unpermittedPenalty ?? 0)
    const weekendPenalty = Number(breakdown.weekendPenalty ?? 0)
    const otherPenalty = Number(breakdown.otherPenalty ?? 0)
    const grouped = latePenalty + earlyPenalty + permittedPenalty + unpermittedPenalty + weekendPenalty + otherPenalty
    const remainder = figures.attendancePenalty - grouped
    attendanceDetails.push(
      ['Phạt đi trễ', formatCurrency(latePenalty)],
      ['Phạt về sớm', formatCurrency(earlyPenalty)],
      ['Phạt nghỉ có phép', formatCurrency(permittedPenalty)],
      ['Phạt nghỉ không phép', formatCurrency(unpermittedPenalty)],
      ['Phạt nghỉ T7/CN/Lễ', formatCurrency(weekendPenalty)],
    )
    if (otherPenalty !== 0) attendanceDetails.push(['Phạt chấm công khác', formatCurrency(otherPenalty)])
    if (remainder !== 0) attendanceDetails.push(['Phạt chấm công chưa phân loại', formatCurrency(remainder)])
  }

  return (
    <div className="salary-overview">
      <div className="salary-overview__meta">
        <strong>{stats.employeeName || employee?.employeeName || employee?.name}</strong>
        <span>{stats.branchName || '—'}</span>
        <span>{cycleLabel}{periodText ? ` · ${periodText}` : ''}</span>
        {locked ? <em>Đã khóa kỳ</em> : null}
      </div>

      <section className="salary-overview__net" aria-label="Lương thực nhận">
        <div>
          <span>Lương thực nhận</span>
          <strong>{formatCurrency(figures.netSalary)}</strong>
        </div>
        <p>
          Đã thanh toán {formatCurrency(figures.paidAmount)}
          <br />
          Còn phải trả {formatCurrency(figures.remainingAmount)}
        </p>
      </section>

      <section className="salary-overview__block">
        <h3>Thu nhập</h3>
        <MetricRow
          tone="income"
          cells={[
            { label: 'Lương cơ bản', value: formatCurrency(figures.baseSalary) },
            { label: 'Hoa hồng', value: formatCurrency(figures.commission) },
            { label: 'Tips', value: formatCurrency(figures.tips) },
            { label: 'Thưởng', value: formatCurrency(figures.bonus) },
            { label: 'KPI', value: formatCurrency(figures.kpi) },
            { label: 'Tổng thu nhập', value: formatCurrency(figures.totalIncome), total: true },
          ]}
        />
      </section>

      <section className="salary-overview__block">
        <h3>Khấu trừ</h3>
        <MetricRow
          tone="deduction"
          cells={[
            { label: 'Phạt chấm công', value: formatCurrency(figures.attendancePenalty) },
            { label: 'Phạt KPI thực tế', value: formatCurrency(figures.kpiPenalty) },
            { label: 'Phạt khác', value: formatCurrency(figures.manualPenalty) },
            { label: 'Giảm lương', value: formatCurrency(figures.reduction) },
            { label: 'Ứng lương', value: formatCurrency(figures.advance) },
            { label: 'Tổng khấu trừ', value: formatCurrency(figures.totalDeduction), total: true },
          ]}
        />
        {showKpiBridge && (
          <p className="salary-overview__note">
            Phạt KPI gốc {formatCurrency(figures.originalKpiPenalty)}
            {' · '}
            Miễn/giảm {formatCurrency(figures.kpiPenaltyReduction)}
            {' · '}
            Số đã trừ là phạt KPI thực tế, không cộng thêm hai cột này.
          </p>
        )}
        {!figures.penaltyPartsMatch && (
          <p className="salary-overview__note">
            Tổng khấu trừ dùng khoản Phạt của công thức lương ({formatCurrency(figures.penalty)}).
          </p>
        )}
        {figures.otherAdjustment !== 0 && (
          <p className="salary-overview__note">
            Điều chỉnh khác {formatCurrency(figures.otherAdjustment)} không cộng vào lương thực nhận.
          </p>
        )}
        {!figures.reconciled && (
          <p className="salary-overview__note">
            Các cột thu nhập và khấu trừ chưa khớp lương thực nhận đang hiển thị.
          </p>
        )}
      </section>

      <section className="salary-overview__block">
        <h3>Chuyên cần</h3>
        <MetricRow
          tone="attendance"
          cells={[
            { label: 'Ngày công', value: formatDays(stats.workDays) },
            { label: 'Ngày nghỉ', value: formatDays(stats.leaveDays) },
            { label: 'Đi trễ', value: formatDays(attendanceStats?.late) },
            { label: 'Về sớm', value: formatDays(attendanceStats?.early) },
          ]}
        />
        <button
          type="button"
          className="salary-overview__fold salary-overview__fold--sub"
          aria-expanded={attendanceOpen}
          onClick={() => setAttendanceOpen((value) => !value)}
        >
          <span>Chi tiết chuyên cần</span>
          <span aria-hidden="true">{attendanceOpen ? '▴' : '▾'}</span>
        </button>
        {attendanceOpen && (
          <>
            <dl className="salary-overview__detail">
              {attendanceDetails.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {breakdown && (
              <p className="salary-overview__note">
                Phạt đi trễ, về sớm và từng loại ngày nghỉ là thành phần của Phạt chấm công. Cộng các dòng tiền này bằng cột Phạt chấm công.
              </p>
            )}
          </>
        )}
      </section>

      <BranchAllocation
        sections={stats.branchSections}
        stats={stats}
        viewBranchId={viewBranchId}
        figures={figures}
        defaultOpen={defaultBranchOpen}
      />
    </div>
  )
}
