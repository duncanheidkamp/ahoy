import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState } from 'react'

import { createTapGuard } from './debounce'
import { recordSentInCache, SendAhoyError, sendAhoy } from './queries'
import { IDLE, transition, type SendEvent, type SendState } from './send-machine'

/** Taps closer together than this are one tap, even across a state reset. */
export const TAP_GUARD_MS = 400

interface Deps {
  receiverId: string
  phrase: string
  onToast: (message: string) => void
  qc: QueryClient
}

/**
 * Drives one crew row: the pure state machine (send-machine.ts) wired to the
 * network, haptics and toasts. The machine state lives outside React so a
 * second tap in the same frame sees `sending` synchronously.
 */
class AhoySender {
  state: SendState = IDLE
  private guard = createTapGuard(TAP_GUARD_MS)
  private resetTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(
    private deps: () => Deps,
    private onState: (s: SendState) => void
  ) {}

  tap() {
    if (!this.guard.tryAcquire()) return
    this.dispatch({ type: 'tap', phrase: this.deps().phrase })
  }

  dispose() {
    this.disposed = true
    if (this.resetTimer) clearTimeout(this.resetTimer)
  }

  private dispatch(event: SendEvent) {
    if (this.disposed) return
    const { state, effects } = transition(this.state, event)
    this.state = state
    this.onState(state)
    const { receiverId, onToast, qc } = this.deps()
    for (const effect of effects) {
      switch (effect.type) {
        case 'hapticTap':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
          break
        case 'hapticError':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
          break
        case 'toast':
          onToast(effect.message)
          break
        case 'scheduleReset':
          if (this.resetTimer) clearTimeout(this.resetTimer)
          this.resetTimer = setTimeout(() => this.dispatch({ type: 'reset' }), effect.ms)
          break
        case 'send':
          sendAhoy(receiverId)
            .then(({ phrase }) => {
              recordSentInCache(qc, receiverId)
              this.dispatch({ type: 'succeeded', phrase })
            })
            .catch((e: unknown) => {
              this.dispatch({ type: 'failed', failure: e instanceof SendAhoyError ? e.failure : 'unknown' })
            })
          break
      }
    }
  }
}

export function useAhoySender(receiverId: string, phrase: string, onToast: (message: string) => void) {
  const qc = useQueryClient()
  const [state, setState] = useState<SendState>(IDLE)
  const depsRef = useRef<Deps>({ receiverId, phrase, onToast, qc })
  const senderRef = useRef<AhoySender | null>(null)

  useEffect(() => {
    depsRef.current = { receiverId, phrase, onToast, qc }
  })

  useEffect(() => {
    const sender = new AhoySender(() => depsRef.current, setState)
    senderRef.current = sender
    return () => {
      sender.dispose()
      senderRef.current = null
    }
  }, [])

  const tap = () => senderRef.current?.tap()
  return { state, tap }
}
