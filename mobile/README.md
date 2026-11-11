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

Builds: `npx eas-cli@latest build --profile development --platform ios|android`
(store builds and TestFlight / Play: see **Ship it** below).
Cloud builds don't see `.env`; add every `EXPO_PUBLIC_*` value (Supabase URL +
anon key, links domain, Google client IDs) with
`npx eas-cli@latest env:create` for each EAS environment you build.

Layout: `index.ts` (entry: push bootstrap, then expo-router), `app/` routes
(Expo Router; `(auth)` and `(app)` groups behind an auth gate in
`app/_layout.tsx`), `components/`, `lib/` (Supabase client, TanStack Query
hooks in `lib/queries.ts`, pure logic, `lib/push/` for notifications),
`theme.ts` (all colors, type, spacing, radii, motion). `lib/types.ts` is a copy of
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
2. Replace `mobile/assets/sounds/ahoy.wav`, bump `APP_VERSION` in
   `app.config.ts` and make a **new native build**
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

## Ship it (Phase 6)

Goal: the crew installs from **TestFlight** (iPhone) and **Google Play internal
testing** (Android). No public store listings yet (a new personal Play account
needs a 12-tester / 14-day closed test first). Paperwork to paste lives in
[`store/`](store/):

| File | What |
|---|---|
| [`store/app-store-connect.md`](store/app-store-connect.md) | ASC record, TestFlight text, review notes + demo account, age rating, App Privacy label |
| [`store/google-play.md`](store/google-play.md) | Play app, internal testing steps, App content, content rating, Data safety |
| [`store/screenshots.md`](store/screenshots.md) | Current required sizes + shot list (not needed for TestFlight/internal) |
| [`store/crew-invite.md`](store/crew-invite.md) | The text to send friends + troubleshooting |
| [`store/launch-checklist.md`](store/launch-checklist.md) | Definition of done on two real phones + migration-status SQL |

### Build profiles (`eas.json`)

| Profile | What | Distribution | Update channel |
|---|---|---|---|
| `development` | dev client, your phone | internal (APK / ad hoc) | `development` |
| `development-simulator` | dev client, iOS simulator | internal | `development` |
| `preview` | release build without dev client, for quick installs | internal (APK / ad hoc) | `preview` |
| `production` | TestFlight / Play: iOS store build, Android **app bundle**; build number / versionCode auto-incremented on EAS (`appVersionSource: remote`) | store | `production` |

`submit.production`: iOS uses `ascAppId` + `appleTeamId` (placeholders until
you create the ASC record — `eas submit` refuses them with a clear message);
Android submits to `track: internal` as `releaseStatus: draft` with the key
from `$GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH` or the gitignored
`mobile/secrets/google-play-service-account.json`.

### Over-the-air updates (EAS Update)

`expo-updates` is configured from `EAS_PROJECT_ID` (`updates.url =
https://u.expo.dev/<id>`); without the id updates are off. Each build profile
listens to its own channel (table above). Publish JS-only fixes with:

```bash
npx eas-cli@latest update --channel production --environment production --message "fix typo"
```

The app checks on launch without waiting and applies a downloaded update on
the next cold start.

**`runtimeVersion` policy: `appVersion`.** An update reaches only binaries
whose `version` (`APP_VERSION` in `app.config.ts`) matches. Picked over
`fingerprint` because `app.config.ts` depends on env vars that differ between
the build machine and wherever you run `eas update` (`EAS_BUILD_PROFILE` sets
the APNs entitlement, `GOOGLE_SERVICES_JSON` is a machine-specific path), which
would make fingerprints disagree and updates silently never apply. The price:
**bump `APP_VERSION` whenever anything native changes** — a new native
package or config plugin, `ahoy.wav`, icons/splash, permissions, associated
domains / links domain, Google iOS client id, an Expo SDK upgrade — then make
new builds. JS/asset-only changes go out as updates.

### Store hygiene built into the config

- **iOS background modes:** none. `expo-task-manager` always adds `fetch`;
  `app.config.ts` strips it. The only task is Android's notification-action
  task; on iOS "Ahoy back!" is a notification action (no background mode
  needed) and there are no silent pushes, so no `remote-notification` either.
- `ITSAppUsesNonExemptEncryption: false` (HTTPS only) → no export-compliance
  question per TestFlight build.
