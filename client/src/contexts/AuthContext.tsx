import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import type { User, WorkspaceInfo } from '../types'
import {
  loginApi,
  registerApi,
  logoutApi,
  fetchMe,
  getAccessToken,
  setTokens,
  clearTokens,
  getCurrentWorkspaceId,
  setCurrentWorkspaceId,
  clearWorkspaceId,
} from '../api'

interface AuthContextType {
  user: User | null
  workspaces: WorkspaceInfo[]
  currentWorkspace: WorkspaceInfo | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
  setCurrentWorkspace: (workspace: WorkspaceInfo) => void
  refreshWorkspaces: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [currentWorkspace, setCurrentWorkspaceState] = useState<WorkspaceInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = getAccessToken()
      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const data = await fetchMe()
        setUser(data.user)
        setWorkspaces(data.workspaces)

        // Restore or set current workspace
        const savedWsId = getCurrentWorkspaceId()
        const savedWs = data.workspaces.find((w) => w.id === savedWsId)
        if (savedWs) {
          setCurrentWorkspaceState(savedWs)
        } else if (data.workspaces.length > 0) {
          setCurrentWorkspaceState(data.workspaces[0])
          setCurrentWorkspaceId(data.workspaces[0].id)
        }
      } catch {
        // Token invalid, clear it
        clearTokens()
        clearWorkspaceId()
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginApi(email, password)
    setTokens(data.access_token, data.refresh_token)
    setUser(data.user)
    setWorkspaces(data.workspaces || [])

    // Set first workspace as current
    if (data.workspaces && data.workspaces.length > 0) {
      setCurrentWorkspaceState(data.workspaces[0])
      setCurrentWorkspaceId(data.workspaces[0].id)
    } else if (data.workspace) {
      setCurrentWorkspaceState(data.workspace)
      setCurrentWorkspaceId(data.workspace.id)
    }
  }, [])

  const register = useCallback(async (email: string, password: string, name: string) => {
    const data = await registerApi(email, password, name)
    setTokens(data.access_token, data.refresh_token)
    setUser(data.user)

    // New user gets a personal workspace
    if (data.workspace) {
      setWorkspaces([data.workspace])
      setCurrentWorkspaceState(data.workspace)
      setCurrentWorkspaceId(data.workspace.id)
    }
  }, [])

  const logout = useCallback(async () => {
    await logoutApi()
    setUser(null)
    setWorkspaces([])
    setCurrentWorkspaceState(null)
  }, [])

  const setCurrentWorkspace = useCallback((workspace: WorkspaceInfo) => {
    setCurrentWorkspaceState(workspace)
    setCurrentWorkspaceId(workspace.id)
  }, [])

  const refreshWorkspaces = useCallback(async () => {
    try {
      const data = await fetchMe()
      setWorkspaces(data.workspaces)
    } catch {
      // Ignore
    }
  }, [])

  const value: AuthContextType = {
    user,
    workspaces,
    currentWorkspace,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    setCurrentWorkspace,
    refreshWorkspaces,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
