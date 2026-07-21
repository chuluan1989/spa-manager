import { useOperationWorkflowData } from '../../hooks/useOperationWorkflowData'
import {
  CeoActionPanel,
  OperationAlertsStrip,
} from './OperationWorkflowPanels'
import './OperationWorkflow.css'

/**
 * Compact strip on Dashboard (Admin/Manager) — sibling to Business Copilot.
 */
export default function OperationWorkflowDashStrip({ onNavigate }) {
  const data = useOperationWorkflowData({})

  return (
    <div className="ow-dash-strip">
      <CeoActionPanel
        items={data.ceoActions}
        onOpenWorkflow={() => onNavigate?.('operation-workflow')}
      />
      <OperationAlertsStrip alerts={data.alerts} />
    </div>
  )
}
