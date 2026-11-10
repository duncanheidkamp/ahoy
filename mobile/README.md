# Ahoy — native app (Expo)

iOS/Android client for Ahoy. Talks to Supabase directly (RLS + RPCs) and sends
through the `send-ahoy` Edge Function — see `../CLAUDE.md` for the backend.

Uses a **development build** (`expo-dev-client`), not Expo Go.

```bash
cp .env.example .env          # fill in the Supabase URL + anon key
npm install
npm test                      # jest-expo unit tests
npm run typecheck && npm run lint
npx expo start                # then open the dev build on your phone
```

Builds: `npx eas-cli@latest build --profile development --platform ios|android`.
Cloud builds don't see `.env`; add the two `EXPO_PUBLIC_*` values with
`npx eas-cli@latest env:create` for each EAS environment you build.

Layout: `index.ts` (entry: push bootstrap, then expo-router), `app/` routes
(Expo Router; `(auth)` and `(app)` groups behind an auth gate in
`app/_layout.tsx`), `components/`, `lib/` (Supabase client, TanStack Query
hooks in `lib/queries.ts`, pure logic, `lib/push/` for notifications),
`theme.ts` (all colors/type). `lib/types.ts` is a copy of
`../lib/supabase/types.ts` — keep them in sync.

## Push notifications

An Ahoy arrives as a push with the pirate sound; **Ahoy back!** on the
notification sends one back without opening the app. Friend requests and
accepts push too. Push needs a **development build on a real device** —
simulators/emulators can't get Expo push tokens, and Expo Go isn't supported.

### One-time setup (accounts — do these in order)

1. **EAS project.** `npx eas-cli@latest init` in `mobile/`, then put the
   printed project id in `EAS_PROJECT_ID` (`.env` locally and as an EAS
   environment variable). The app reads it from `extra.eas.projectId` for
   `getExpoPushTokenAsync({ projectId })`; without it the app never registers.
2. **Android (can be done first, no Apple account needed).**
   1. In the [Firebase console](https://console.firebase.google.com) (the same
      project as the PWA is fine) add an **Android app** with package
      `com.duncanheidkamp.ahoy`. Download its `google-services.json`.
   2. Give it to builds **without committing it** (it's gitignored):
      `npx eas-cli@latest env:create --name GOOGLE_SERVICES_JSON --type file --visibility secret --value ./google-services.json --environment development`
      (repeat for `preview`/`production`). EAS sets the variable to the
      file's path on the build machine; `app.config.ts` passes it to
      `android.googleServicesFile`. For local `expo run:android`/prebuild,
      either set `GOOGLE_SERVICES_JSON=/path/to/file` or drop the file at
      `mobile/google-services.json`. Check with
      `npx expo config --type public | grep googleServicesFile`.
   3. Firebase console → Project settings → Service accounts → **Generate new
      private key** (FCM HTTP v1). Upload it to Expo:
      `npx eas-cli@latest credentials` → Android → production →
      *Google Service Account* → *Manage your Google Service Account Key for
      Push Notifications (FCM V1)* → upload the JSON. Expo's push service uses
      it to deliver to Android. (This is a different file from
      `google-services.json`; never commit either.)
3. **iOS (needs a paid Apple Developer Program membership).** Push requires
   the APNs entitlement, which free accounts can't sign. On the first
   `eas build --platform ios`, accept "Generate a new Apple Push
   Notifications service key" (or later: `eas credentials` → iOS → Push
   Notifications). **EAS generates the APNs key and stores it** — nothing to
   download or commit. `app.config.ts` sets `aps-environment` to
   `production` for the `production` profile and `development` otherwise.
4. **Backend.** `npx supabase db push` (adds `friendship_notifications`) and
   `npx supabase functions deploy notify-friendship` (plus redeploy
   `send-ahoy`, whose payload gained `data.type`). Optional:
   `EXPO_ACCESS_TOKEN` secret if you turn on Expo "enhanced push security".
5. Build: `npx eas-cli@latest build --profile development --platform android`
   (then `ios`), install, log in on two devices, add each other.

### How it works

