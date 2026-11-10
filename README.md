# Ahoy

A pirate-themed Yo clone: one tap sends a friend an "Ahoy!".

- `app/`, `components/`, `lib/` — the Next.js 16 PWA
- `supabase/migrations/` — the database schema (source of truth)
- `supabase/functions/` — Edge Functions (`send-ahoy`, `delete-account`)
- `supabase/tests/rls_test.sql` — security checks for the schema

```bash
npm install
npx supabase start && npx supabase db reset   # local database
npm run dev
```

See [CLAUDE.md](./CLAUDE.md) for setup, schema, environment variables and deployment.
