// The in-app ahoy sound (foreground only; in the background the OS plays the
// notification sound). Respects the silent switch (expo-audio default).

import { createAudioPlayer, type AudioPlayer } from 'expo-audio'

let player: AudioPlayer | null = null

export function playAhoySound() {
  try {
    player ??= createAudioPlayer(require('@/assets/sounds/ahoy.wav'))
    const p = player
    p.seekTo(0)
      .then(() => p.play())
      .catch(() => {})
  } catch {
    // Audio is a nicety; never let it break a notification.
  }
}