| Piece | Where |
|---|---|
| Entry: handler, `ahoy` category, response listener, cold-start check, Android task | `lib/push/bootstrap.ts` (imported first by `index.ts`) |
| Android channels `ahoy-v1` (HIGH, `ahoy.wav`, vibration) and `requests-v1` (HIGH, default sound), created at startup before any token request | `lib/push/native.ts` |
| Permission pre-prompt (after the first crewmate, "Not now" re-offers ≥ 3 days later on a later app open), Settings row | `app/(app)/enable-notifications.tsx`, `lib/push/prompt.ts`, Settings screen |
| Token: `getExpoPushTokenAsync({ projectId })` → `register_push_token(p_token, p_platform, p_device_name)` on every start/foreground while permitted, and on token change | `lib/push/registration.ts`, `usePushSession` |
| Logout: delete this device's `push_tokens` row (RLS delete, own rows only) **before** `signOut()` | `signOutWithPushCleanup` |
| Foreground: system banner suppressed for `ahoy` / `friend_request` / `friend_accepted`; in-app banner + `expo-audio` sound; stats/requests queries invalidated | `lib/push/foreground.ts`, `components/in-app-banner.tsx` |
| Taps: ahoy → Crew, friend request → Requests | `lib/push/responses.ts` |
| Friend pushes: app calls `notify-friendship` after insert/accept; server decides from the row | `lib/queries.ts`, `supabase/functions/notify-friendship` |

Every notification response is handled once, keyed by
`(notification request id, action)` and remembered in SecureStore, because
the same response can reach the listener, `getLastNotificationResponseAsync()`
and (Android) the background task — possibly in different JS runtimes.

Before sending from a notification the access token is refreshed if it
expires within a minute (auto-refresh only runs in the foreground). The
session lives in SecureStore with `AFTER_FIRST_UNLOCK`, so it is readable from
the lock screen — but not between a reboot and the first unlock.

### "Ahoy back!" — what to expect per platform

The action is registered with `opensAppToForeground: false`. Whether the OS
gives the app time to run JS depends on state:

| App state | iOS | Android |
|---|---|---|
| Foreground | Listener → send → toast "Ahoy sent back to @x" | Same |
| Background (suspended) | iOS wakes the app in the background and delivers the response to the listener. Expo completes the system callback immediately, so iOS may suspend the app again before the request finishes. | `registerTaskAsync` task runs (headless JS); the listener may also fire → deduped. Notification is dismissed (Android leaves it up after an action). |
| Killed | iOS launches the app in the background; listeners are not called (Expo docs), but the response is kept as the "last response", which `bootstrap.ts` reads at module scope. Unverified how reliably iOS gives enough time. | Headless task, as above. Doze / OEM battery savers can delay or kill it. |

**Fallback, both platforms:** the intent is saved *before* the send. If the
send didn't finish (offline, suspended, killed mid-request), the next time the
app is opened — including by tapping the notification body — it is sent
automatically with a toast, if under 15 minutes old. Refusals
(`not_friends`, `rate_limited`) and signed-out are dropped.

### Badge

The server never sets `badge`; the app clears the icon badge
(`setBadgeCountAsync(0)`) whenever it becomes active. Simple and never wrong.
Android launcher dots follow the notifications in the tray instead.

### Replacing the placeholder sound

`assets/sounds/ahoy.wav` is a **placeholder** ship bell
(`python3 scripts/make-placeholder-sound.py`). To use the real gruff pirate
"Ahoy!":

1. Export it as **`ahoy.wav`** — same name, it is referenced by name
   everywhere: 16-bit PCM (linear PCM) WAV, mono, 44.1 kHz, **under 30
   seconds** (iOS silently falls back to the default sound if longer; aim for
   1–3 s). E.g.
   `ffmpeg -i ahoy-take3.m4a -ac 1 -ar 44100 -c:a pcm_s16le -t 3 assets/sounds/ahoy.wav`
2. Replace `mobile/assets/sounds/ahoy.wav` and make a **new native build**
   (the file is bundled by the `expo-notifications` config plugin `sounds`
   option; an OTA update can't change it — only the in-app foreground sound
   would update).
3. **Android:** a channel's sound is fixed when the channel is first created
   on a device. If any device already has `ahoy-v1`, bump the channel id
   (`ahoy-v2`) in `lib/push/constants.ts`, `app.config.ts` (`defaultChannel`),
   `../supabase/functions/_shared/push.ts` and `../lib/push/expo.ts`, then
   redeploy `send-ahoy` and the PWA together with the new build (a push to a
   channel the device doesn't have is not shown). Before anyone has installed
   the app, just replacing the file is enough.

### Verified only on real devices

Delivery to a locked phone and the custom sound (both platforms); "Ahoy
back!" from the lock screen and with the app suspended/killed (iOS especially);
Android headless task under Doze/battery savers; per-sender grouping on iOS;
the pre-prompt → system dialog flow; token re-binding when switching accounts.
