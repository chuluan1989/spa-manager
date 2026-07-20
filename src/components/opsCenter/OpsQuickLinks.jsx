const LINKS = [
  { id: 'invoices', label: 'Hóa đơn' },
  { id: 'attendance', label: 'Chấm công' },
  { id: 'salary', label: 'Lương' },
  { id: 'expenses', label: 'Chi phí' },
  { id: 'admin-services', label: 'Dịch vụ' },
  { id: 'dashboard', label: 'Tổng quan' },
]

export default function OpsQuickLinks({ onNavigate }) {
  return (
    <section className="ops-center__section" aria-label="Lối tắt điều hành">
      <header className="ops-center__section-head">
        <h2>Lối tắt điều hành</h2>
        <p>Mở nhanh các màn đang vận hành</p>
      </header>
      <div className="ops-center__quick-links">
        {LINKS.map((link) => (
          <button
            key={link.id}
            type="button"
            className="ops-center__quick-link"
            onClick={() => onNavigate?.(link.id)}
          >
            {link.label}
          </button>
        ))}
      </div>
    </section>
  )
}
