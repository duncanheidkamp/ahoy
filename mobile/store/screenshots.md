# Screenshots and store graphics

**None of this is needed for Phase 6.** TestFlight and Play internal testing
work without screenshots or a store listing. Take them when you go for a
public listing (or while the crew is testing, since you'll have real data).

## Sizes (checked 11 Nov 2026)

### App Store (Apple, "Screenshot specifications" in App Store Connect Help)

PNG or JPEG, **no alpha/transparency**, 1–10 per size, portrait.

| Set | Accepted portrait sizes | Status |
|---|---|---|
| iPhone with Dynamic Island, **medium** (6.3": iPhone 14 Pro – 18 Pro, 15/16/17) | **1206 × 2622** or 1179 × 2556 | **Required** ("at least one screenshot for iPhone with Dynamic Island (medium display)") |
| iPhone with Dynamic Island, **large** (6.9": 16/17/18 Pro Max, Air, Plus) | **1320 × 2868**, 1290 × 2796 or 1260 × 2736 | Provide it: otherwise the 6.5" set below becomes required |
| iPhone with Face ID, large (6.5": 11 Pro Max, XS Max, XR) | 1284 × 2778 or 1242 × 2688 | Required only if the 6.9" set is missing |
| Smaller iPhones | — | Optional; ASC scales down from the larger sets |
| iPad | — | Not needed: `supportsTablet: false` |
| iPhone Duo | 1398 × 2034 / 2007 × 2853 | Optional now; Apple says required from April 2027 for apps built with the iOS 27.1 SDK |

**Plan:** one set at **1320 × 2868** (iPhone 16/17 Pro Max simulator) and one
at **1206 × 2622** (iPhone 16/17 Pro simulator). Same screens in both.

### Google Play (Play Console Help, "Add preview assets")

| Asset | Spec |
|---|---|
| Phone screenshots | 2–8, PNG/JPEG, 16:9 or 9:16, each side 320–3840 px; use **1080 × 1920** or larger (≥ 1080 px is needed to be eligible for promotion) — e.g. a Pixel's native 1080 × 2400 is fine |
| App icon | **512 × 512**, 32-bit PNG, ≤ 1 MB (export `assets/images/icon.png` at 512) |
| Feature graphic | **1024 × 500**, PNG/JPEG, no alpha |

If a size above is rejected when you upload, the store's own error message is
authoritative; these pages change.

## Shot list (from Phase 5)

Take each in **dark** mode; consider one light-mode set for Play.

1. **Crew list** with 4–6 crewmates and badges (use real friends' consent or
   test accounts with fun names).
2. **A send mid-flash** — tap a row and capture the wave sweep + phrase
   ("Ahoy!" / "Arrrggggg Matey!").
3. **Lock-screen notification** with "Ahoy!" and the Ahoy back! action
   (long-press on iOS to show the action).
4. **Settings → phrases** with one unlocked and one locked phrase.
5. **Invite card** (`/add/<username>` screen in the app).

Tips: iOS simulator → `xcrun simctl io booted screenshot shot.png` gives
exact device pixels; set the status bar first with
`xcrun simctl status_bar booted override --time 9:41 --batteryLevel 100 --cellularBars 4`.
Android emulator: Extended controls → Screenshot, or
`adb shell screencap -p /sdcard/s.png`. Push notifications don't arrive on
simulators, so take shot 3 on a real phone (scale to 1320 × 2868 / 1206 × 2622
with no alpha, or skip it).

## Real-device checks before the shots (Phase 5 carry-over)

- [ ] Home-screen icon in light / dark / tinted (iOS 18+), Android themed
      (monochrome) icon
- [ ] Splash in both appearances
- [ ] Notification anchor icon in the Android status bar
- [ ] Pirata One renders (titles, phrase flash)
- [ ] Wave animation feel, haptics, Reduce Motion → fades
- [ ] Largest Dynamic Type / font size on every screen
