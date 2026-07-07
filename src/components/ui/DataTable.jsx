import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from 'lucide-react'
import './DataTable.css'

function defaultSort(a, b, key) {
  const av = a[key]
  const bv = b[key]
  if (typeof av === 'number' && typeof bv === 'number') return av - bv
  return String(av ?? '').localeCompare(String(bv ?? ''), 'vi')
}

export default function DataTable({
  columns,
  rows,
  onRowClick,
  emptyText = 'Không có dữ liệu',
  pageSize = 10,
  searchable = true,
  searchPlaceholder = 'Tìm kiếm...',
  getRowKey = (row) => row.id ?? row.key,
}) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(0)
  const [colWidths, setColWidths] = useState({})

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      columns.some((col) => {
        const val = col.accessor ? col.accessor(row) : row[col.key]
        return String(val ?? '').toLowerCase().includes(q)
      }),
    )
  }, [rows, search, columns])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = columns.find((c) => c.key === sortKey)?.accessor?.(a) ?? a[sortKey]
      const bv = columns.find((c) => c.key === sortKey)?.accessor?.(b) ?? b[sortKey]
      const cmp = defaultSort({ [sortKey]: av }, { [sortKey]: bv }, sortKey)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [filtered, sortKey, sortDir, columns])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const startResize = (key, e) => {
    e.preventDefault()
    const startX = e.clientX
    const th = e.target.closest('th')
    const startWidth = th.offsetWidth

    const onMove = (ev) => {
      const next = Math.max(80, startWidth + ev.clientX - startX)
      setColWidths((prev) => ({ ...prev, [key]: next }))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (!rows.length && !search) {
    return <p className="data-table__empty">{emptyText}</p>
  }

  return (
    <div className="data-table">
      {searchable && (
        <div className="data-table__toolbar">
          <label className="data-table__search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            />
          </label>
          <span className="data-table__count">{sorted.length} dòng</span>
        </div>
      )}

      <div className="data-table__wrap">
        <table className="data-table__table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={colWidths[col.key] ? { width: colWidths[col.key], minWidth: colWidths[col.key] } : undefined}
                  className={col.sortable !== false ? 'data-table__th--sortable' : ''}
                >
                  <div className="data-table__th-inner">
                    <button
                      type="button"
                      className="data-table__sort-btn"
                      onClick={() => col.sortable !== false && toggleSort(col.key)}
                      disabled={col.sortable === false}
                    >
                      {col.label}
                      {col.sortable !== false && (
                        sortKey === col.key
                          ? (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)
                          : <ChevronsUpDown size={14} className="data-table__sort-idle" />
                      )}
                    </button>
                    {col.resizable !== false && (
                      <span
                        className="data-table__resize"
                        onMouseDown={(e) => startResize(col.key, e)}
                        role="separator"
                        aria-orientation="vertical"
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="data-table__empty-cell">{emptyText}</td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr
                  key={getRowKey(row)}
                  className={onRowClick ? 'data-table__row--clickable' : ''}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => {
                    const raw = col.accessor ? col.accessor(row) : row[col.key]
                    const content = col.render ? col.render(raw, row) : raw
                    return (
                      <td
                        key={col.key}
                        className={[
                          col.align === 'right' || col.money ? 'data-table__td--right' : '',
                          col.money ? 'data-table__td--money' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {col.key === columns[0].key && onRowClick ? (
                          <button type="button" className="data-table__link" onClick={(e) => { e.stopPropagation(); onRowClick(row) }}>
                            {content}
                          </button>
                        ) : content}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="data-table__pagination">
          <button type="button" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>Trước</button>
          <span>Trang {safePage + 1} / {totalPages}</span>
          <button type="button" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Sau</button>
        </div>
      )}
    </div>
  )
}
