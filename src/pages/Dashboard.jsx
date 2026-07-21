import { useCallback, useState } from 'react'
import DrillDownExplorer from '../components/drilldown/DrillDownExplorer'
import BusinessCopilot from '../components/copilot/BusinessCopilot'
import OperationWorkflowDashStrip from '../components/operationWorkflow/OperationWorkflowDashStrip'
import CrmGrowthDashStrip from '../components/crmGrowth/CrmGrowthDashStrip'
import { useBusinessCopilotData } from '../hooks/useBusinessCopilotData'
import { consumeDrillDownPrefill, setDrillDownPrefill } from '../utils/navigationPrefill'
import { isAdmin, isEmployee } from '../constants/auth'
import '../components/copilot/BusinessCopilot.css'

function resolveEmployeesPage() {
  return isAdmin() ? 'admin-employees' : 'employees'
}

export default function Dashboard({ onNavigate }) {
  const [exploreOpen, setExploreOpen] = useState(false)
  const [explorePrefill, setExplorePrefill] = useState(() => consumeDrillDownPrefill())
  const [exploreKey, setExploreKey] = useState(0)
  const copilot = useBusinessCopilotData()

  const handleAction = useCallback((cta) => {
    if (!cta?.pageId) return
    let pageId = cta.pageId
    if (pageId === 'employees') pageId = resolveEmployeesPage()

    if (pageId === 'dashboard' && cta.drillPrefill) {
      setDrillDownPrefill(cta.drillPrefill)
      setExplorePrefill(cta.drillPrefill)
      setExploreKey((k) => k + 1)
      setExploreOpen(true)
      return
    }

    if (typeof onNavigate === 'function') {
      onNavigate(pageId)
    }
  }, [onNavigate])

  if (isEmployee()) {
    return (
      <DrillDownExplorer
        title="Tổng quan"
        rootLabel="Tổng quan"
        hidePageHeader
        initialPrefill={explorePrefill}
        onNavigate={onNavigate}
      />
    )
  }

  return (
    <div className="erp-page">
      <OperationWorkflowDashStrip onNavigate={onNavigate} />
      <CrmGrowthDashStrip onNavigate={onNavigate} />

      <BusinessCopilot
        loading={copilot.loading}
        error={copilot.error}
        brief={copilot.brief}
        alerts={copilot.alerts}
        opportunities={copilot.opportunities}
        performance={copilot.performance}
        onAction={handleAction}
        onReload={copilot.reload}
      />

      <section className="copilot-explore" aria-label="Explore">
        <button
          type="button"
          className="copilot-explore__toggle"
          aria-expanded={exploreOpen}
          onClick={() => setExploreOpen((open) => !open)}
        >
          {exploreOpen ? 'Thu gọn chi tiết ▴' : 'Xem chi tiết & biểu đồ (Explore) ▾'}
        </button>
        {exploreOpen ? (
          <div className="copilot-explore__body">
            <DrillDownExplorer
              key={exploreKey}
              title="Chi tiết Tổng quan"
              rootLabel="Tổng quan"
              hidePageHeader
              initialPrefill={explorePrefill}
              onNavigate={onNavigate}
            />
          </div>
        ) : null}
      </section>
    </div>
  )
}
