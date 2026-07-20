export default function OpsPeriodStrip({ periodMode, onChangePeriod }) {
  return (
    <div className="ops-center__period" role="group" aria-label="Chọn kỳ">
      <button
        type="button"
        className={periodMode === 'today' ? 'is-active' : ''}
        onClick={() => onChangePeriod('today')}
      >
        Hôm nay
      </button>
      <button
        type="button"
        className={periodMode === 'month' ? 'is-active' : ''}
        onClick={() => onChangePeriod('month')}
      >
        Tháng này
      </button>
    </div>
  )
}
