export function escapeCsv(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function downloadCsv(filename, rows) {
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

/** Mở cửa sổ in — dùng làm xuất PDF. */
export function openPrintDocument(title, html) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;font-size:13px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f3f4f6}</style>
</head><body>${html}</body></html>`)
  win.document.close()
  win.focus()
  win.print()
}
