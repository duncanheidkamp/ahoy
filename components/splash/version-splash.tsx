'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const CURRENT_VERSION = 'v0.4.0'
const SPLASH_KEY = `ahoy_splash_seen_${CURRENT_VERSION}`

const CHANGELOG = [
  {
    version: 'v0.4.0',
    label: 'Latest',
    color: 'text-amber-400 border-amber-400',
    labelColor: 'bg-amber-400 text-gray-900',
    items: [
      '⚓  Anchor counter in the header shows your total ahoys sent at a glance',
      '🔢  Per-friend counter on each crew card tracks how many times you\'ve sent to them',
      '☠️  Secret phrase unlock — send 500 ahoys to unlock "Arrrggggg Matey!" in Settings',
    ],
  },
  {
    version: 'v0.3.0',
    label: 'Previous',
    color: 'text-sky-400 border-sky-400',
    labelColor: 'bg-sky-400 text-gray-900',
    items: [
      '⚡  Instant crew add — tapping Add now adds someone immediately, no request needed',
      '🏅  Nautical achievement badges — earn Sailor, First Mate, Captain, and Admiral ranks',
      '📊  Ahoy count ticker on your Settings page',
    ],
  },
]

export function VersionSplash() {
  const [visible, setVisible] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sent, setSent] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem(SPLASH_KEY)) {
      // Small delay so the dashboard loads first
      const t = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(t)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(SPLASH_KEY, 'true')
    setVisible(false)
  }

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      dismiss()
      return
    }

    setIsSending(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          version: CURRENT_VERSION,
          message: feedback.trim(),
        }),
      })
      setSent(true)
      setTimeout(dismiss, 1500)
    } catch {
      dismiss()
    } finally {
      setIsSending(false)
    }
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div
        className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Hero */}
        <div className="bg-gradient-to-br from-sky-900 via-sky-800 to-ocean-900 px-6 pt-8 pb-6 text-center border-b border-gray-700"
             style={{ background: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 50%, #0c4a6e 100%)' }}>
          <div className="text-5xl mb-3">⚓</div>
          <h1
            className="text-white text-2xl font-bold mb-1"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Welcome to Ahoy!
          </h1>
          <span className="inline-block bg-amber-400 text-gray-900 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
            {CURRENT_VERSION} — What&apos;s New
          </span>
        </div>

        <div className="p-5 space-y-5">
          {/* Changelog */}
          {CHANGELOG.map((release) => (
            <div key={release.version} className={`border-l-2 pl-4 ${release.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-gray-300"
                      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                  {release.version}
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${release.labelColor}`}
                      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                  {release.label}
                </span>
              </div>
              <ul className="space-y-1.5">
                {release.items.map((item, i) => (
                  <li
                    key={i}
                    className="text-gray-300 text-sm"
                    style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Feedback */}
          <div className="border-t border-gray-700 pt-4">
            <label
              className="block text-gray-400 text-xs font-bold uppercase tracking-wide mb-2"
              style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              Send the crew a message (optional)
            </label>
            {sent ? (
              <div className="text-center py-3 text-green-400 font-bold text-sm"
                   style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                ✓ Message in a bottle sent! Thanks, sailor.
              </div>
            ) : (
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Bugs, ideas, complaints about the poop deck..."
                rows={3}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-sky-500 resize-none"
                style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
              />
            )}
          </div>

          {/* Actions */}
          {!sent && (
            <div className="flex gap-3">
              <button
                onClick={dismiss}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold uppercase text-sm rounded-lg transition-colors"
                style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
              >
                Set Sail!
              </button>
              {feedback.trim() && (
                <button
                  onClick={handleSubmit}
                  disabled={isSending}
                  className="flex-1 py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold uppercase text-sm rounded-lg transition-colors disabled:opacity-50"
                  style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                >
                  {isSending ? 'Sending...' : 'Send & Set Sail!'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
