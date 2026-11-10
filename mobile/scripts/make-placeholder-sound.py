"""Writes assets/sounds/ahoy.wav: a PLACEHOLDER ship-bell double strike.

Same synthesis as the PWA's lib/sounds/ship-bell.ts: a 659 Hz sine gliding
to 550 Hz over 0.5 s plus a 2.4x harmonic, 10 ms linear attack and
exponential decay; a second, slightly softer strike 0.3 s later.
Output: 16-bit PCM, 44.1 kHz, mono, 1.5 s.

    python3 scripts/make-placeholder-sound.py

Replace the output with the real recording when there is one (see README).
"""
import os
import wave

import numpy as np

RATE = 44100
LENGTH = 1.5  # seconds; iOS needs < 30 s, keep it short


def envelope(t, peak, end):
    """linearRamp(0 -> peak, 10 ms) then exponentialRamp(-> 0.01, end); 0 after end."""
    env = np.zeros_like(t)
    attack = t < 0.01
    env[attack] = peak * t[attack] / 0.01
    decay = (t >= 0.01) & (t < end)
    env[decay] = peak * (0.01 / peak) ** ((t[decay] - 0.01) / (end - 0.01))
    return env


def strike(t, gain, harmonic_gain, end, harmonic_end):
    # Fundamental: exponential glide 659 -> 550 Hz over 0.5 s, then held.
    f0, f1 = 659.0, 550.0
    glide = np.minimum(t, 0.5)
    freq_phase = f0 * 0.5 / np.log(f1 / f0) * ((f1 / f0) ** (glide / 0.5) - 1)
    phase = 2 * np.pi * (freq_phase + f1 * np.maximum(t - 0.5, 0))
    out = np.sin(phase) * envelope(t, gain, end)
    out += np.sin(2 * np.pi * 659.0 * 2.4 * t) * envelope(t, harmonic_gain, harmonic_end)
    return out


t = np.arange(int(RATE * LENGTH)) / RATE
signal = strike(t, 0.6, 0.2, 1.5, 1.0)
t2 = t - 0.3
second = np.zeros_like(t)
mask = t2 >= 0
second[mask] = strike(t2[mask], 0.5, 0.15, 1.2, 0.8)
signal += second

signal *= 0.9 / np.max(np.abs(signal))
pcm = (signal * 32767).astype('<i2')

out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds', 'ahoy.wav')
with wave.open(out, 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes(pcm.tobytes())
print(f'wrote {os.path.normpath(out)}')
