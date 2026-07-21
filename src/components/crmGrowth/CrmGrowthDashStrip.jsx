import { useCrmGrowthData } from '../../hooks/useCrmGrowthData'
import {
  CrmCareTodayPanel,
  CrmCeoGrowthPanel,
  CrmGrowthMetricsStrip,
} from './CrmGrowthPanels'
import './CrmGrowth.css'

/**
 * Dashboard strip — Customer Growth (Admin/Manager), sibling to Operation Workflow / Copilot.
 */
export default function CrmGrowthDashStrip({ onNavigate }) {
  const data = useCrmGrowthData()

  return (
    <div className="crmg-dash-strip">
      <section className="crmg-panel">
        <div className="crmg-panel__head">
          <div>
            <h3>CRM · Tăng trưởng khách hàng</h3>
            <p className="crmg-muted">Rule-based · không dùng AI</p>
          </div>
          <button
            type="button"
            className="crmg-btn crmg-btn--primary"
            onClick={() => onNavigate?.('customers')}
          >
            Mở Khách hàng
          </button>
        </div>
        <CrmGrowthMetricsStrip metrics={data.metrics} />
      </section>
      <CrmCareTodayPanel
        items={data.careToday}
        onOpenCustomers={() => onNavigate?.('customers')}
      />
      <CrmCeoGrowthPanel
        insights={data.ceoInsights}
        onOpenCustomers={() => onNavigate?.('customers')}
      />
    </div>
  )
}
