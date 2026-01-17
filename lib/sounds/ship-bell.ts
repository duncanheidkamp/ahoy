'use client'

// Ship bell sound synthesizer using Web Audio API
let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  return audioContext
}

export async function playShipBell(): Promise<void> {
  try {
    const ctx = getAudioContext()

    // Resume context if suspended (browsers require user interaction)
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    const now = ctx.currentTime

    // Create oscillator for bell tone
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    // Bell-like frequency (E5 note, approximately 659 Hz)
    oscillator.frequency.setValueAtTime(659, now)
    oscillator.type = 'sine'

    // Add slight frequency decay for more realistic bell
    oscillator.frequency.exponentialRampToValueAtTime(550, now + 0.5)

    // Bell envelope - quick attack, longer decay
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(0.6, now + 0.01) // Quick attack
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.5) // Long decay

    // Add harmonics for richer bell sound
    const harmonic = ctx.createOscillator()
    const harmonicGain = ctx.createGain()
    harmonic.frequency.setValueAtTime(659 * 2.4, now) // Higher harmonic
    harmonic.type = 'sine'
    harmonicGain.gain.setValueAtTime(0, now)
    harmonicGain.gain.linearRampToValueAtTime(0.2, now + 0.01)
    harmonicGain.gain.exponentialRampToValueAtTime(0.01, now + 1.0)

    // Connect nodes
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)
    harmonic.connect(harmonicGain)
    harmonicGain.connect(ctx.destination)

    // Play
    oscillator.start(now)
    harmonic.start(now)
    oscillator.stop(now + 1.5)
    harmonic.stop(now + 1.0)

    // Second strike for traditional ship bell double-ring
    setTimeout(() => {
      playBellStrike(ctx)
    }, 300)

  } catch (error) {
    console.error('Failed to play ship bell:', error)
  }
}

function playBellStrike(ctx: AudioContext): void {
  const now = ctx.currentTime

  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.frequency.setValueAtTime(659, now)
  oscillator.type = 'sine'
  oscillator.frequency.exponentialRampToValueAtTime(550, now + 0.5)

  gainNode.gain.setValueAtTime(0, now)
  gainNode.gain.linearRampToValueAtTime(0.5, now + 0.01)
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.2)

  const harmonic = ctx.createOscillator()
  const harmonicGain = ctx.createGain()
  harmonic.frequency.setValueAtTime(659 * 2.4, now)
  harmonic.type = 'sine'
  harmonicGain.gain.setValueAtTime(0, now)
  harmonicGain.gain.linearRampToValueAtTime(0.15, now + 0.01)
  harmonicGain.gain.exponentialRampToValueAtTime(0.01, now + 0.8)

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)
  harmonic.connect(harmonicGain)
  harmonicGain.connect(ctx.destination)

  oscillator.start(now)
  harmonic.start(now)
  oscillator.stop(now + 1.2)
  harmonic.stop(now + 0.8)
}
