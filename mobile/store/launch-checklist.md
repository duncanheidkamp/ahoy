# Launch checklist — Phase 6 definition of done

Two real phones: **A** = you, **B** = a crewmate (ideally one iPhone, one
Android; then swap roles). Both on the **production** builds from TestFlight /
Play internal testing — not dev or preview builds (different APNs environment,
signing key and update channel).

SQL snippets run in Supabase → SQL Editor (as `postgres`, bypasses RLS). Put
the two usernames in the first lines.

## Before you start

- [ ] Backend deployed: `npx supabase db push` (incl. `20261113120000_push_receipts`),
      all functions deployed (`mobile/README.md` → Ship it), secrets set.
- [ ] `links/` deployed with real Team ID, both SHA-256 fingerprints (EAS
      upload key **and** Play app-signing key), `site-config.js` links.
- [ ] B has never had Ahoy installed on this phone (or deleted it), and has
      **no** account yet for steps 1–2 (use a fresh email).

## The seven steps

1. [ ] **Invite → install → sign up.** A: Settings → Invite friends → text the
       link to B. B taps it: the links page shows the TestFlight / Play button
       → installs → opens the link again → app opens on A's invite card → B
       signs up (email, or Apple/Google + pick a username).
2. [ ] **Request push.** B taps "Join crew". Within seconds A's phone (locked)
       shows "@B wants to join your crew"; tapping it opens Requests. A
       accepts → B gets "@A joined your crew".
3. [ ] **Ahoy to a locked phone.** B locks the phone. A taps B's row. B's phone
       plays the **ship's bell** (not the default sound) and shows the title
       "Ahoy!" with body "@A".
4. [ ] **Ahoy back from the lock screen.** B long-presses / expands the
       notification → **Ahoy back!** without unlocking/opening the app. A
       receives "Ahoy!" from @B. Try once with B's app in the background and
       once force-quit (iOS: swipe away; note whether it sends immediately or
       only on next open — both are acceptable, see README "Ahoy back!").
5. [ ] **Counters/badges match the database.** Pull to refresh on both
       phones, then compare with:

       ```sql
       with u as (select id, username from public.users where username in ('A_NAME', 'B_NAME'))
       select s.username as sender, r.username as receiver, count(*) as ahoys,
              (select count(*) from public.ahoys x where x.sender_id = s.id) as sender_lifetime_total
       from public.ahoys a
       join u s on s.id = a.sender_id
       join u r on r.id = a.receiver_id
       group by s.id, s.username, r.username;
       ```
       `ahoys` = the count on the sender's row for that crewmate;
       `sender_lifetime_total` = the badge others see on the sender.
6. [ ] **Block.** B long-presses A → Block. A (without refreshing) taps B's
       row → themed error toast "That sailor isn't in your crew" + error
       haptic; B gets **nothing**. A's crew no longer lists B after refresh.
       Check: `select * from public.friendships f join public.users u on u.id in (f.requester_id, f.addressee_id) where u.username = 'B_NAME';`
       → no row with A. Unblock afterwards from B's Settings if you want to
       keep testing.
7. [ ] **Delete account.** B: Settings → Delete account → type username. B is
       back at sign-in. A's crew no longer shows B (refresh). Check:
       `select count(*) from public.users where username = 'B_NAME';` → 0,
       and `select count(*) from public.push_tokens t left join public.users u on u.id = t.user_id where u.id is null;` → 0.
       Apple sign-in account? The `delete-account` logs show the token
       revocation.

## Device checks carried over from Phases 3–5

Push / notifications (Phase 3)
- [ ] Pre-prompt appears after the first crewmate; "Not now" re-offers ≥ 3 days later
- [ ] Foreground ahoy: in-app banner + sound, no system banner
- [ ] iOS: ahoys from one sender group together; different senders don't
- [ ] Android: channels "Ahoys" (custom sound) and "Crew requests" exist in system settings
- [ ] Android: Ahoy back! with Doze / battery saver on (Samsung or Pixel)
- [ ] Log out → the device stops getting ahoys (its `push_tokens` row is gone); log in as someone else on the same phone → pushes go to the new account only
- [ ] Badge on the iOS icon clears when the app opens

Social (Phase 4)
- [ ] Sign in with Apple (iOS) and Google (both) on the **store/Play-signed** build
- [ ] Social-login account gets "Pick your pirate name"
- [ ] Invite link opens the app directly when installed (universal link / App Link), and the website when not
- [ ] Report → email arrives (or appears in `notify-report` logs)
- [ ] Phrase unlock celebration (temporarily lower a threshold in a test project, or check on a seeded account)

Design (Phase 5)
- [ ] Icon light/dark/tinted, Android themed icon, splash in both appearances
- [ ] Largest text size on every screen; Reduce Motion
- [ ] Status-bar anchor icon on Android

Ship (Phase 6)
- [ ] TestFlight build shows no export-compliance question
- [ ] An OTA update reaches the store build: change a string, `npx eas-cli@latest update --channel production --message "test"`, cold-start twice → new string
- [ ] ~30–60 min after sending to an uninstalled app: its token disappears (prune job). Check `select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'prune-push-receipts') order by start_time desc limit 5;` and the function's logs.

## Crew migration status

Who still hasn't got the native app working (no iOS/Android token):

```sql
select u.username, u.created_at
from public.users u
where u.username is not null
  and not exists (
    select 1 from public.push_tokens t
    where t.user_id = u.id and t.platform in ('ios', 'android')
  )
order by u.username;
```

Done when this returns no crew member (test/demo accounts aside) **and** each
has received at least one Ahoy on the app:

```sql
select u.username, max(a.created_at) as last_ahoy_received
from public.users u
left join public.ahoys a on a.receiver_id = u.id
  and a.created_at > (select min(t.created_at) from public.push_tokens t
                      where t.user_id = u.id and t.platform in ('ios', 'android'))
where u.username is not null
group by u.username
order by last_ahoy_received nulls first;
```
(`null` = no Ahoy received since their first native token.) These were the
preconditions for retiring the PWA (done: migration
`20261120120000_retire_pwa_push`).
