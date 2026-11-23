# TEST mirror — support and no-SMS release readiness

Updated: 2026-11-23
Target: `mojtabahassanpour6856-eng/fitness-seh-galeh-test`
Working branch: `integration/full-app-mirror-20261115`
TEST Supabase ref: `udptdznbvewkublvzmtm`

## Explicit product scope
- SMS is out of scope. The app must not send or receive SMS, request OTP codes, or depend on SMS providers for this release.
- Park all SMS provider selection, credentials, delivery workers, and SMS-based recovery work for a future phase.
- Preserve password-based mobile login and the approved coach/trainee entry cards.
- Keep Production repository, Production Supabase, real trainee data, and real credentials untouched.
- No paid environment or new infrastructure is to be created for this test/release stage.

## Support readiness
- Identify a visible support/contact entry point in the app and verify it works on mobile and desktop.
- Show the responsible support channel and expected response window only after the owner confirms those details; do not invent a phone number, email, or service-level promise.
- If support requests are collected, disclose what information is collected, avoid requesting passwords or OTPs, and never include private trainee health/body-analysis data in a support ticket by default.
- Provide a clear way to report a bug with page/feature name, device/browser, time, and a user-entered description. Do not silently collect credentials or private records.
- Confirm who receives support requests, who monitors them, and how users know the request was received.
- The current code audit did not find an existing in-app support/ticket implementation. This is an open product requirement, not a completed feature.

## Release checklist
1. Verify approved pre-SMS login UI: coach and trainee role cards; mobile number + password; sign-in; registration; forgot-password entry with no SMS promise or OTP screen.
2. Test coach and trainee login/session restore with synthetic TEST accounts only.
3. Test registration and approval; investigate registration error `42.1` using the exact browser response and matching server logs.
4. Test nutrition plan save/read, Top Genesis upload/parse/report visibility, storage permissions, and relevant coach/trainee ownership boundaries.
5. Test PWA install, update, cache versioning, offline fallback, and reconnect behavior on Android and desktop browsers.
6. Verify app shell and every referenced asset return HTTP 200 on the TEST Pages deployment; verify TEST Supabase ref only and no privileged key in client assets.
7. Verify TEST-only runtime secrets by presence without copying values from Production. SMS secrets are not part of this release.
8. Complete a support/contact smoke test and assign a real owner for incoming requests.
9. Review the final test report and explicitly approve publishing the full mirror to TEST repository `main`.

## Current release evidence
- TEST mirror branch exists and PR #7 is open Draft, unmerged.
- Last recorded deployment of the integration branch: GitHub Actions run `44931143573`, completed successfully.
- The run verifies HTTP 200, Persian app title/branding, connected auth script, coach/trainee images, and TEST Supabase reference without Production project reference.
- The integration branch currently contains a previous SMS-oriented recovery UI PR (#15) as a separate Draft. It must remain excluded from the no-SMS release; do not merge it.
- The current `integration/full-app-mirror-20261115` branch has not been approved for merging into TEST `main`; `main` remains unchanged.
- No production deployment, Production Supabase mutation, or live trainee-data change is authorized.

## Decision gate
Do not call the app release-ready until the manual checks above are completed. A green Pages deployment proves static publication only; it does not prove login, database writes, storage, support routing, or the full user journey.