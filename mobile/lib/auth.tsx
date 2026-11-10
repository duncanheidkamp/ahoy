import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { supabase } from './supabase'

interface AuthState {
  session: Session | null
  /** True until the stored session has been read from SecureStore. */
  loading: boolean
}

const AuthContext = createContext<AuthState>({ session: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>({ session: null, loading: true })

  useEffect(() => {
    let mounted = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setState({ session: data.session, loading: false })
      })
      .catch(() => {
        if (mounted) setState({ session: null, loading: false })
      })

    let lastUserId: string | null | undefined
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setState({ session, loading: false })
      // Never show one account's cached crew to another. Only clear when the
      // user actually changes, so token refreshes keep the cached counts.
      const userId = session?.user.id ?? null
      if (lastUserId !== undefined && userId !== lastUserId) queryClient.clear()
      lastUserId = userId
    })
    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [queryClient])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}

/** The signed-in user's id. Only call inside the signed-in route group. */
export function useUserId(): string {
  const { session } = useAuth()
  if (!session) throw new Error('useUserId called while signed out')
  return session.user.id
}
