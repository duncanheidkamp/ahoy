# Ahoy - CLAUDE.md

## Overview

**Ahoy** is a nautical-themed clone of the "Yo" app - a radically simple messaging app where users send a single "Ahoy" notification to friends with one tap.

## Tech Stack

- **Framework**: Next.js 16 (App Router) — the PWA
- **Auth & Database**: Supabase (Auth + Postgres), schema managed as migrations in `supabase/migrations/`
- **Server logic**: Postgres functions (security definer) + Supabase Edge Functions (Deno) in `supabase/functions/`
- **Push Notifications**: Expo Push API for native apps (`push_tokens`), Firebase Cloud Messaging for the legacy PWA (`users.fcm_token`)
- **Styling**: Tailwind CSS
- **Hosting**: Prepared for Vercel deployment

## Getting Started

### 1. Install Dependencies
```bash
cd ahoy
npm install
```

### 2. Set Up Supabase

The schema is defined by the migrations in `supabase/migrations/` — never edit
the database by hand in the dashboard. `database-schema.sql` is only a pointer.

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
npx supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)" EXPO_ACCESS_TOKEN=...
```

New schema change: `npx supabase migration new <name>`, write SQL, `db reset`
locally, run the RLS tests, then update `lib/supabase/types.ts`
(`npx supabase gen types typescript --local`, then restore the helper types at
the bottom of the file).

### 3. Set Up Firebase

1. Create a project at [Firebase Console](https://console.firebase.google.com)
2. Enable Cloud Messaging
3. Generate a web push certificate (VAPID key)
4. Get your server key from Project Settings > Cloud Messaging

### 4. Configure Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
FIREBASE_CLIENT_EMAIL=service-account@your_project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
# Optional: only if Expo "enhanced push security" is turned on
EXPO_ACCESS_TOKEN=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run the App
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
ahoy/
├── app/
│   ├── (auth)/           # Auth pages (login, signup)
│   │   ├── login/
│   │   └── signup/
│   ├── api/              # API routes
│   │   ├── ahoys/send/   # PWA send path: record_ahoy() + FCM/Expo push
│   │   ├── feedback/
│   │   └── users/fcm-token/
│   ├── dashboard/        # Main friends list
│   ├── requests/         # Friend requests
│   ├── search/           # Find users
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── ui/               # Reusable UI components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   └── card.tsx
│   ├── friends/          # Friend-related components
│   │   ├── friend-card.tsx
│   │   └── friend-list.tsx
│   ├── notifications/    # Push notification components
│   │   ├── notification-prompt.tsx
│   │   └── service-worker-register.tsx
│   └── navigation.tsx
├── lib/
│   ├── supabase/         # Supabase client config
│   │   ├── client.ts
│   │   ├── server.ts
│   │   ├── middleware.ts
│   │   └── types.ts
│   ├── firebase/         # Firebase config (PWA web push)
│   │   ├── admin.ts
│   │   ├── config.ts
│   │   └── notifications.ts
│   ├── push/expo.ts      # Expo Push API client (Node)
│   └── utils/
│       └── index.ts
├── public/
│   ├── icons/            # PWA icons
│   ├── manifest.json     # PWA manifest
│   ├── sw.js            # Service worker
│   ├── firebase-messaging-sw.js
│   └── offline.html
├── supabase/
│   ├── config.toml
│   ├── migrations/       # THE schema — one file per change
│   ├── functions/        # Edge Functions (Deno): send-ahoy, delete-account
│   └── tests/            # rls_test.sql + plain-postgres stub
├── database-schema.sql   # Pointer to supabase/migrations
├── proxy.ts              # Auth proxy (Next 16 middleware)
└── .env.local.example
```

## Database Schema

Source of truth: `supabase/migrations/`. Summary:

| Table | Notes |
|-------|-------|
| users | id (= auth.users.id), username, created_at are readable by signed-in users. `fcm_token` and `active_phrase_id` are private (column privileges) — **never `select('*')` on users**; use `PUBLIC_USER_COLUMNS` / `get_my_profile()`. Rows are created only by the `on_auth_user_created` trigger from `signUp({ options: { data: { username } } })`. |
| friendships | requester inserts `pending` only; addressee moves pending→accepted/declined or declined→accepted; either deletes, except the requester can't delete a declined row (so it can't be re-sent). One row per unordered pair. |
| blocks | blocker-only RLS. A block removes any friendship and refuses new requests and sends in both directions. |
| ahoys | **no client writes.** Inserted only by `record_ahoy()` (service role). `phrase` is the sender's server-side active phrase. `receiver_id` becomes null if the receiver deletes their account. |
| phrases | id, text, unlock_at, secret, sort. Secret phrases are hidden until unlocked. |
| push_tokens | per-device tokens (ios/android = Expo, web = FCM), owner-only. Register with `register_push_token()`. |
| feedback | in-app feedback, insert-own. |

