import './InvoiceFilters.css'

export default function InvoiceFilters({
  filters,
  onChange,
  onReset,
  resultCount = 0,
  serviceOptions = [],
}) {
  return (
    <section className="invoice-filters">
      <div className="invoice-filters__header">
        <h3 className="invoice-filters__title">Bộ lọc</h3>
        <span className="invoice-filters__count">{resultCount} hóa đơn</span>
      </div>

      <div className="invoice-filters__row">
        <label className="invoice-filters__field">
          <span>Dịch vụ</span>
          <select
            value={filters.serviceId}
            onChange={(e) => onChange({ ...filters, serviceId: e.target.value })}
          >
            <option value="">Tất cả dịch vụ</option>
            {serviceOptions.map((service) => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
        </label>

        {filters.serviceId && (
          <button type="button" className="invoice-filters__reset" onClick={onReset}>
            Xóa bộ lọc
          </button>
        )}
      </div>
    </section>
  )
}
