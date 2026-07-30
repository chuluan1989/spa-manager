const CSV_HEADERS = ['Tên', 'Chi nhánh', 'Username', 'Password mặc định', 'Vai trò', 'Trạng thái']

function escapeCsvCell(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function accountExportRowsToCsv(rows) {
  const lines = [
    CSV_HEADERS.join(','),
    ...rows.map((row) => [
      row.name,
      row.branchName ?? row.branchId ?? '',
      row.username,
      row.defaultPassword,
      row.role === 'branch_manager' ? 'Quản lý chi nhánh' : 'Nhân viên',
      row.status ?? 'success',
    ].map(escapeCsvCell).join(',')),
  ]
  return `\uFEFF${lines.join('\n')}`
}

export function downloadAccountExportCsv(rows, filename = 'login-v2-accounts.csv') {
  const csv = accountExportRowsToCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function formatRegenerationReport(result) {
  const { summary, duplicateResolutions = [], failures = [] } = result
  const lines = [
    `QL chi nhánh: ${summary.branchManagers} thành công`,
    `Nhân viên: ${summary.employeesSucceeded} thành công, ${summary.employeesFailed} thất bại`,
    `Username trùng (đã thêm hậu tố): ${summary.duplicateUsernames}`,
  ]
  if (duplicateResolutions.length) {
    lines.push('', 'Username trùng:')
    for (const item of duplicateResolutions) {
      lines.push(`  • ${item.name}: ${item.base} → ${item.assigned}`)
    }
  }
  if (failures.length) {
    lines.push('', 'Thất bại:')
    for (const item of failures) {
      lines.push(`  • ${item.name}: ${item.reason}`)
    }
  }
  return lines.join('\n')
}
