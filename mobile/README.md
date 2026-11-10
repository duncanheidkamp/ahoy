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

Layout: `app/` routes (Expo Router; `(auth)` and `(app)` groups behind an auth
gate in `app/_layout.tsx`), `components/`, `lib/` (Supabase client, TanStack
Query hooks in `lib/queries.ts`, pure logic), `theme.ts` (all colors/type).
`lib/types.ts` is a copy of `../lib/supabase/types.ts` — keep them in sync.
