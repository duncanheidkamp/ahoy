'use client'

import { useState, useEffect } from 'react'

const INSTALL_KEY = 'ahoy_pwa_install_shown'
const VERSION_SPLASH_KEY = 'ahoy_splash_seen_v0.4.0'

type Platform = 'ios' | 'android' | 'desktop' | 'unknown'

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  )
}

const STEPS: Record<Exclude<Platform, 'unknown'>, { icon: string; text: string }[]> = {
  ios: [
    {
      icon: '⬆️',
      text: 'Tap the Share button at the bottom of Safari (the box with an arrow pointing up)',
    },
    {
      icon: '📲',
      text: 'Scroll down and tap "Add to Home Screen"',
    },
    {
      icon: '✅',
      text: 'Tap "Add" in the top-right corner — done!',
    },
  ],
  android: [
    {
      icon: '⋮',
      text: 'Tap the three-dot menu in the top-right corner of Chrome',
    },
    {
      icon: '📲',
      text: 'Tap "Add to Home screen" or "Install app"',
    },
    {
      icon: '✅',
      text: 'Tap "Add" to confirm — done!',
    },
  ],
  desktop: [
    {
      icon: '⊕',
      text: 'Click the install icon (⊕) in the right side of your browser\'s address bar',
    },
    {
      icon: '✅',
      text: 'Click "Install" in the prompt — done!',
    },
  ],
}

const PLATFORM_LABELS: Record<Exclude<Platform, 'unknown'>, string> = {
  ios: 'iPhone & iPad',
  android: 'Android',
  desktop: 'Desktop',
}

export function PwaInstallPrompt() {
  const [visible, setVisible] = useState(false)
  const [platform, setPlatform] = useState<Platform>('unknown')

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Don't show if already installed as a PWA
    if (isStandalone()) return

    // Don't show if already dismissed
    if (localStorage.getItem(INSTALL_KEY)) return

    // Wait for version splash to have been seen first
    // (so new users aren't hit with two modals on their very first visit)
    if (!localStorage.getItem(VERSION_SPLASH_KEY)) return

    const detected = detectPlatform()
    if (detected === 'unknown') return

    setPlatform(detected)

    // Slight delay so dashboard settles
    const t = setTimeout(() => setVisible(true), 1000)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => {
    localStorage.setItem(INSTALL_KEY, 'true')
    setVisible(false)
  }

  if (!visible || platform === 'unknown') return null

  const steps = STEPS[platform as Exclude<Platform, 'unknown'>]
  const label = PLATFORM_LABELS[platform as Exclude<Platform, 'unknown'>]

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div
          className="px-6 pt-6 pb-5 text-center border-b border-gray-700"
          style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0369a1 100%)' }}
        >
          <div className="text-4xl mb-2">🚢</div>
          <h2
            className="text-white text-lg font-bold"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Add Ahoy! to your home screen
          </h2>
          <p
            className="text-white/70 text-xs mt-1"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
          >
            Get the full app experience — one tap away
          </p>
        </div>

        {/* Steps */}
        <div className="px-5 py-4 space-y-3">
          <p
            className="text-gray-400 text-xs font-bold uppercase tracking-wide"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
          >
            {label} — {steps.length} steps
          </p>

          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center">
                <span className="text-xs font-bold text-gray-300"
                      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                  {i + 1}
                </span>
              </div>
              <p
                className="text-gray-300 text-sm leading-snug pt-0.5"
                style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
              >
                {step.icon} {step.text}
              </p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={dismiss}
            className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold uppercase text-sm rounded-lg transition-colors"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
          >
            Got it!
          </button>
          <button
            onClick={dismiss}
            className="px-4 py-3 text-gray-500 hover:text-gray-300 font-bold uppercase text-xs transition-colors"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
