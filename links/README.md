# links/ — invite links, app-link association, privacy policy

Plain static site for the links domain (`EXPO_PUBLIC_LINKS_DOMAIN` in the
app; placeholder `ahoy.example`). Deploy it as its **own** Vercel project with
this folder as the root directory (no build step):

| Path | What |
|---|---|
| `/add/<username>` | Invite fallback page (rewritten to `add.html`): shows the username, store/TestFlight placeholders, "Open in Ahoy" (`ahoy://add/<username>`) |
| `/.well-known/apple-app-site-association` | iOS universal links for `/add/*` (served as `application/json`, no redirect) |
| `/.well-known/assetlinks.json` | Android App Links for `com.duncanheidkamp.ahoy` |
| `/privacy` | Privacy policy (App Store / Play listing URL) |

Before going live replace: `TEAMID` in the AASA (Apple Developer → Membership
→ Team ID), the SHA-256 fingerprint in `assetlinks.json` (`npx eas-cli@latest
credentials` → Android → the build profile's keystore → SHA256; add the Play
Console *App signing key* fingerprint too once Play App Signing is on), and
the `STORE_LINKS` in `add.html`. Setup steps: `mobile/README.md` → Invite links.

Supabase Storage is not a good host for this: it can't serve the AASA at the
domain root with the right content type and no redirect.
