import './BranchBanner.css'

export default function BranchBanner({ branchName }) {
  if (!branchName) return null

  return (
    <div className="branch-banner">
      <span className="branch-banner__label">Chi nhánh đang dùng:</span>
      <span className="branch-banner__value">{branchName}</span>
    </div>
  )
}
