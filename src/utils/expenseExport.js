function escapeCsv(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function downloadCsv(filename, rows) {
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function exportExpensesCsv(expenses, filters = {}) {
  const suffix = [filters.fromDate, filters.toDate].filter(Boolean).join('_') || 'all'
  downloadCsv(
    `chi-phi-${suffix}.csv`,
    [
      [
        'Ngày',
        'Giờ',
        'Chi nhánh',
        'Nhóm chi phí',
        'Nội dung chi',
        'Số tiền',
        'Người chi',
        'Người nhập',
        'Ghi chú',
        'Có ảnh HĐ',
      ],
      ...expenses.map((exp) => [
        exp.date,
        exp.expenseTime || '',
        exp.branchName,
        exp.expenseTypeLabel,
        exp.content,
        exp.amount,
        exp.paidBy || '',
        exp.enteredBy || '',
        exp.note || '',
        exp.receiptImage ? 'Có' : 'Không',
      ]),
    ],
  )
}
