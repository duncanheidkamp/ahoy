# Ahoy - CLAUDE.md

## Overview

**Ahoy** is a nautical-themed clone of the "Yo" app - a radically simple messaging app where users send a single "Ahoy" notification to friends with one tap.

## Tech Stack

- **App**: Expo SDK 58 (React Native, Expo Router, TanStack Query) in `mobile/` — iOS + Android, built and shipped with EAS (TestFlight / Google Play internal testing)
- **Auth & Database**: Supabase (Auth + Postgres), schema managed as migrations in `supabase/migrations/`
- **Server logic**: Postgres functions (security definer) + Supabase Edge Functions (Deno) in `supabase/functions/`
- **Push Notifications**: Expo Push API (`push_tokens`, ios/android only); Expo delivers through APNs / FCM with the credentials stored in EAS
- **Links site**: static `links/` (invite links, universal/App Links files, install, privacy, support) — its own Vercel project
- **Old PWA domain**: static "moved to the app" page from `site/` (built by `scripts/build-site.sh`, root `vercel.json`); the Next.js PWA was retired in Phase 6

## Getting Started

### 1. Supabase

The schema is defined by the migrations in `supabase/migrations/` — never edit
the database by hand in the dashboard.

Local stack (Docker required):
```bash
npx supabase start          # local Postgres/Auth/API on 127.0.0.1:54321
npx supabase db reset       # apply every migration from scratch
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql   # RLS/security checks
npx supabase functions serve  # run Edge Functions locally
```

Without Docker, the RLS checks also run on any plain Postgres 15+ via
`supabase/tests/plain-postgres-stub.sql` (see the header of that file).

Remote project:
```bash
npx supabase link --project-ref <ref>
npx supabase db push                     # apply new migrations
npx supabase functions deploy send-ahoy
npx supabase functions deploy delete-account
npx supabase functions deploy notify-friendship
npx supabase functions deploy notify-report
npx supabase functions deploy prune-push-receipts   # + Vault secrets, see mobile/README.md -> Ship it
npx supabase secrets set EXPO_ACCESS_TOKEN=... PRUNE_RECEIPTS_SECRET=...
```

New schema change: `npx supabase migration new <name>`, write SQL, `db reset`
locally, run the RLS tests, then update `mobile/lib/types.ts` (hand-maintained;
compare with `npx supabase gen types typescript --local`, keep the helper types
at the bottom of the file).

### 2. App

```bash
cd mobile && cp .env.example .env && npm install
npm test && npm run typecheck && npm run lint
npx expo start      # development build on a real device, see mobile/README.md
```

Environment variables, push credentials, social login and invite-link setup:
`mobile/README.md`. Store submission: `mobile/README.md` → Ship it and
`mobile/store/`.

## Project Structure

```
ahoy/
├── mobile/               # Expo app (own package.json, lint, jest) — see mobile/README.md
│   ├── app/              # Expo Router routes
│   ├── components/  lib/  theme.ts
│   ├── app.config.ts     # native config (privacy manifest, permissions, updates)
│   ├── eas.json          # build / submit / update channels
│   └── store/            # App Store Connect + Play answers, crew invite, launch checklist
├── supabase/
│   ├── config.toml
│   ├── migrations/       # THE schema — one file per change
│   ├── functions/        # Edge Functions (Deno): send-ahoy, notify-friendship, notify-report, delete-account, prune-push-receipts; _tests/
│   └── tests/            # rls_test.sql + plain-postgres stub
├── links/                # Static site for the links domain: /, /add/<username>, AASA, assetlinks, /privacy, /support (own Vercel project)
├── site/                 # "Ahoy moved to the app" page + self-unregistering sw.js / firebase-messaging-sw.js for the old PWA domain
├── scripts/build-site.sh # site/ + links/{privacy,support,style,site-config} -> dist/
└── vercel.json           # old PWA Vercel project: static, no install, builds dist/
```

## Database Schema

Source of truth: `supabase/migrations/`. Summary:

