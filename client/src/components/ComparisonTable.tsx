import { useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
  type FilterFn,
} from '@tanstack/react-table'

type StatusFilter = 'all' | 'NEW' | 'REMOVED' | 'UP' | 'DOWN' | 'UNAVAIL' | 'AVAIL' | 'SAME'

interface Props {
  columns: string[]
  rows: string[][]
  filter: StatusFilter
  onRowClick?: (rowIndex: number) => void
  selectedRow?: number | null
}

const STATUS_STYLES: Record<string, { bg: string; text: string; badge: string }> = {
  NEW: { bg: 'bg-green-50', text: 'text-green-700', badge: 'bg-green-100 text-green-700' },
  REMOVED: { bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-100 text-red-700' },
  UP: { bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  DOWN: { bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' },
  UNAVAIL: { bg: 'bg-orange-50', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
  AVAIL: { bg: 'bg-teal-50', text: 'text-teal-700', badge: 'bg-teal-100 text-teal-700' },
  SAME: { bg: 'bg-gray-50/30', text: 'text-gray-600', badge: 'bg-gray-100 text-gray-500' },
}

export function ComparisonTable({ columns, rows, filter, onRowClick, selectedRow }: Props) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  // Hide page columns (they're metadata for preview, not for display)
  const hiddenColumns = ['Base Page', 'Target Page']

  const columnDefs = useMemo<ColumnDef<string[]>[]>(
    () =>
      columns
        .map((col, i) => ({
          id: String(i),
          header: col,
          accessorFn: (row: string[]) => row[i] ?? '',
          cell: (info) => {
            const value = info.getValue() as string
            // Special rendering for Status column
            if (i === 0) {
              const style = STATUS_STYLES[value] || STATUS_STYLES.SAME
              return (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}>
                  {value}
                </span>
              )
            }
            // Change column styling
            if (col === 'Change' || col === '% Change') {
              const isNegative = value.startsWith('-')
              const isPositive = value.startsWith('+') && !value.includes('0.0')
              return (
                <span className={isNegative ? 'text-blue-600 font-medium' : isPositive ? 'text-amber-600 font-medium' : ''}>
                  {value}
                </span>
              )
            }
            return value
          },
          // Hide page columns
          meta: { hidden: hiddenColumns.includes(col) },
        }))
        .filter((col) => !hiddenColumns.includes(columns[parseInt(col.id)])),
    [columns],
  )

  // Filter function that combines search and status filter
  const globalFilterFn: FilterFn<string[]> = (row, _columnId, filterValue) => {
    const [statusFilter, searchText] = (filterValue as string).split('|||')
    const status = row.original[0] // First column is Status

    // Apply status filter
    if (statusFilter !== 'all' && status !== statusFilter) {
      return false
    }

    // Apply text search
    if (searchText) {
      const search = searchText.toLowerCase()
      return row.original.some((cell) => cell.toLowerCase().includes(search))
    }

    return true
  }

  // Combine filter and search into single filter value to trigger re-filtering
  const combinedFilter = `${filter}|||${globalFilter}`

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { sorting, globalFilter: combinedFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: (value) => {
      // Extract just the search part when table tries to update
      const searchPart = (value as string).split('|||')[1] || ''
      setGlobalFilter(searchPart)
    },
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageCount = table.getPageCount()
  const filteredCount = table.getFilteredRowModel().rows.length

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search by reference or description..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-xs text-gray-700 placeholder-gray-400 focus:border-purple-400 focus:outline-none"
          />
        </div>

        <span className="text-[11px] text-gray-400 whitespace-nowrap">
          {filteredCount === rows.length
            ? `${rows.length} items`
            : `${filteredCount} of ${rows.length} items`}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm" style={{ maxHeight: '62vh' }}>
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-gray-50">
                <th className="border-b border-gray-200 px-3 py-2.5 text-center font-semibold text-gray-400 w-[44px]">
                  #
                </th>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="cursor-pointer select-none whitespace-nowrap border-b border-gray-200 px-3 py-2.5 text-left font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span className="text-gray-300">
                        {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, ri) => {
              const originalIndex = rows.indexOf(row.original)
              const status = row.original[0]
              const style = STATUS_STYLES[status] || STATUS_STYLES.SAME
              const isSelected = selectedRow === originalIndex

              return (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(originalIndex)}
                  className={`border-b border-gray-50 transition-colors ${
                    onRowClick ? 'cursor-pointer' : ''
                  } ${
                    isSelected
                      ? 'bg-purple-100 hover:bg-purple-100'
                      : `${style.bg} hover:brightness-95`
                  }`}
                >
                  <td className="px-3 py-1.5 text-center text-[10px] text-gray-300 tabular-nums">
                    {pageIndex * table.getState().pagination.pageSize + ri + 1}
                  </td>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`whitespace-nowrap px-3 py-1.5 ${isSelected ? 'text-purple-800' : style.text}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-xs text-gray-400">
                  No matching items
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-30"
            >
              First
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-30"
            >
              Prev
            </button>
            <span className="px-2 text-[11px] text-gray-500">
              Page <strong className="text-gray-700">{pageIndex + 1}</strong> of{' '}
              <strong className="text-gray-700">{pageCount}</strong>
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-30"
            >
              Next
            </button>
            <button
              onClick={() => table.setPageIndex(pageCount - 1)}
              disabled={!table.getCanNextPage()}
              className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-30"
            >
              Last
            </button>
          </div>
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 focus:outline-none"
          >
            {[25, 50, 100, 200].map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
