import { canExportReport } from '../../constants/auth'
import './ExportActions.css'

export default function ExportActions({ onExportExcel, onExportPdf, disabled = false, className = '' }) {
  if (!canExportReport()) return null

  return (
    <div className={`export-actions ${className}`.trim()}>
      {onExportExcel && (
        <button
          type="button"
          className="export-actions__btn export-actions__btn--excel"
          onClick={onExportExcel}
          disabled={disabled}
        >
          Xuất Excel
        </button>
      )}
      {onExportPdf && (
        <button
          type="button"
          className="export-actions__btn export-actions__btn--pdf"
          onClick={onExportPdf}
          disabled={disabled}
        >
          Xuất PDF
        </button>
      )}
    </div>
  )
}