- **Privacy manifest** (`ios.privacyManifests` → `PrivacyInfo.xcprivacy`):
  no tracking; required-reason APIs = the union of what the native deps
  declare (UserDefaults CA92.1; file timestamp C617.1, 0A2A.1, 3B52.1; system
  boot time 35F9.1; disk space E174.1, 85F4.1). Ahoy has no AsyncStorage
  (SecureStore/Keychain isn't a required-reason API). Recheck after adding a
  native dependency: `find node_modules -name PrivacyInfo.xcprivacy`.
- **No stray usage strings:** no camera/mic/location/photos/contacts keys;
  `NSFaceIDUsageDescription` removed (`expo-secure-store` `faceIDPermission:
  false`); the dev launcher's local-network keys are dropped from
  preview/production builds.
- **Android permissions:** blocked `SYSTEM_ALERT_WINDOW`,
  `READ/WRITE_EXTERNAL_STORAGE`, `RECORD_AUDIO`. Kept `INTERNET`,
  `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE`,
  `MODIFY_AUDIO_SETTINGS` (expo-audio; install-time, no prompt),
  `ACCESS_NETWORK_STATE` (expo-updates).
- **targetSdk 36 / compileSdk 37 / minSdk 24** are the Expo SDK 58 (React
  Native 0.88) defaults — Google Play has required target API 36 for new apps
  and updates since 31 Aug 2026. No `expo-build-properties` override; when
  Play announces API 37, upgrading the Expo SDK is the normal path (or add
  `expo-build-properties` with `android.targetSdkVersion`).
- Checked with `npx expo prebuild --no-install --clean` in a temp copy
  (`EAS_BUILD_PROFILE=production`); the final merged AndroidManifest is only
  visible in a real Gradle build (EAS build logs, or `bundletool dump
  manifest` on the `.aab`).

### Push receipts (dead-token cleanup)

Expo can accept a push ("ok" ticket) to a phone that has since uninstalled
Ahoy; that only shows in the **receipt** later. `send-ahoy`,
`notify-friendship` and the PWA route store ok tickets in `push_tickets`
(service role only, purged after 24 h). Every 30 min pg_cron runs
`public.run_push_receipt_pruning()`, which POSTs (pg_net) to the
`prune-push-receipts` Edge Function; it fetches receipts in batches of ≤ 1000
and deletes tokens reported `DeviceNotRegistered`. (`notify-report` sends
email, not pushes, so it has no tickets.) Setup is in the steps below.

### TestFlight builds expire after 90 days

Every TestFlight build stops launching **90 days after upload**; testers see
"This beta has expired". Upload a new production build (same or bumped
version) before then — an OTA update does not extend it. Set yourself a
reminder ~80 days after each upload. Play internal-testing builds don't expire.

### Duncan's steps, in order

Assumes the Apple Developer Program and Google Play developer accounts are
approved, and the Phase 3/4 setup above is done (EAS project, Firebase/FCM V1
key, Apple/Google sign-in, links domain).

**Backend (once)**

1. `npx supabase link --project-ref <ref>` → `npx supabase db push` (adds
   `push_tickets`, the pruning function and the cron job). If the push prints
   *pg_cron missing* / *pg_cron not enabled*: Dashboard → Database →
   Extensions → enable **pg_cron** and **pg_net**, then run in the SQL editor:
   `select cron.schedule('prune-push-receipts', '*/30 * * * *', 'select public.run_push_receipt_pruning()');`
2. Make a random secret (`openssl rand -hex 32`) and store it twice — SQL
   editor:
   `select vault.create_secret('https://<ref>.supabase.co', 'project_url');`
   `select vault.create_secret('<secret>', 'prune_receipts_secret');`
   and `npx supabase secrets set PRUNE_RECEIPTS_SECRET=<secret>`.
3. Deploy: `npx supabase functions deploy send-ahoy notify-friendship prune-push-receipts`
   (config.toml turns JWT verification off for `prune-push-receipts`; it
   checks the secret). Check after a while: `select * from
   cron.job_run_details order by start_time desc limit 5;` →
   "receipts check requested" / "no tickets due".

**iOS → TestFlight**

4. Create the app record and fill `ascAppId` / `appleTeamId` in `eas.json`
   (`store/app-store-connect.md` §1); commit.
5. EAS environment **production** has every value: `npx eas-cli@latest env:list --environment production`
   → `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
   `EAS_PROJECT_ID`, `EXPO_PUBLIC_LINKS_DOMAIN`, `EXPO_PUBLIC_GOOGLE_*`,
   `GOOGLE_SERVICES_JSON` (file).
6. `npx eas-cli@latest build --profile production --platform ios` — log in
   with your Apple ID; let EAS create the distribution certificate,
   provisioning profile and (if not done) the APNs key.
7. `npx eas-cli@latest submit --profile production --platform ios --latest` —
   let EAS create an App Store Connect API key when asked. Processing in
   TestFlight takes ~5–30 min.
8. TestFlight: fill Test Information, create the demo accounts, create the
   external group **Crew**, add the build, submit for Beta App Review, enable
   the **Public Link** (`store/app-store-connect.md` §4). Install it yourself
   first via the link.

**Android → Play internal testing**

9. Create the app, tester list, then the **manual first upload** of the
   production `.aab` and roll it out (`store/google-play.md` §2 steps 1–2).
10. Copy Play's **app signing** SHA-256 into `links/.well-known/assetlinks.json`
    and its SHA-1 into a new Google OAuth Android client (§2 step 3); deploy
    `links/`. Install from the join link yourself first.
11. Service account for later `eas submit` (§2).

**Crew**

12. Put the TestFlight public link and the Play join link into
    `links/site-config.js` (and optionally a support email), deploy `links/`.
13. Collect Android friends' Google emails → Play tester list. Send the
    messages from `store/crew-invite.md`.
14. Run `store/launch-checklist.md` with one friend; watch the migration-status
    SQL until everyone has a native token and has received an Ahoy.
15. Then: the **phase-6-retire-pwa** PR (its description has the exact
    preconditions and deploy order).

**Later builds:** `npx eas-cli@latest build --profile production --platform all --auto-submit`,
then iOS: add the build to the Crew group (or set `submit.production.ios.groups`);
Android: roll out the draft in Play Console. JS-only: `eas update` (above).

## Design (Phase 5)

| Piece | Where |
|---|---|
| Tokens: dark + parchment-light palettes, type scale, spacing, radii, motion (all ≤ 300 ms) | `theme.ts` — `useTheme()`, `createStyles()`; no other file may hard-code a color/font (test) |
| Light/dark | `userInterfaceStyle: 'automatic'`; dark when the OS doesn't say. Status bar + root view color follow the theme (`app/_layout.tsx`) |
| Pirata One (titles, section/nav headers, phrase flash, banner title, unlock/Yo! reveals) | `@expo-google-fonts/pirata-one`, loaded in `app/_layout.tsx` before the splash hides; system sans everywhere else |
| Moments: wave sweep + phrase scale-in on send (medium haptic), success haptic on an ahoy received in the foreground, sliding toasts/banner | `components/crew-row.tsx`, `lib/push/foreground.ts`, `lib/motion.ts` |
| Reduce Motion → every moment becomes a short fade | `lib/motion.ts` (`moments()`), `components/motion.ts` (`useMoments()`) |
| Empty / error / loading states in one voice ("Lost at sea — …") | `components/ui.tsx` (`EmptyState`, `RowSkeleton`, `CardSkeleton`, `ErrorText`, `LinkText`) |
| Icons, splash, notification icon | `scripts/make-icons.py` → `assets/images/` (see below) |

Accessibility rules the code follows: Dynamic Type everywhere (only Pirata
One display text has a `maxFontSizeMultiplier`, from `maxFontScale`); crew
rows grow, and from font scale 1.6 the badge/count drop under the name;
every pressable has a role + label; 44pt minimum targets; every text/background
pair is ≥ 4.5:1 in both modes (`__tests__/theme.test.ts`). Locked phrases are
outlined, not dimmed, to keep contrast.

### Icons and splash

`python3 scripts/make-icons.py` (Pillow) redraws everything from code: the
PWA's white AHOY wordmark (Bebas Neue, OFL, `scripts/fonts/`, used only by the
script) on the ocean palette with teal waves. Outputs: `icon.png` (iOS light
+ default), `icon-dark.png` / `icon-tinted.png` (iOS 18 dark/tinted, transparent),
`android-icon-{foreground,background,monochrome}.png`,
`splash-icon-{light,dark}.png`, `notification-icon.png` (white anchor, 96×96).
Icons/splash are native: a change needs a new build, not an OTA update.
Swapping in a designer-made icon later = replace these files (same names) —
or an Icon Composer `.icon` for iOS 26 Liquid Glass via `ios.icon`.

### Store assets

Screenshot sizes, shot list and the real-device design checks moved to
[`store/screenshots.md`](store/screenshots.md) (Phase 6).

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
  custom terms. Linked from Settings (`lib/legal.ts`) and the links/ site
  footers. Phase 6: leave App Store Connect → App Information → License
  Agreement on Apple's standard one and reference the same URL there.

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
6. Fill `links/site-config.js` (TestFlight public link, Play join link, later
   the App Store URL, optional support email) — used by `/`, `/add/*` and
   `/support`.

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
