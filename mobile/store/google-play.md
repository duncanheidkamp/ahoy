# Google Play Console — Ahoy

Phase 6 ships to the **internal testing** track only. New *personal* developer
accounts must run a **closed** test with at least 12 testers for 14 days
before they can apply for production, so a public listing is out of scope;
internal testing has no such rule (up to 100 testers, available within
minutes, no store listing needed).

`<links domain>` = `EXPO_PUBLIC_LINKS_DOMAIN`.

## 1. Create the app

Play Console → **Create app**

| Field | Value |
|---|---|
| App name | `Ahoy!` (≤ 30) |
| Default language | English (United States) |
| App or game | App |
| Free or paid | Free |
| Declarations | Developer Program Policies ✓, US export laws ✓ |

The package name (`com.duncanheidkamp.ahoy`) is fixed by the first uploaded
bundle and can never change.

## 2. Internal testing — step by step

1. **Testers.** Testing → Internal testing → **Testers** tab → Create email
   list "Crew" → add each Android friend's **Google account** email (the one
   signed in to Play Store on their phone) → Save → tick the list.
2. **First upload is manual** (Google's API can't create the first release of
   a new app, so `eas submit` fails until one bundle exists):
   1. `npx eas-cli@latest build --profile production --platform android`
   2. Download the `.aab` from the build page (expo.dev → Builds).
   3. Internal testing → **Create new release** → accept **Play App Signing**
      (Google holds the app signing key; EAS's keystore becomes the upload
      key) → upload the `.aab` → Release name `1.0.0 (1)` → release notes
      (below) → Next → **Save and publish** (internal releases aren't
      reviewed).
3. **App signing SHA-256 → App Links + Google Sign-In.** Play re-signs the app,
   so add Play's key everywhere the EAS key is listed: Setup → **App
   integrity** → App signing → copy **SHA-256** and **SHA-1** of the *App
   signing key certificate*:
   - SHA-256 → `links/.well-known/assetlinks.json` (keep the EAS one too) →
     deploy links.
   - SHA-1 → a new Google Cloud **Android** OAuth client for
     `com.duncanheidkamp.ahoy` (mobile/README → Social login).
   Without this, invite links open the browser and Google sign-in fails on
   the Play-installed app even though they worked on EAS preview builds.
4. **Join link.** Internal testing → Testers → **Copy link** under "How
   testers join your test". Paste it into `links/site-config.js` → `play`
   and into `crew-invite.md`. (Google: the link can take a few hours to work
   after the first publish; the app shows a temporary name for up to 48 h.)
5. **Later builds:** `npx eas-cli@latest build --profile production --platform android --auto-submit`
   (or `eas submit -p android --latest`). `eas.json` submits to
   `track: internal` with `releaseStatus: draft` — required while the app
   itself is a draft. Open the draft in Play Console and **Review release →
   Start rollout to Internal testing**. Once the app has left draft status
   (after the first rollout) you may switch `releaseStatus` to `completed`
   to skip that click.

### Service account for `eas submit` (step 5)

1. Google Cloud console (any project, e.g. the Firebase one) → IAM & Admin →
   Service accounts → Create → name `eas-submit` → no roles → Done → Keys →
   Add key → JSON → download.
2. Play Console → **Users and permissions** → Invite new users → the service
   account's email → App permissions → Ahoy → *Release to testing tracks*
   (+ *View app information*) → Invite.
3. Put the JSON at `mobile/secrets/google-play-service-account.json`
   (gitignored), or anywhere and set
   `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH=/path/to/key.json`. `eas.json` reads
   `${GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH:-./secrets/google-play-service-account.json}`.
   Alternatively upload it once with `npx eas-cli@latest credentials` →
   Android → production → Google Service Account → *Upload a Google Service
   Account Key for Play Store submissions*, and delete the
   `serviceAccountKeyPath` line. Never commit the key.

### Release notes (en-US, ≤ 500)

```
Ahoy is now a real Android app! Log in with the same email as the website, allow notifications, and tap a crewmate to send an Ahoy. "Ahoy back!" works right from the notification.
```

## 3. App content (Policy → App content)

Not required to start an internal test, but Play nags until done and needs
them all before any wider release.

