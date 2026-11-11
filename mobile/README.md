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
Cloud builds don't see `.env`; add every `EXPO_PUBLIC_*` value (Supabase URL +
anon key, links domain, Google client IDs) with
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

## Social features (Phase 4)

| Feature | Where |
|---|---|
| Sign in with Apple (iOS) / Google (both) | `components/social-auth-slot.tsx`, `lib/social-auth.ts` (flows, nonce, which buttons), `lib/social-auth-native.ts` |
| "Pick your pirate name" for social-login accounts | `app/(onboarding)/pick-username.tsx`, routed by `lib/auth-routing.ts` from `app/_layout.tsx` |
| Invite links `https://<domain>/add/<name>` and `ahoy://add/<name>` | `app/add/[username].tsx`, `lib/links.ts`, `../links/` (site) |
| Requests: accept / decline / cancel, count badge on Requests | `app/(app)/requests.tsx`, Crew header |
| Phrases with locks, "N more to unlock", unlock celebration, secret Yo! reveal | Settings, `components/phrase-celebration.tsx`, `lib/phrases.ts` |
| Long-press a crewmate → Remove / Block / Report; Unblock list | `components/crew-actions.tsx`, `app/(app)/report.tsx`, Settings |
| Delete account (type your username) | `app/(app)/delete-account.tsx`, `lib/delete-account.ts` |
| Feedback ("message in a bottle") | Settings → `feedback` table |
| Privacy policy + Terms of use links | Settings (`lib/legal.ts`), `links/` footers |

Behavior worth knowing:

