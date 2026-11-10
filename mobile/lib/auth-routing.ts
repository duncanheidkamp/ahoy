// Which top-level group the signed-in state allows (app/_layout.tsx guards).
// A social-login account has no username until it claims one, so it is
// routed to the one-time "Pick your pirate name" screen whenever
// get_my_profile() says username is null.

export type AuthRoute = 'loading' | 'auth' | 'pick-username' | 'app'

export interface AuthRouteInput {
  authLoading: boolean
  hasSession: boolean
  profile: {
    /** Query has data (null = no profile row). */
    data: { username: string | null } | null | undefined
    isPending: boolean
    isError: boolean
  }
}

export function authRoute({ authLoading, hasSession, profile }: AuthRouteInput): AuthRoute {
  if (authLoading) return 'loading'
  if (!hasSession) return 'auth'
  if (profile.data === undefined) {
    // Offline / failing: let the app show its own error states rather than
    // trapping the user on the splash screen. It re-routes once it loads.
    if (profile.isError) return 'app'
    return 'loading'
  }
  if (profile.data && profile.data.username === null) return 'pick-username'
  return 'app'
}
