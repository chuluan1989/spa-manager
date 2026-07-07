import DrillDownExplorer from '../components/drilldown/DrillDownExplorer'
import { consumeDrillDownPrefill } from '../utils/navigationPrefill'

export default function Dashboard({ onNavigate }) {
  const prefill = consumeDrillDownPrefill()

  return (
    <DrillDownExplorer
      title="Tổng quan"
      rootLabel="Tổng quan"
      hidePageHeader
      initialPrefill={prefill}
      onNavigate={onNavigate}
    />
  )
}
