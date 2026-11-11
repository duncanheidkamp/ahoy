# Ahoy

A pirate-themed Yo clone: one tap sends a friend an "Ahoy!" — a push
notification with a ship's bell, and "Ahoy back!" right from the lock screen.

| Part | Where | Runs on |
|---|---|---|
| **Native app** (iOS + Android, Expo SDK 58) | [`mobile/`](mobile/) | TestFlight / Google Play internal testing, built with EAS |
| **Backend**: Postgres schema, RLS, RPCs | [`supabase/migrations/`](supabase/migrations/) (source of truth) | Supabase |
| **Edge Functions**: `send-ahoy`, `notify-friendship`, `notify-report`, `delete-account`, `prune-push-receipts` | [`supabase/functions/`](supabase/functions/) | Supabase (Deno) |
| **Links site**: invite links `/add/<name>`, universal/App Links files, install page, `/privacy`, `/support` | [`links/`](links/) | its own Vercel project, root `links/` |
| **Old PWA domain**: "Ahoy moved to the app" page + self-unregistering service workers | [`site/`](site/), built by `scripts/build-site.sh` (root `vercel.json`) | the original PWA Vercel project |

The Next.js PWA was retired in Phase 6; its accounts live on in the same
Supabase project and log in to the app unchanged.

## Quick start

```bash
# Backend (Docker): local Postgres/Auth/API + all migrations
npx supabase start && npx supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
deno test --config supabase/functions/_tests/deno.json --allow-env supabase/functions/_tests

# App (development build on a real phone; see mobile/README.md)
cd mobile && cp .env.example .env && npm install
npm test && npm run typecheck && npm run lint
npx expo start
```

No Docker? The RLS checks also run on a plain Postgres 15+ — see the header of
`supabase/tests/plain-postgres-stub.sql`.

## Docs

- [`mobile/README.md`](mobile/README.md) — app setup, push, social login,
  invite links, design, and **Ship it** (TestFlight / Play steps in order).
- [`mobile/store/`](mobile/store/) — App Store Connect and Play Console
  answers, screenshots, the crew invite message, the launch checklist.
- [`CLAUDE.md`](CLAUDE.md) — schema, RPCs, Edge Functions, environment
  variables, conventions.
- [`links/README.md`](links/README.md) — the links site.