- **Declined requests look pending to the sender** everywhere ("Request
  sent"). The database keeps declined rows so they can't be re-sent; Cancel on
  one only hides it on that device (`lib/hidden-requests.ts`).
- **Blocks are silent.** Someone who blocked you looks like "no such sailor"
  on an invite link and never shows up in search.
- **Unlock celebrations** are remembered per user on the device (SecureStore);
  the server decides what's unlocked. The first time a user opens the app on
  a device (no record yet: new phone, reinstall), everything already unlocked
  is marked seen silently — no replays, not even the Yo! reveal. Only unlocks
  after that are celebrated. Yo! gets the PWA's full-screen reveal and, like
  the PWA, becomes your active phrase.
- **Pending invite:** opening an invite link signed out (or before picking a
  username) remembers it for 24 h and opens it right after you get in.

- **Terms of use = Apple's standard EULA**
  (https://www.apple.com/legal/internet-services/itunes/dev/stdeula/), no
  custom terms. Linked from Settings and the links/ site footers; Phase 6 sets
  the same URL in App Store Connect (App Information → License Agreement stays
  "Apple's Standard License Agreement", and the URL goes in the description /
  review notes as Apple asks for subscription-free apps that link terms).

### Social login — decisions

- **Apple is iOS-only (hidden on Android).** On Android it would need the web
  OAuth flow: a Services ID, a client-secret JWT that Apple forces you to
  regenerate at least every 6 months (or sign-in silently breaks), a browser
  round trip with a deep-link return to `ahoy://auth/callback` and PKCE
  handling. Android users have Google and email; App Store guideline 4.8 only
  applies to iOS. Trade-off: someone who signed up with Apple on an iPhone
  can't log into that account on Android (they'd need email/Google on a new
  account). Revisit if that matters.
- **Google on iOS is only shown together with Apple** (guideline 4.8).
- New social-login accounts have **no username** until they pick one; the
  database hides them from everyone and refuses requests/ahoys until then.

### Social login — one-time setup (Duncan)

Do these in order. Everything is free except the Apple Developer Program.

**1. Sign in with Apple (needs the paid Apple Developer account)**

1. developer.apple.com → Certificates, Identifiers & Profiles → Identifiers →
   `com.duncanheidkamp.ahoy` → enable **Sign in with Apple** (Primary App ID)
   and **Associated Domains**. (EAS also syncs capabilities from
   `app.config.ts` — `usesAppleSignIn` / `associatedDomains` — on the next
   `eas build`; check they're ticked.)
2. Keys → **+** → name "Ahoy Sign in with Apple", tick **Sign in with Apple**,
   Configure → primary App ID `com.duncanheidkamp.ahoy` → Save → Download the
   `.p8` (only downloadable once; never commit it — `*.p8` is gitignored).
   Note the **Key ID** and your **Team ID** (Membership).
3. *(Only if you ever add web/Android Apple sign-in)*: Identifiers → **+** →
   Services IDs → e.g. `com.duncanheidkamp.ahoy.signin`, enable Sign in with
   Apple, add domain `<project-ref>.supabase.co` and return URL
   `https://<project-ref>.supabase.co/auth/v1/callback`. Not needed for the
   native iOS flow used now.
4. Supabase dashboard → Authentication → Sign In / Providers → **Apple** →
   enable. **Client IDs**: `com.duncanheidkamp.ahoy` (add the Services ID too
   if you did step 3). Native sign-in needs no secret key there.
5. Token revocation on account deletion (Apple requires it):
   `npx supabase secrets set APPLE_TEAM_ID=… APPLE_KEY_ID=… APPLE_CLIENT_ID=com.duncanheidkamp.ahoy APPLE_PRIVATE_KEY="$(cat AuthKey_XXXX.p8)"`
   then redeploy `delete-account`. Without them deletion still works, it just
   skips revocation (logged).

**2. Google Sign-In (Google Cloud console, same project as Firebase is fine)**

1. APIs & Services → OAuth consent screen: External, app name "Ahoy!",
   support email, privacy policy URL `https://<links domain>/privacy`, scopes
   `email`, `profile`, `openid`. Publish it (Testing mode only lets listed test
   users in).
2. Credentials → Create OAuth client ID, three times:
   - **Web application** ("Ahoy Supabase") — no origins needed. This id is
     `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (the idToken audience on Android).
   - **iOS** — bundle ID `com.duncanheidkamp.ahoy` →
     `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. `app.config.ts` turns it into the
     reversed URL scheme the SDK needs.
   - **Android** — package `com.duncanheidkamp.ahoy` and the **SHA-1** of the
     signing key: `npx eas-cli@latest credentials` → Android → (profile) →
     Keystore → SHA1. Create one Android client per key you sign with (EAS
     development/preview keystore, and later the Play Console *App signing
     key* SHA-1 from Setup → App integrity). →
     `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` (not sent at runtime; the app only
     shows Google when it's set, and Google matches the app by package + SHA-1).
3. Supabase → Authentication → Providers → **Google** → enable. **Client
   IDs** (authorized audiences): `<web id>,<ios id>`. Client secret: the web
   client's secret. Turn on **Skip nonce checks** — the Google iOS SDK puts
   its own nonce in the token and doesn't expose it.
4. Add the three `EXPO_PUBLIC_GOOGLE_*` values to `.env` and as EAS
   environment variables, then make a new native build (the URL scheme is
   native).

**3. Supabase Auth settings**

- Authentication → URL Configuration → Redirect URLs: add `ahoy://**`
  (harmless now; needed if any web-based auth flow is added later).
- Linking: Supabase links a Google sign-in to an existing email account with
  the same verified email automatically. Apple "Hide My Email" addresses
  create a separate account.

## Invite links

`https://<EXPO_PUBLIC_LINKS_DOMAIN>/add/<username>` opens the app directly
(iOS universal link / Android App Link) when installed, otherwise the
`links/` fallback page. `ahoy://add/<username>` always opens the app.

Setup (Duncan), once the domain is chosen:

1. Pick the domain/subdomain (e.g. `ahoy.duncanheidkamp.com`). Set
   `EXPO_PUBLIC_LINKS_DOMAIN` in `.env` and EAS env vars.
2. Vercel → New Project → this repo, **Root Directory `links`**, Framework
   "Other", no build command → add the domain → DNS as Vercel says.
3. In `links/.well-known/apple-app-site-association` replace `TEAMID` with your
   Team ID. In `links/.well-known/assetlinks.json` put the SHA-256 of every key
   that signs Android builds (`eas credentials` → Android → SHA256; add the Play
   App signing key's SHA-256 later). Deploy.
4. Check: `curl -sI https://<domain>/.well-known/apple-app-site-association`
   → 200, `content-type: application/json`, no redirect. Google's checker:
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<domain>&relation=delegate_permission/common.handle_all_urls`.
5. New native build (associated domains / intent filter are native). Apple's
   CDN caches the AASA — allow up to a day, or use
   `applinks:<domain>?mode=developer` while testing.
6. Fill `STORE_LINKS` in `links/add.html` once there are store/TestFlight URLs.

## Reports

Long-press → Report (optionally also blocks). Rows go to `public.reports`
(the app can insert, never read). The app then calls `notify-report`, which
emails you via Resend if configured, else just logs (Supabase → Edge
Functions → notify-report → Logs). Setup:

1. resend.com → API key; verify a sending domain (or use their
   `onboarding@resend.dev` test sender, which only delivers to your own Resend
   account email).
2. `npx supabase secrets set RESEND_API_KEY=re_… REPORT_EMAIL_TO=<you> REPORT_EMAIL_FROM="Ahoy Reports <reports@your-domain>"`
3. `npx supabase functions deploy notify-report`

Apple expects reports to be acted on within 24 hours (guideline 1.2): review
`public.reports` in the dashboard, and delete abusive accounts in
Authentication → Users.

## What only works with real accounts / devices

Apple and Google sign-in (need the provider setup above and a dev build on a
device);
universal links / App Links (need the deployed domain, real Team ID and
SHA-256, and a fresh build); Apple token revocation (needs the `.p8`); report
emails (Resend). Everything else is covered by unit tests and the SQL/Deno
tests.