Key functions (all `security definer`, `search_path = ''`):

| Function | Who | Purpose |
|----------|-----|---------|
| `record_ahoy(sender, receiver)` | service_role | friendship + block + 30/min rate limit + phrase check, then insert. Returns `ok/reason/phrase/sender_username`. |
| `get_my_stats()` | authenticated | `{ total_sent, per_friend: { id: n } }` |
| `get_friend_badges()` | authenticated | accepted friends with each friend's lifetime total |
| `search_users(q)` | authenticated | username search with totals, hides blocks |
| `get_my_profile()` / `get_my_phrases()` / `set_active_phrase(id)` | authenticated | own profile + phrase picker |
| `username_available(name)` | anon | signup check |

## Edge Functions

- `send-ahoy` — `POST { receiver_id }` with the user's JWT. Calls `record_ahoy()`, then pushes to every receiver device via Expo (title = phrase, body = `@username`, `categoryId: 'ahoy'`, `channelId: 'ahoy-v1'`, `sound: 'ahoy.wav'`) and to the legacy FCM web token (needs `FCM_SERVICE_ACCOUNT` secret). Deletes tokens reported `DeviceNotRegistered`/`UNREGISTERED`. Errors: 401, 400, 403 `not_friends`, 429 `rate_limited`.
- `delete-account` — `POST` with the user's JWT; deletes the auth user, schema cascades the rest.

The PWA still sends through `app/api/ahoys/send` (same `record_ahoy()` rules, firebase-admin for FCM + Expo for native receivers).

## Core Features

### Authentication
- Email/password signup with username selection
- Username validation (lowercase, 3-20 chars, alphanumeric + underscores)
- Session management via Supabase Auth

### Friends System
- Search users by username
- Send/accept/decline friend requests
- Copy shareable invite link

### Ahoy Sending
- One-tap send from friends list
- Records ahoy in database (for future unlockables)
- Sends push notification via FCM
- Visual feedback animation

### Push Notifications
- Permission prompt on first dashboard visit
- Background message handling
- "Ahoy back" action button in notification

### PWA
- Installable on mobile home screens
- Offline support with cached pages
- App-like standalone mode

## Design System

### Colors
- **Ocean**: #0c4a6e, #0369a1
- **Teal**: #0d9488, #14b8a6
- **Wood**: #78350f, #92400e
- **Brass/Gold**: #d97706, #f59e0b
- **Parchment**: #fef3c7, #fffbeb

### Typography
- Headers: Georgia, serif
- Body: Geist (system-ui fallback)

## Future Features (Architected For)

### Unlockable Phrases
Implemented server-side — see the `phrases` table (seeded in
`20261110180400_phrases.sql`). Ahoy! (0), Arrrggggg Matey! (500), Yo! (1000,
secret), then Ope!, You betcha!, Avast!, Land ho!, Yarr, she blows! at
placeholder thresholds. Change thresholds with a new migration.

### Sound Effects
Space for pirate voice clips on send/receive.

### Native Apps
Native clients talk to Supabase directly (RLS + RPCs above) and send via the
`send-ahoy` Edge Function.

The Expo app lives in `mobile/` (SDK 58, Expo Router, TanStack Query,
development build via `expo-dev-client`). It has its own package.json and
lint/test setup — see `mobile/README.md`; the root tsconfig/eslint exclude it.
`mobile/lib/types.ts` is a copy of `lib/supabase/types.ts`: update both on a
schema change. Colors/type live only in `mobile/theme.ts`.

## Deployment

### Vercel
1. Connect GitHub repo to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy

### Manual Build
```bash
npm run build
npm start
```

## Troubleshooting

### Push notifications not working
1. Check the Firebase service account env vars (PWA) / `FCM_SERVICE_ACCOUNT` secret (Edge Function)
2. Ensure user has granted notification permission
3. Check browser console for FCM errors

### Auth redirects not working
1. Verify Supabase URL and keys
2. Check proxy.ts is configured correctly

### Database errors
1. Ensure all migrations are applied (`npx supabase migration list`)
2. Check RLS policies allow the operation
3. "permission denied for table users" means something selected a private column (or `*`) on users
