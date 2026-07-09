export default function BranchEmptyState({ message = 'Chi nhánh này chưa có dữ liệu.' }) {
  return (
    <div className="admin-branches__empty">
      <p>{message}</p>
    </div>
  )
}