| Table | Notes |
|-------|-------|
| users | id (= auth.users.id), username, created_at are readable by signed-in users. `active_phrase_id` is private (column privileges) — **never `select('*')` on users**; use `PUBLIC_USER_COLUMNS` (`mobile/lib/types.ts`) / `get_my_profile()`. Nothing is client-updatable. Rows are created only by the `on_auth_user_created` trigger: email signups need `signUp({ options: { data: { username } } })`; OAuth signups (Apple/Google) get `username` NULL until `claim_username()`. NULL-username rows are invisible to other users and can't request/send. |
| friendships | requester inserts `pending` only; addressee moves pending→accepted/declined or declined→accepted; either deletes, except the requester can't delete a declined row (so it can't be re-sent). One row per unordered pair. |
| blocks | blocker-only RLS. A block removes any friendship and refuses new requests and sends in both directions. |
| ahoys | **no client writes.** Inserted only by `record_ahoy()` (service role). `phrase` is the sender's server-side active phrase. `receiver_id` becomes null if the receiver deletes their account. |
| phrases | id, text, unlock_at, secret, sort. Secret phrases are hidden until unlocked. |
| push_tokens | per-device Expo tokens, platform `ios`/`android` only, owner-only. Register with `register_push_token()`. |
| push_tickets | Expo ok-ticket ids (ticket_id, token → push_tokens on delete cascade, created_at) awaiting a receipts check; **service role only**, purged after 24 h. Written by send-ahoy / notify-friendship. |
| feedback | in-app feedback, insert-own (`user_id` defaults to `auth.uid()`). |
| reports | insert-own (`id, reported_id, note` only), **no client select**; note ≤ 500, 10/day per reporter. Emailed by `notify-report`. |
| friendship_notifications | log of friend-request/accepted pushes; **no client access**. Written only by `claim_friendship_notification()`. |

Key functions (all `security definer`, `search_path = ''`):

| Function | Who | Purpose |
|----------|-----|---------|
| `record_ahoy(sender, receiver)` | service_role | friendship + block + 30/min rate limit + phrase check, then insert. Returns `ok/reason/phrase/sender_username`. |
| `get_my_stats()` | authenticated | `{ total_sent, per_friend: { id: n } }` |
| `get_friend_badges()` | authenticated | accepted friends with each friend's lifetime total |
| `search_users(q)` | authenticated | username search with totals, hides blocks |
| `get_my_profile()` / `get_my_phrases()` / `set_active_phrase(id)` | authenticated | own profile + phrase picker |
| `register_push_token(token, platform, device_name)` | authenticated | upsert this device's token (re-assigns a token that moved accounts) |
| `username_available(name)` | anon | signup check |
| `claim_username(name)` | authenticated | social-login accounts set their username once (only while NULL) |
| `get_user_card(name)` | authenticated | invite-link lookup: user + total + `relation` (`self/crew/requested/incoming/blocked/none`); blocked-by-them = no row, declined = `requested` |
| `claim_report_notification(caller, report)` | service_role | hands a report to `notify-report` once, only to its reporter |
| `claim_friendship_notification(caller, friendship)` | service_role | decides from the row's current state whether a friend push is due (pending+requester → `request` to addressee; accepted+addressee → `accepted` to requester); once per row+kind, 24h per-pair cooldown, 20 requests/h per requester, no push across blocks |
| `run_push_receipt_pruning()` | postgres (pg_cron, every 30 min) | purges >24 h tickets; if Vault has `project_url` + `prune_receipts_secret` and tickets are ≥15 min old, POSTs to `prune-push-receipts` via pg_net |

## Edge Functions