| Section | Answer |
|---|---|
| Privacy policy | `https://<links domain>/privacy` |
| App access | **All or some functionality is restricted** → add instructions: "Sign in with email `appreview@<your domain>` / `<password>`. The account is already in a crew with `ahoy_firstmate`; tap that row to send an Ahoy." (same demo account as `app-store-connect.md` §4) |
| Ads | No, my app does not contain ads |
| Content rating | §4 |
| Target audience | 13–15, 16–17, 18+ (**not** under 13 — that pulls in the Families policy). Appeal to children: No |
| News app | No |
| COVID-19 contact tracing | No |
| Data safety | §5 |
| Government app | No |
| Financial features | My app doesn't provide any financial features |
| Health | No health features |
| Account deletion | App lets users create accounts → deletion URL `https://<links domain>/support#delete-account` (in-app path: Settings → Delete account) |

## 4. Content rating (IARC questionnaire)

Email for the certificate: yours. **Category: Social / Communication** (if
offered "All Other App Types", pick that).

| Question | Answer |
|---|---|
| Violence, fear, sexuality, nudity, language, controlled substances, crude humor | No / None |
| Gambling (real or simulated) | No |
| Does the app let users interact or exchange content? | **Yes** (users send each other greetings and see usernames) |
| Can users share their physical location with others? | No |
| Does the app allow purchase of digital goods? | No |
| Does the app contain unrestricted internet access (browser)? | No |
| Is it a web browser / search engine? | No |
| Primarily news / educational? | No |

Expected: Everyone / PEGI 3 / USK 0 with the interactive element "Users
Interact". That's fine alongside a 13+ target audience.

## 5. Data safety form

Same facts as the App Store label (`app-store-connect.md` §7), in Google's
categories. Ahoy has no ads, analytics or crash SDKs; Supabase, Expo, FCM and
Resend are service providers, which Google doesn't count as "sharing".

**Overview questions**

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS only) |
| Which account creation methods does your app support? | Username and password (email); OAuth (Sign in with Google; Apple on iOS only) |
| Do you provide a way for users to request that their data is deleted? | **Yes** — in-app Settings → Delete account, and `https://<links domain>/support#delete-account` |
| Delete account URL | `https://<links domain>/support#delete-account` |

**Data types** — for each: *Collected* Yes, *Shared* No, *Processed
ephemerally* No.

| Google category → type | What | Required / optional | Purposes |
|---|---|---|---|
| Personal info → **Email address** | Account email | Required | App functionality, Account management |
| Personal info → **Name** | Only with Google sign-in (stored by Supabase Auth from Google's token, not shown) | Optional | Account management |
| Personal info → **User IDs** | Account UUID, username | Required | App functionality, Account management |
| Messages → **Other in-app messages** | Each Ahoy (sender, receiver, predefined phrase, time) | Required | App functionality |
| App activity → **App interactions** | Ahoy counts, badges, phrase unlocks, crew requests/accepts | Required | App functionality |
| App activity → **Other user-generated content** | Feedback text (+ app version), report notes, crew/block lists | Optional | App functionality |
| Device or other IDs → **Device or other IDs** | Expo/FCM push token + device name | Optional (only if notifications are allowed) | App functionality |

**Not collected:** Location; Financial info; Health and fitness; Photos and
videos; Audio; Files and docs; Calendar; Contacts; Web browsing; App info and
performance (no crash logs or diagnostics); Personal info → phone, address,
race/ethnicity, political/religious beliefs, sexual orientation, other info;
App activity → in-app search history (not stored), installed apps, other
actions; Messages → emails, SMS/MMS.

## 6. Store listing (only for a later public release)

Main store listing: short description (≤ 80) `One tap sends your crew a pirate
"Ahoy!" — with a ship's bell.`; full description = the App Store description
(`app-store-connect.md` §3); app icon 512×512, feature graphic 1024×500 and
phone screenshots (`screenshots.md`); category **Social**; contact email; website
`https://<links domain>/`.

## 7. Moving beyond internal testing (not Phase 6)

Closed test with ≥ 12 opted-in testers for 14 consecutive days → apply for
production access in the dashboard → production review. Until then the crew
stays on internal testing (no expiry; updates arrive through the Play Store
like any app).
