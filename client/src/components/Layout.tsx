import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function Layout({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-gray-100 text-gray-900">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-2.5">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-bold">CAIE</h1>
          <span className="text-xs text-gray-400">Context Aware Information Extraction</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            className="flex items-center gap-1 rounded border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </Link>
          <span className="text-[10px] text-gray-300">&copy; Hashteelab</span>
        </div>
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
