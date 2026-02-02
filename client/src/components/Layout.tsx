import type { ReactNode } from 'react'

export function Layout({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-gray-100 text-gray-900">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-2.5">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-bold">CAIE</h1>
          <span className="text-xs text-gray-400">Context Aware Information Extraction</span>
        </div>
        <span className="text-[10px] text-gray-300">&copy; Hashteelab</span>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-[340px] min-w-[340px] flex-col overflow-hidden border-r border-gray-200 bg-white">
          {left}
        </aside>
        <main className="flex flex-1 flex-col overflow-y-auto p-5">
          {right}
        </main>
      </div>
    </div>
  )
}
