import { useMemo, useState } from 'react'
import { canSelectBranch, getCurrentUserBranch, isAdmin } from '../../constants/auth'
import { loadBranches } from '../../utils/branchStorage'
import { formatCurrency } from '../../utils/invoice'
import { getMonthStartDate, getTodayDate } from '../../utils/invoiceStorage'
import { useServicePerformanceData } from '../../hooks/useServicePerformanceData'
import { buildEmployeeServiceDetail } from '../../utils/servicePerformanceReport'
import './ServicePerformanceReport.css'

function formatShare(share) {
  const pct = (Number(share) || 0) * 100
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(pct)}%`
}

function DiscrepancyNote({ rows }) {
  if (!rows?.length) return null
  const preview = rows.slice(0, 8)
  return (
    <div className="svc-perf__warn" role="status">
      <strong>{rows.length} hóa đơn lệch tổng dòng dịch vụ và service_total.</strong>
      <span> Doanh thu bảng vẫn là tổng giá sau giảm của từng dòng. Dữ liệu hóa đơn không bị sửa.</span>
      <ul>
        {preview.map((row) => (
          <li key={`${row.invoiceId}-${row.date}`}>
            {row.date || '—'} · {row.invoiceId || 'không mã'} · dòng {formatCurrency(row.lineSum)} · đầu phiếu {formatCurrency(row.serviceTotal)}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ServicePerformanceReport() {
  const admin = isAdmin()
  const [fromDate, setFromDate] = useState(() => getMonthStartDate())
  const [toDate, setToDate] = useState(() => getTodayDate())
  const [requestedBranchId, setRequestedBranchId] = useState('')
  const [sortKey, setSortKey] = useState('revenue')
  const [sortDir, setSortDir] = useState('desc')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')

  const branches = useMemo(() => loadBranches().filter((branch) => branch?.id), [])
  const data = useServicePerformanceData({
    enabled: admin,
    fromDate,
    toDate,
    requestedBranchId: admin ? requestedBranchId : '',
    admin,
    sessionBranchId: getCurrentUserBranch(),
    sortKey,
    sortDir,
  })

  const selectedEmployee = data.employees.find((employee) => employee.id === selectedEmployeeId) || null
  const detail = useMemo(() => (
    selectedEmployee
      ? buildEmployeeServiceDetail({
        invoices: data.rankingInvoices,
        employee: selectedEmployee,
        fromDate,
        toDate,
        catalogByBranch: data.catalogByBranch,
        branchNames: data.branchNames,
      })
      : null
  ), [selectedEmployee, data.rankingInvoices, data.catalogByBranch, data.branchNames, fromDate, toDate])

  function toggleSort(nextKey) {
    if (sortKey === nextKey) {
      setSortDir((dir) => (dir === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortKey(nextKey)
    setSortDir('desc')
  }

  const sortMark = (key) => (sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '')
  const showBranch = !data.access.servingBranchId

  if (!admin) {
    return (
      <section className="svc-perf" aria-label="Không có quyền">
        <h2>Không có quyền truy cập</h2>
        <p className="svc-perf__muted">Báo cáo dịch vụ và xếp hạng chỉ dành cho Admin.</p>
      </section>
    )
  }

  return (
    <div className="svc-perf">
      <div className="svc-perf__filters">
        <label>
          Từ ngày
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </label>
        <label>
          Đến ngày
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
        {canSelectBranch() ? (
          <label>
            Chi nhánh
            <select
              value={requestedBranchId}
              onChange={(event) => {
                setRequestedBranchId(event.target.value)
                setSelectedEmployeeId('')
              }}
            >
              <option value="">Tất cả</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name || branch.id}</option>
              ))}
            </select>
          </label>
        ) : (
          <p className="svc-perf__lock">
            Chi nhánh: {branches.find((branch) => branch.id === getCurrentUserBranch())?.name || getCurrentUserBranch() || '—'}
          </p>
        )}
      </div>

      {data.error ? <p className="svc-perf__error">{data.error}</p> : null}
      {data.loading ? <p className="svc-perf__muted">Đang tải hóa đơn trong kỳ đã chọn…</p> : null}

      <section className="svc-perf__section" aria-label="Dịch vụ theo chi nhánh phục vụ">
        <h2>Dịch vụ theo chi nhánh phục vụ</h2>
        <p className="svc-perf__muted">
          Mỗi dòng dịch vụ trên hóa đơn là một lượt. Doanh thu là giá sau khuyến mãi, không gồm tips.
          {data.serviceReport.missingEmployeeInvoiceCount > 0
            ? ` ${data.serviceReport.missingEmployeeInvoiceCount} hóa đơn không có nhân viên chính nên chỉ tính ở bảng này.`
            : ''}
        </p>
        <DiscrepancyNote rows={data.serviceReport.discrepancies} />
        <div className="svc-perf__scroll">
          <table className="svc-perf__table">
            <thead>
              <tr>
                {showBranch ? <th>Chi nhánh phục vụ</th> : null}
                <th>Tên dịch vụ</th>
                <th className="is-num">Số lượt</th>
                <th className="is-num">Tỷ lệ</th>
                <th className="is-num">Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {data.serviceReport.rows.map((row) => (
                <tr key={row.key}>
                  {showBranch ? <td>{row.branchName}</td> : null}
                  <td>{row.name}</td>
                  <td className="is-num">{row.quantity}</td>
                  <td className="is-num">{formatShare(row.share)}</td>
                  <td className="is-num">{formatCurrency(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={showBranch ? 2 : 1}>Tổng</td>
                <td className="is-num">{data.serviceReport.totalQuantity}</td>
                <td className="is-num">{data.serviceReport.totalQuantity ? '100%' : '0%'}</td>
                <td className="is-num">{formatCurrency(data.serviceReport.totalRevenue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="svc-perf__section" aria-label="Xếp hạng nhân viên">
        <h2>Xếp hạng nhân viên</h2>
        <p className="svc-perf__muted">
          Mỗi nhân viên một dòng theo chi nhánh gốc hiện tại. Hóa đơn làm ở chi nhánh khác vẫn tính cho nhân viên chính. Nhân viên hỗ trợ không được cộng lượt hay doanh thu.
        </p>
        <div className="svc-perf__scroll">
          <table className="svc-perf__table svc-perf__rank">
            <thead>
              <tr>
                <th className="is-rank">Hạng</th>
                <th className="is-name">Nhân viên</th>
                <th>Chi nhánh gốc</th>
                <th className="is-num">
                  <button type="button" onClick={() => toggleSort('quantity')}>
                    Tổng số dịch vụ{sortMark('quantity')}
                  </button>
                </th>
                <th className="is-num">
                  <button type="button" onClick={() => toggleSort('revenue')}>
                    Tổng doanh số{sortMark('revenue')}
                  </button>
                </th>
                {data.ranking.columns.map((column) => (
                  <th key={column.key} className="is-num">
                    <button type="button" onClick={() => toggleSort(`svc:${column.key}`)}>
                      {column.label}{sortMark(`svc:${column.key}`)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.ranking.rows.map((row) => (
                <tr key={row.employeeId} className={row.employeeId === selectedEmployeeId ? 'is-selected' : ''}>
                  <td className="is-rank is-num">{row.rank}</td>
                  <td className="is-name">
                    <button type="button" className="svc-perf__name" onClick={() => setSelectedEmployeeId(row.employeeId)}>
                      {row.employeeName}
                    </button>
                  </td>
                  <td>{row.homeBranchName}</td>
                  <td className="is-num">{row.quantity}</td>
                  <td className="is-num">{formatCurrency(row.revenue)}</td>
                  {data.ranking.columns.map((column) => (
                    <td key={column.key} className="is-num">{row.quantities[column.key] ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detail ? (
        <section className="svc-perf__section" aria-label="Chi tiết nhân viên">
          <h2>{detail.employeeName}</h2>
          <p className="svc-perf__muted">
            {detail.quantity} lượt · {formatCurrency(detail.revenue)}
          </p>
          <div className="svc-perf__split">
            <table className="svc-perf__table">
              <thead>
                <tr>
                  <th>Dịch vụ</th>
                  <th className="is-num">Số lượt</th>
                  <th className="is-num">Doanh số</th>
                </tr>
              </thead>
              <tbody>
                {detail.services.map((service) => (
                  <tr key={service.key}>
                    <td>{service.name}</td>
                    <td className="is-num">{service.quantity}</td>
                    <td className="is-num">{formatCurrency(service.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="svc-perf__table">
              <thead>
                <tr>
                  <th>Chi nhánh thực hiện</th>
                  <th className="is-num">Hóa đơn</th>
                  <th className="is-num">Lượt</th>
                  <th className="is-num">Doanh số</th>
                </tr>
              </thead>
              <tbody>
                {detail.servingBranches.map((branch) => (
                  <tr key={branch.branchId}>
                    <td>{branch.branchName}</td>
                    <td className="is-num">{branch.invoiceCount}</td>
                    <td className="is-num">{branch.quantity}</td>
                    <td className="is-num">{formatCurrency(branch.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