- `send-ahoy` — `POST { receiver_id }` with the user's JWT. Calls `record_ahoy()`, then pushes to every receiver device via Expo (title = phrase, body = `@username`, `categoryId: 'ahoy'`, `channelId: 'ahoy-v1'`, `sound: 'ahoy.wav'`, `threadId: 'ahoy-<senderId>'`, `data: { type: 'ahoy', senderId, senderUsername }`, no badge/collapseId). Stores ok tickets in `push_tickets`; deletes tokens reported `DeviceNotRegistered`. Errors: 401, 400, 403 `not_friends`, 429 `rate_limited`.
- `notify-friendship` — `POST { friendship_id }` with the user's JWT, called by the native app after creating or accepting a request. `claim_friendship_notification()` decides; pushes "@x wants to join your crew" (`data.type: 'friend_request'`) or "@x joined your crew" (`'friend_accepted'`) on channel `requests-v1`. Repeats are 200 no-ops.
- `notify-report` — `POST { report_id }` with the user's JWT after filing a report; emails it via Resend if `RESEND_API_KEY`, `REPORT_EMAIL_TO`, `REPORT_EMAIL_FROM` are set, else logs.
- `prune-push-receipts` — `POST` from pg_cron/pg_net only, header `x-cron-secret` = `PRUNE_RECEIPTS_SECRET` (`verify_jwt = false` in config.toml). Fetches Expo receipts for due `push_tickets` in batches of ≤ 1000, deletes `DeviceNotRegistered` tokens, forgets tickets that have a receipt.
- `delete-account` — `POST` (optional `{ apple_authorization_code }`) with the user's JWT; revokes Sign in with Apple tokens if `APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_CLIENT_ID/APPLE_PRIVATE_KEY` are set, then deletes the auth user; schema cascades the rest.

Tests (mocked fetch / injected deps): `deno test --config supabase/functions/_tests/deno.json --allow-env supabase/functions/_tests`.

## App notes

Native clients talk to Supabase directly (RLS + RPCs above) and send via the
`send-ahoy` Edge Function. `mobile/lib/types.ts` is the only copy of the
database types. Colors/type live only in `mobile/theme.ts` (design system:
ocean `#0c4a6e`/`#0369a1`, teal, wood, brass `#f59e0b`, parchment `#fef3c7`;
Pirata One for titles).

Push (Phase 3) lives in `mobile/lib/push/`; setup, credentials, per-platform
"Ahoy back!" behavior and how to replace the placeholder `ahoy.wav` are in
`mobile/README.md` → Push notifications. Channel ids / category / sound names
are duplicated in `mobile/lib/push/constants.ts` and
`supabase/functions/_shared/push.ts` — change together.

Social (Phase 4): Sign in with Apple (iOS only) / Google, username picker for
social accounts, invite links (`EXPO_PUBLIC_LINKS_DOMAIN`, `app/add/[username]`,
`links/`), phrase unlocks, block/remove/report, account deletion, feedback —
setup and decisions in `mobile/README.md` → Social features.

Ship (Phase 6): `eas.json` profiles (development / preview / production) with
EAS Update channels, `runtimeVersion` policy `appVersion` (bump `version` in
`mobile/app.config.ts` on any native change), store hygiene in
`app.config.ts` (no iOS background modes, privacy manifest, blocked Android
permissions), store paperwork + crew invite + launch checklist in
`mobile/store/`. Steps: `mobile/README.md` → Ship it.

Unlockable phrases: server-side `phrases` table (seeded in
`20261110180400_phrases.sql`). Ahoy! (0), Arrrggggg Matey! (500), Yo! (1000,
secret), then Ope!, You betcha!, Avast!, Land ho!, Yarr, she blows! at
placeholder thresholds. Change thresholds with a new migration.

## Deployment

- **Backend**: `npx supabase db push` + `functions deploy` (above).
- **App**: EAS — `mobile/README.md` → Ship it.
- **links/**: Vercel project with Root Directory `links`, framework Other, no build.
- **Old PWA domain**: the original Vercel project (repo root). `vercel.json`
  makes it static: no install, `sh scripts/build-site.sh`, output `dist/`.
  Check locally with `sh scripts/build-site.sh && ls dist`.

## Troubleshooting

### Push notifications not working
1. The device has a `push_tokens` row (`ios`/`android`) for the user — it is registered on every app start while permission is granted
2. iOS: APNs key in EAS credentials; Android: FCM V1 service-account key in EAS credentials (`mobile/README.md` → Push notifications)
3. `send-ahoy` logs (Supabase → Edge Functions) show Expo ticket errors

### Database errors
1. Ensure all migrations are applied (`npx supabase migration list`)
2. Check RLS policies allow the operation
3. "permission denied for table users" means something selected a private column (or `*`) on users
