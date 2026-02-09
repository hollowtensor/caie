import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { WorkspaceSelector } from './WorkspaceSelector'

function Header() {
  const { user, logout } = useAuth()

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
      {/* Left: Logo + Workspace */}
      <div className="flex items-center gap-4">
        <Link to="/" className="flex items-center">
          <img src="/lklogo.png" alt="Lauritz Knudsen" className="h-9 object-contain" />
        </Link>
        <div className="h-6 w-px bg-gray-200" />
        <WorkspaceSelector />
      </div>

      {/* Right: Settings + User */}
      <div className="flex items-center gap-2">
        <Link
          to="/settings"
          className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          title="Settings"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>

        {user && (
          <>
            <div className="h-6 w-px bg-gray-200" />
            <div className="flex items-center gap-3 pl-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-700">
                {user.email.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-gray-700">{user.email}</span>
              <button
                onClick={logout}
                className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                title="Logout"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}

// Full-width layout for file management, settings, etc.
export function PageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-gray-50 text-gray-900">
      <Header />
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}

// Split layout with sidebar (legacy)
export function Layout({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-gray-100 text-gray-900">
      <Header />
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
