import BranchServicePricingTab from '../services/BranchServicePricingTab'

export default function BranchPricingTab({ branchId, showToast, readOnly = false }) {
  return (
    <BranchServicePricingTab
      showToast={showToast}
      readOnly={readOnly}
      fixedBranchId={branchId}
    />
  )
}
