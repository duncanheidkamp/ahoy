# App Store Connect — Ahoy

Everything to paste into App Store Connect (ASC) for **TestFlight** now and a
public listing later. `<links domain>` = the value of `EXPO_PUBLIC_LINKS_DOMAIN`
(e.g. `ahoy.duncanheidkamp.com`). Field limits are Apple's.

Phase 6 only needs TestFlight. TestFlight needs: the app record, Test
Information (below), export compliance (already answered in the binary) and,
for the **external** group, one Beta App Review. Screenshots, the App Privacy
label and age rating are only enforced when you submit for the public App
Store, but fill them in now while the facts are fresh.

## 1. Create the app record

ASC → Apps → **+** → New App

| Field | Value |
|---|---|
| Platforms | iOS |
| Name (≤ 30) | `Ahoy!` — if taken: `Ahoy! Pirate Hail` |
| Primary language | English (U.S.) |
| Bundle ID | `com.duncanheidkamp.ahoy` (register it first in developer.apple.com → Identifiers if it isn't listed; the first `eas build` also does this) |
| SKU | `ahoy-ios` |
| User access | Full access |

Then copy **App Information → Apple ID** (digits) into `mobile/eas.json` →
`submit.production.ios.ascAppId`, and your Team ID (developer.apple.com →
Membership) into `appleTeamId`.

## 2. App Information

| Field | Value |
|---|---|
| Subtitle (≤ 30) | `One tap. One Ahoy.` |
| Category | Primary **Social Networking**; secondary none (or Entertainment) |
| Content rights | Does not contain, show or access third-party content |
| Age rating | See §6 |
| License agreement | **Apple's standard EULA** (leave as is). Same URL the app links to: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/ |
| Privacy Policy URL | `https://<links domain>/privacy` |

## 3. Version page (public listing — fill now, used later)

**Promotional text (≤ 170)**

> Send your crew an "Ahoy!" with one tap. No typing, no feeds, no fuss — just a pirate hail and a ship's bell on their lock screen.

**Description (≤ 4000)**

> Ahoy! is the simplest way to say "thinking of you, matey."
>
> Tap a crewmate's name and they get an "Ahoy!" on their phone — with a proper ship's bell. That's it. No messages to write, no feed to scroll, no read receipts to worry about.
>
> • One tap sends an Ahoy. They can tap "Ahoy back!" right from the lock screen.
> • Build your crew with an invite link or by searching for a pirate name.
> • Every Ahoy counts. Send enough and you unlock new hails — "Arrrggggg Matey!" and a few secret ones.
> • Light and dark looks, big-text friendly, and Reduce Motion aware.
> • You're in charge: remove, block or report anyone, and delete your account any time from Settings.
>
> No ads. No tracking. No analytics.

**Keywords (≤ 100, comma-separated, no spaces needed)**

```
pirate,yo,hello,hi,poke,nudge,friends,notification,one tap,crew,hail,ping,wave
```

| Field | Value |
|---|---|
| Support URL | `https://<links domain>/support` |
| Marketing URL | `https://<links domain>/` |
| Copyright | `2026 Duncan Heidkamp` |
| Version | `1.0.0` (must match `APP_VERSION` in `app.config.ts`) |
| Screenshots | `screenshots.md` |
| Sign-in required | Yes — see §5 |

## 4. TestFlight

### Test Information (TestFlight → Test Information; needed before external testing)

| Field | Value |
|---|---|
| Beta App Description | `Ahoy! sends a friend a one-tap "Ahoy!" push notification with a ship's-bell sound. This beta is for a small group of friends moving over from the Ahoy web app.` |
| Feedback Email | your email (TestFlight shows it to testers) |
| Marketing URL | `https://<links domain>/` |
| Privacy Policy URL | `https://<links domain>/privacy` |
| Beta App Review sign-in | demo account from §5 |
| Contact info | your name, phone, email (Apple only) |

### "What to Test" (per build, ≤ 4000)

> Welcome aboard! Please try:
> 1. Log in with the same email you used on the Ahoy website (or sign up / use Apple or Google).
> 2. Allow notifications when asked.
> 3. Tap a crewmate's name to send an Ahoy. Lock your phone and ask them to send one back — you should hear the ship's bell and see "Ahoy!".
> 4. On the lock-screen notification, long-press (or swipe) and tap "Ahoy back!".
> 5. Share your invite link (Settings → Invite friends) with someone who isn't on Ahoy yet.
> Anything odd? Settings → "Send the crew a message", or TestFlight → Send Beta Feedback (screenshot + shake works too).

### Groups — recommendation

- **External group "Crew" with a Public Link** (recommended). Friends don't
  need to be on your App Store Connect team; you text them the link. The first
  build of each version goes through Beta App Review (usually under a day);
  later builds of the same version usually don't. Optionally set the link's
  tester limit to ~15.
- *Internal testers* (no review) only works for people you add as users of
  your ASC team — fine for you and a second test device, awkward for friends.

Optional: put the group name in `eas.json` → `submit.production.ios.groups:
["Crew"]` so `eas submit` adds each build to it.

### Beta App Review notes (Test Information → Review notes)

> Ahoy! is a one-tap greeting app: tapping a friend's name sends them a push notification saying "Ahoy!" (or an unlocked variant). There is no free-text messaging between users.
>
> Demo account (email sign-in): appreview@<your domain> / <password>. It is already in a crew with "ahoy_firstmate", so the Crew list shows one friend: tap the row to send an Ahoy. Allow notifications to receive one back (the developer can send one on request; contact info above).
>
> Safety (guideline 1.2): long-press a crewmate → Remove, Block or Report. Reports are emailed to the developer and reviewed within 24 hours. Blocks hide users from each other in both directions.
>
> Account deletion (5.1.1(v)): Settings → Delete account → type the username. Sign in with Apple tokens are revoked on deletion.
>
> Sign in with Apple and Google are offered on iOS; email/password also works. Encryption: standard HTTPS only (ITSAppUsesNonExemptEncryption = NO).

**Demo account — Duncan creates it before the first external build:**

1. In the app (any build) sign up `appreview@<your domain>` (use a mailbox you
   control or a `+review` alias), username `appreview`, a strong password.
2. Sign up a second account, username `ahoy_firstmate`, on another device or
   after logging out.
3. From `appreview`, add `ahoy_firstmate`; accept it from `ahoy_firstmate`.
4. Put the `appreview` credentials in Test Information → Sign-in information
   (and later in App Review Information for the public submission).
5. Keep both accounts; don't delete them between reviews.

### Export compliance

Answered in the binary (`ITSAppUsesNonExemptEncryption = false` in
`app.config.ts`): Ahoy only uses HTTPS via the OS. TestFlight won't ask per
build. If ASC ever does ask: "None of the algorithms mentioned above" / exempt.

## 5. App Review Information (public submission later)

Same demo account and notes as §4. "Sign-in required": Yes.

## 6. Age rating questionnaire

Apple revised the questionnaire in 2025 (new 13+/16+/18+ tiers, questions on
user-generated content, messaging and age assurance). Answer by the facts
below; wording in ASC may differ slightly — if a question isn't listed here,
the honest answer is **None / No**.

| Topic | Answer | Why |
|---|---|---|
| Violence, horror, mature/suggestive themes, profanity or crude humor, sexual content, nudity | None | Pirate-flavoured greetings only |
| Alcohol, tobacco, drugs; simulated gambling; contests | None | |
| Medical / treatment info | None | |
| Unrestricted web access | No | No in-app browser |
| Gambling / loot boxes | No | |
| User-generated content | **Yes** | Usernames are chosen by users and visible to others |
| Messaging / chat between users | **Yes** (limited) | Users send each other predefined greetings; no free text, images or voice |
| Moderation tools (report/block) | Yes | Long-press → Block / Report |
| Age assurance / parental controls | No | |
| Advertising | No | |
| Made for Kids | No | |

Expected result: **13+** (consistent with the privacy policy: not directed to
children under 13). If ASC computes 9+ that's also fine; don't tick Kids.

## 7. App Privacy ("nutrition label")

Derived from `supabase/migrations/` (tables `auth.users`, `users`, `ahoys`,
`friendships`, `blocks`, `push_tokens`, `push_tickets`, `feedback`, `reports`)
and the app code. Nothing is used for tracking; there are no analytics, ads or
crash-reporting SDKs. Processors (Supabase, Expo, APNs/FCM, Resend) act on our
behalf, which Apple does not count as "third-party" use.

ASC → App Privacy → Get Started → **Yes, we collect data**. For every type
below: **Linked to the user: Yes**, **Used for tracking: No**.

| Apple category → type | What exactly | Where | Purpose |
|---|---|---|---|
| Contact Info → **Email Address** | Account email (Apple relay address for Hide My Email) | `auth.users.email` | App Functionality |
| Contact Info → **Name** | Only with Google sign-in: Google's ID token carries name + photo URL, which Supabase Auth stores in `auth.users.raw_user_meta_data`. Apple sign-in requests email only. Not shown in the app. | `auth.users` | App Functionality |
| Identifiers → **User ID** | Account UUID and username (visible to other users) | `users.id`, `users.username` | App Functionality |
| Identifiers → **Device ID** | Expo push token + reported device name, per device | `push_tokens` (+ `push_tickets` ≤ 24 h) | App Functionality |
| Usage Data → **Product Interaction** | Each Ahoy: sender, receiver, phrase, time → counts, badges, unlocks | `ahoys` | App Functionality |
| User Content → **Customer Support** | Feedback text + app version/platform | `feedback` | App Functionality |
| User Content → **Other User Content** | Reports (who, optional note ≤ 500 chars); usernames | `reports`, `users` | App Functionality |
| Other Data → **Other Data Types** | Crew connections (requests, accepted, declined) and blocks | `friendships`, `blocks`, `friendship_notifications` | App Functionality |

**Not collected** (answer "No" / leave unticked): Phone number, physical
address, other contact info; Health & Fitness; Financial info; Location
(precise or coarse); Sensitive info; Contacts (address book — the crew is not
your phone's contacts); Emails or text messages; Photos or videos; Audio;
Gameplay content; Browsing history; Search history (username searches are
answered, not stored); Purchases; Advertising data; Other usage data; Crash
data; Performance data; Other diagnostic data.

Notes:
- Supabase keeps short-lived auth/security server logs (with IP addresses).
  Ahoy doesn't read or use them and Apple has no IP-address data type, so
  they're not declared; the privacy policy mentions them.
- Username search queries reach the server only to answer the search
  (`search_users`) and aren't stored, so Search History is "not collected".
- If anything new is stored (e.g. a crash reporter), update this table, the
  Play Data safety form (`google-play.md`) and `links/privacy.html` together.
