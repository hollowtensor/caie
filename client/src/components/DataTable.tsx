import { useEffect, useMemo, useState } from 'react'
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
import type { CellFlag } from '../types'

interface Props {
  columns: string[]
  rows: string[][]
  flags?: CellFlag[]
  onRowClick?: (originalIndex: number) => void
  selectedRow?: number | null
}

export function DataTable({ columns, rows, flags = [], onRowClick, selectedRow }: Props) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)

  // Build lookup maps for O(1) flag checking
  const { flagMap, flaggedRows } = useMemo(() => {
    const map = new Map<string, string>() // "row:col" → reason
    const rowSet = new Set<number>()
    for (const f of flags) {
      map.set(`${f.row}:${f.col}`, f.reason)
      rowSet.add(f.row)
    }
    return { flagMap: map, flaggedRows: rowSet }
  }, [flags])

  // Auto-disable flagged filter when no flags remain
  useEffect(() => {
    if (flaggedRows.size === 0 && flaggedOnly) {
      setFlaggedOnly(false)
    }
  }, [flaggedRows, flaggedOnly])

  const columnDefs = useMemo<ColumnDef<string[]>[]>(
    () =>
      columns.map((col, i) => ({
        id: String(i),
        header: col,
        accessorFn: (row: string[]) => row[i] ?? '',
        cell: (info) => info.getValue() as string,
      })),
    [columns],
  )

  // Custom global filter that also supports flagged-only mode
  const globalFilterFn: FilterFn<string[]> = useMemo(
    () => (row, _columnId, filterValue) => {
      const originalIndex = rows.indexOf(row.original)

      // If flagged-only mode is on, exclude non-flagged rows
      if (flaggedOnly && !flaggedRows.has(originalIndex)) {
        return false
      }

      // Text search
      if (filterValue) {
        const search = (filterValue as string).toLowerCase()
        return row.original.some((cell) => cell.toLowerCase().includes(search))
      }

      return true
    },
    [rows, flaggedOnly, flaggedRows],
  )

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { sorting, globalFilter: flaggedOnly ? (globalFilter || ' ') : globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
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
            placeholder="Search across all columns..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-xs text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none"
          />
        </div>

        {/* Flagged-only toggle */}
        {flags.length > 0 && (
          <button
            onClick={() => { setFlaggedOnly(!flaggedOnly); table.setPageIndex(0) }}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-[11px] font-medium transition-colors ${
              flaggedOnly
                ? 'border-red-300 bg-red-50 text-red-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            {flaggedOnly ? `Showing ${flaggedRows.size} flagged` : `${flaggedRows.size} flagged`}
          </button>
        )}

        <span className="text-[11px] text-gray-400 whitespace-nowrap">
          {filteredCount === rows.length
            ? `${rows.length} rows`
            : `${filteredCount} of ${rows.length} rows`}
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
                        {{ asc: ' \u2191', desc: ' \u2193' }[header.column.getIsSorted() as string] ?? ''}
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
              const isRowFlagged = flaggedRows.has(originalIndex)
              const isSelected = selectedRow === originalIndex

              return (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(originalIndex)}
                  className={`border-b border-gray-50 transition-colors ${
                    onRowClick ? 'cursor-pointer' : ''
                  } ${
                    isSelected
                      ? 'bg-blue-100 hover:bg-blue-100'
                      : isRowFlagged
                        ? 'bg-red-50/60 hover:bg-red-50'
                        : ri % 2 === 0
                          ? 'bg-white hover:bg-blue-50/40'
                          : 'bg-gray-50/30 hover:bg-blue-50/40'
                  }`}
                >
                  <td className="px-3 py-1.5 text-center text-[10px] text-gray-300 tabular-nums">
                    {pageIndex * table.getState().pagination.pageSize + ri + 1}
                  </td>
                  {row.getVisibleCells().map((cell) => {
                    const colIdx = Number(cell.column.id)
                    const flagReason = flagMap.get(`${originalIndex}:${colIdx}`)

                    return (
                      <td
                        key={cell.id}
                        className={`whitespace-nowrap px-3 py-1.5 ${
                          flagReason
                            ? 'text-red-700 font-medium'
                            : 'text-gray-700'
                        }`}
                        title={flagReason || undefined}
                      >
                        <span className="inline-flex items-center gap-1">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          {flagReason && (
                            <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-[9px] text-red-500" title={flagReason}>
                              !
                            </span>
                          )}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-xs text-gray-400">
                  No matching rows
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
