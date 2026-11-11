# Crew invite — the message to send

Fill in the two links, then send the matching message. Android friends first
need to send you the **Google account email** their phone's Play Store uses
(add it to the Play Console "Crew" tester list before sending the link).

- `<TESTFLIGHT_LINK>` = TestFlight → your external group "Crew" → Public Link
  (`https://testflight.apple.com/join/…`)
- `<PLAY_LINK>` = Play Console → Testing → Internal testing → Testers → "Copy link"
- `<SITE>` = `https://<links domain>/` (shows both links once they're in
  `links/site-config.js`)

## iPhone

> Ahoy, matey! 🏴‍☠️ Ahoy is now a real iPhone app (beta, just for us).
>
> 1. Install Apple's **TestFlight** app from the App Store.
> 2. Open this link on your iPhone and tap **Accept → Install**: <TESTFLIGHT_LINK>
> 3. Open Ahoy and **log in with the same email and password** you used on the Ahoy website — your crew and your Ahoy count come with you. (New? Sign up, or use Apple/Google.)
> 4. Tap **Allow** when it asks about notifications — that's the whole point!
> 5. Send me an Ahoy to test it. Lock your phone and I'll send one back.
>
> Once it works you can delete the old Ahoy icon from your home screen.

## Android

> Ahoy, matey! 🏴‍☠️ Ahoy is now a real Android app (private test, just for us).
>
> 1. Open this link on your phone, signed in to the Google account you gave me: <PLAY_LINK>
> 2. Tap **Accept invite / Become a tester**, then **Download it on Google Play** and install.
> 3. Open Ahoy and **log in with the same email and password** you used on the Ahoy website — your crew and your Ahoy count come with you. (New? Sign up or use Google.)
> 4. Tap **Allow** for notifications.
> 5. Send me an Ahoy to test it. Lock your phone and I'll send one back.
>
> Once it works you can remove the old Ahoy shortcut from your home screen.

## Short version (group text)

> Ahoy is a real app now! iPhone: get TestFlight, then <TESTFLIGHT_LINK>. Android: <PLAY_LINK> (send me your Google email first). Log in with your same email + password, allow notifications, and send me an Ahoy. ⚓

## Troubleshooting (for you, when someone texts back)

| Symptom | Fix |
|---|---|
| iPhone: "This beta isn't accepting new testers" / link dead | Public link disabled or tester limit hit: TestFlight → group → Public Link → enable / raise the limit. Build expired (90 days)? Upload a new one. |
| iPhone: "Requires TestFlight" or nothing happens | Install TestFlight first, then reopen the link in Safari. |
| Android: "App not available" / "You're not a tester" | Their Play Store account isn't the email on the Crew list (Play Store → profile → switch account), or they haven't tapped *Become a tester*. The link can take a few hours after the very first release. |
| "Invalid login" with their old password | Same Supabase project, so old accounts work. Check they're using the email they signed up with on the website. Forgot it? Supabase dashboard → Authentication → Users → their row → *Send password recovery*. |
| Logged in but crew is empty | They made a new account (e.g. used Apple "Hide My Email" or a different Google account). Log out → log in with the original email; delete the stray account later (Supabase → Authentication → Users). |
| No notifications | iPhone: Settings → Notifications → Ahoy → Allow + Sounds. Android: Settings → Apps → Ahoy → Notifications → on, and "Ahoys" category not silenced; turn off battery optimisation for Ahoy on Samsung/Xiaomi. Then open Ahoy once so it re-registers. Check `push_tokens` has an ios/android row for them (`launch-checklist.md` SQL). |
| Notification but no ship's bell | iPhone on silent / Focus mode. Android: "Ahoys" category sound changed by the user — reset it in the app's notification settings. |
| Invite link opens the website, not the app | Install first, then tap the link again. Still the website: App Links/universal-link setup (`mobile/README.md` → Invite links) — the "Open in Ahoy" button works regardless. |
| "Ahoy back!" didn't send | It retries next time they open the app (within 15 min). Happens most with the app force-quit on iPhone. |
| Opened the old web app / home-screen icon | It now only shows "Ahoy moved to the app" with the install links; delete the icon. |
