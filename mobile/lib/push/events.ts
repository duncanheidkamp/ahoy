// Bridge from module-scope notification code (which runs before React mounts,
// and in the Android headless task where React never mounts) to the UI.

import type { InAppBanner } from './foreground'
import type { PushRoute } from './responses'

export type PushEvent =
  | { type: 'toast'; message: string }
  | { type: 'banner'; banner: InAppBanner }
  /** An ahoy was sent outside the normal crew-row path (Ahoy back). */
  | { type: 'sent'; receiverId: string }

type Listener<T> = (value: T) => void

const eventListeners = new Set<Listener<PushEvent>>()

export const pushEvents = {
  emit(event: PushEvent) {
    eventListeners.forEach((l) => l(event))
  },
  subscribe(listener: Listener<PushEvent>) {
    eventListeners.add(listener)
    return () => {
      eventListeners.delete(listener)
    }
  },
}

// A route requested by a notification tap. Kept until the signed-in
// navigator is mounted to consume it (cold start, or still on the login screen).
let pendingRoute: PushRoute | null = null
const routeListeners = new Set<Listener<PushRoute>>()

export const pushRoutes = {
  request(route: PushRoute) {
    pendingRoute = route
    routeListeners.forEach((l) => l(route))
  },
  take(): PushRoute | null {
    const r = pendingRoute
    pendingRoute = null
    return r
  },
  subscribe(listener: Listener<PushRoute>) {
    routeListeners.add(listener)
    return () => {
      routeListeners.delete(listener)
    }
  },
}
