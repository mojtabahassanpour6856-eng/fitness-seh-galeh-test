# Fitness Seh Galeh — Full App Mirror Audit
Updated: 2026-11-15
Status: TEST-only integration branch; draft review; production untouched.

## Scope and isolation
- Production repository: `mojtabahassanpour6856-eng/fitness-seh-galeh` (`main`).
- Test repository: `mojtabahassanpour6856-eng/fitness-seh-galeh-test`.
- Test work branch: `integration/full-app-mirror-20261115`.
- Test Supabase ref: `udptdznbvewkublvzmtm`.
- Production Supabase ref: `qfakyudgidsumeuoqoot` — read-only during this work; no writes, deploys, or data copies.
- Test Pages path and PWA scope: `/fitness-seh-galeh-test/`.
- PR #7 remains OPEN, DRAFT, and UNMERGED. Do not merge or publish the full mirror until manual QA and explicit approval.

## Database parity and synthetic data
- Production public tables: 58.
- Test public tables: 58.
- Test reference data: 240 foods and 323 exercises.
- Test-only account data: 2 synthetic trainee rows and 1 coach profile; 0 registration requests at audit time.
- No production trainee records, auth users, payment rows, private plans, or personal storage objects were copied.
- The structures of `profiles`, `trainees`, and `trainee_registration_requests` were compared between projects; their columns and types match.
- Five registration-related database function definitions were compared by MD5 in both projects; all definitions match.
- Four tables in `workout_batch_test` have RLS enabled but no policies. The schema has no USAGE for `anon` or `authenticated`, so those tables are not reachable through those roles.
- `public.exercises_duplicate_archive_20261023` is empty, has RLS enabled, no policies, and no SELECT grant to `anon` or `authenticated`. It remains an isolated archive; no structural change made.

## Edge Functions
- All 13 production Edge Function names exist in TEST.
- The source files for all 13 functions were fetched from both projects and compared byte-for-byte: all are identical.
- The `verify_jwt` settings also match for all 13 functions. Deployment version numbers differ because the environments have separate deployment histories.
- Registration review flow checked: the Edge Function validates the caller with `auth.getUser()`, requires a coach profile, then calls the atomic review RPC with the service-role client. The public RPC wrapper and its private implementation are service-role-only.
- Registration creation flow checked: the current app invokes `trainee-registration-request`; that function uses the service-role client and the rate-limit RPC. The auth-user trigger creates the trainee/profile row required by the subsequent approval flow.
- The legacy `submit_trainee_registration_request` RPC is not referenced in the test app shell and is no longer executable by `anon` or `authenticated`; the supported path is the Edge Function.

## Security changes made in TEST
- Revoked direct execution from PUBLIC/anon/authenticated for the trigger-only SECURITY DEFINER functions:
  - `apply_approved_registration_details()`
  - `handle_new_trainee_auth_user()`
  - `set_challenge_owner()`
  - `set_trainer_exercise_owner()`
  - `set_trainee_owner()`
- Trigger attachments remain present and unchanged.
- `consume_registration_rate_limit(...)` is now executable only by `service_role` (plus the owner); the Edge Function's service-role path is preserved.
- Revoked PUBLIC/anon/authenticated execution of the obsolete legacy registration RPC.
- Verified function privileges after changes: no anonymous access to the reviewed SECURITY DEFINER functions; the rate-limit RPC remains callable by service_role.
- Security advisor now reports 0 anonymous SECURITY DEFINER warnings. One authenticated SECURITY DEFINER warning remains for `save_coach_nutrition_builder_plan(jsonb)`; its body checks `auth.uid()`, coach role, and trainee ownership/access before writing, so authenticated execution is intentional.
- Leaked-password protection remains disabled in Auth and requires a dashboard setting change.
- Five RLS-without-policy informational findings remain as described above.

## App shell, PWA, and CI
- The test app shell uses only `https://udptdznbvewkublvzmtm.supabase.co` and the TEST publishable key.
- A production Supabase DNS-prefetch reference was found in the copied HTML and removed from this TEST branch. The shell was re-scanned: no production Supabase reference, service-role key, or secret key remains in the app HTML.
- Test manifest identity, start URL, and scope stay under `/fitness-seh-galeh-test/`.
- All 14 service-worker shell assets are present in the test repository tree.
- CI assertions were made whitespace-tolerant for the root service worker.
- Added regression tests that fail if the root app references the Production Supabase project, embeds privileged keys, or lists a missing service-worker asset.
- Latest integration-branch static/offline-preview workflow passed: run `43727512498` on commit `17c8bb8f314d6d93e91aa8fd20c54fc791f8b643`.
- The test repository's current `main` Pages deployment succeeded earlier, but PR #7's full-app integration branch has not been merged or published. The existing Pages deployment is not proof that the full app mirror is live.

## Secrets and provider configuration — scoped for the no-SMS release
The current release scope explicitly excludes SMS. No SMS delivery, SMS reception, OTP flow, SMS credential setup, SMS provider alignment, or SMS-based recovery test is required for this release. Do not add or request `SMSIR_API_KEY`, `SEND_SMS_HOOK_SECRET`, FarazSMS credentials, or any other SMS secret. The old SMS function/configuration is parked for a possible future phase and must not be invoked by the current app flow.

The TEST Edge Function secret inventory is not readable through the connected audit tooling; no secret values were read or printed. Runtime secrets needed by the non-SMS flows still require a TEST-only presence check through the project dashboard/authorized secret inventory. Never copy Production secret values. Push secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) are relevant only if push notifications remain in the release scope and are explicitly tested.

## Remaining QA gates — no SMS
1. Verify the TEST-only runtime secrets required for password-based login, registration, app data, storage, and any enabled push feature. Do not read, copy, or expose secret values in code or chat.
2. Confirm the login UI is the previously approved pre-SMS design: separate coach/trainee cards, mobile number plus password, sign-in, forgot-password entry, and registration. No OTP field, SMS instruction, or send-code action should appear. Forgot-password behavior must not imply SMS delivery; keep it disabled or provide only the currently implemented safe path until a non-SMS reset method is explicitly approved.
3. Run browser tests using only synthetic TEST coach/trainee accounts: registration, approval, password login, app session restoration, chat/push if included, nutrition plan save, Top Genesis upload/parse/publication, storage, and PWA install/update/offline.
4. Reproduce registration error `42.1` with the exact browser response and matching Edge/PostgREST logs. The current TEST registration-request table was empty at the prior audit and no matching function invocation was seen; this remains unverified.
5. Verify the support/contact experience and its response ownership before public release. If a ticket/report feature is intended, its exact scope and data handling must be approved before implementation.
6. Only after successful manual QA and explicit approval, consider merging PR #7 into TEST repository `main` to publish the full test mirror. Never merge this PR into the Production repository.
