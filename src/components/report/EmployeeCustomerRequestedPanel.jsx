import { useEffect, useMemo, useState } from 'react'
import BranchBanner from '../common/BranchBanner'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import {
  getCurrentUserBranchName,
  getRecordFetchBranchFilter,
  getScopedEmployeeId,
} from '../../constants/auth'
import { getBranchName } from '../../utils/branchStorage'
import { formatCurrency } from '../../utils/invoice'
import { fetchMergedInvoices } from '../../utils/invoiceDataFetcher'
import { computeEmployeeCustomerRequestedStats } from '../../utils/employeeInvoiceReport'
import {
  formatDisplayDate,
  getCurrentMonthValue,
  getPayPeriodRange,
  PAY_CYCLES,
} from '../../utils/salaryReport'

function formatRate(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value}%`
}

export default function EmployeeCustomerRequestedPanel() {
  const employeeId = getScopedEmployeeId()
  const fetchBranchId = getRecordFetchBranchFilter('')

  const [month, setMonth] = useState(getCurrentMonthValue())
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const syncVersion = useDataSyncVersion()

  const { fromDate, toDate } = useMemo(
    () => getPayPeriodRange(month, PAY_CYCLES.FULL),
    [month],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const result = await fetchMergedInvoices({
        fromDate,
        toDate,
        branchId: fetchBranchId,
        employeeId: employeeId || '',
      })
      if (!cancelled) {
        setInvoices(result.invoices)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [fromDate, toDate, fetchBranchId, employeeId, syncVersion])

  const stats = useMemo(
    () => computeEmployeeCustomerRequestedStats(invoices, employeeId, {
      fromDate,
      toDate,
      branchId: fetchBranchId,
      employeeId,
      cycle: PAY_CYCLES.FULL,
    }),
    [invoices, employeeId, fromDate, toDate, fetchBranchId],
  )

  return (
    <div className="salary-report customer-requested-report">
      <section className="report__filters">
        <div className="report__field report__field--banner">
          <BranchBanner branchName={getCurrentUserBranchName()} />
        </div>
        <label className="report__field">
          <span>Tháng</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </section>

      <p className="salary-report__period">
        Kỳ thống kê: {formatDisplayDate(fromDate)} đến {formatDisplayDate(toDate)}
      </p>

      <p className="report-table-card__note">
        Chỉ tính tour chính có đánh dấu &quot;Khách yêu cầu&quot; trên hóa đơn.
        Hóa đơn cũ không lưu field này sẽ không được tính.
      </p>

      {loading && <p className="report-table-card__empty">Đang tải dữ liệu…</p>}

      {!loading && (
        <>
          <section className="salary-report__summary-card">
            <h3 className="salary-report__employee-name">Khách yêu cầu</h3>
            <div className="salary-report__summary-grid">
              <div><span>Tổng lượt khách yêu cầu</span><strong>{stats.requestedCount}</strong></div>
              <div><span>Tổng số tour</span><strong>{stats.totalTours}</strong></div>
              <div><span>Tỷ lệ khách yêu cầu</span><strong>{formatRate(stats.requestedRate)}</strong></div>
            </div>
          </section>

          {stats.monthly.length > 0 && (
            <section className="report-table-card">
              <h4 className="report-table-card__title">Theo tháng</h4>
              <div className="report-table-card__wrap">
                <table className="report-table-card__table">
                  <thead>
                    <tr>
                      <th>Tháng</th>
                      <th>Lượt YC</th>
                      <th>Tổng tour</th>
                      <th>Tỷ lệ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.monthly.map((row) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td className="report-table-card__num">{row.requestedCount}</td>
                        <td className="report-table-card__num">{row.totalTours}</td>
                        <td className="report-table-card__num">
                          {formatRate(row.totalTours > 0 ? Math.round((row.requestedCount / row.totalTours) * 1000) / 10 : null)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {stats.daily.length > 0 && (
            <section className="report-table-card">
              <h4 className="report-table-card__title">Theo ngày</h4>
              <div className="report-table-card__wrap">
                <table className="report-table-card__table">
                  <thead>
                    <tr>
                      <th>Ngày</th>
                      <th>Lượt YC</th>
                      <th>Tổng tour</th>
                      <th>Tỷ lệ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.daily.map((row) => (
                      <tr key={row.date}>
                        <td>{row.displayDate}</td>
                        <td className="report-table-card__num">{row.requestedCount}</td>
                        <td className="report-table-card__num">{row.totalTours}</td>
                        <td className="report-table-card__num">
                          {formatRate(row.totalTours > 0 ? Math.round((row.requestedCount / row.totalTours) * 1000) / 10 : null)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="report-table-card">
            <h4 className="report-table-card__title">Hóa đơn khách yêu cầu ({stats.invoices.length})</h4>
            {stats.invoices.length === 0 ? (
              <p className="report-table-card__empty">Không có hóa đơn khách yêu cầu trong kỳ.</p>
            ) : (
              <div className="report-table-card__wrap">
                <table className="report-table-card__table">
                  <thead>
                    <tr>
                      <th>Ngày</th>
                      <th>Chi nhánh</th>
                      <th>Khách</th>
                      <th>Dịch vụ</th>
                      <th>Doanh thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.invoices.map((item) => (
                      <tr key={item.invoiceId}>
                        <td>{item.displayDate}{item.invoiceTime ? ` ${item.invoiceTime}` : ''}</td>
                        <td>{item.branchName || getBranchName(item.branchId) || '—'}</td>
                        <td>{item.customerName}</td>
                        <td>{item.serviceNames}</td>
                        <td className="report-table-card__money">{formatCurrency(item.payment)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
