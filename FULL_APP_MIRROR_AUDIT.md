# Full App Mirror — Migration Audit
Date: 2026-11-15
Status: audit baseline only; no production changes and no production data copied.

## Objective
Create a complete, isolated test mirror of the Fitness Seh Galeh app. The test mirror must use only the TEST Supabase project and synthetic accounts/data. Production source, database, users, storage, and secrets must remain untouched.

## Repositories
- Source of truth: `mojtabahassanpour6856-eng/fitness-seh-galeh`, branch `main`.
- Test target: `mojtabahassanpour6856-eng/fitness-seh-galeh-test`.
- Work branch: `integration/full-app-mirror-20261115`.
- Test Pages base path: `/fitness-seh-galeh-test/`.

## Supabase projects
- Production project ref: `qfakyudgidsumeuoqoot` — DO NOT WRITE.
- Test project ref: `udptdznbvewkublvzmtm` — target for isolated setup only.

## Confirmed audit findings
- Production currently has 54 public tables (including application, trainee, payment, nutrition, workout, messaging, registration, recovery, device-link, and body-analysis data).
- Test project is materially behind production schema; it has only a subset of the required public tables.
- Production has 13 active Edge Functions returned by the current inventory:
  - send-sms
  - clever-worker
  - trainee-registration-request
  - review-trainee-registration
  - apply-trainee-schedule
  - food-nutrition-search
  - trainee-device-link
  - review-trainee-device-link
  - trainee-registration-login
  - send-chat-push
  - delete-archived-trainee
  - trainee-password-recovery
  - send-coach-chat-push
- Test project currently has 13 active Edge Functions (same function-name set as production, but deployed versions/hashes are not yet verified as equivalent).
- Production contains real user data. No production rows, auth users, storage objects, or secrets may be copied to test.
- The main app's `index.html` is too large for the current GitHub file-fetch wrapper to return its contents reliably. A zero-length wrapper response is NOT evidence that the actual source file is empty.
- Production manifest contains a production Pages URL/scope; it must be adjusted only in the test branch to the test Pages base path.
- Production service worker is `sw.js` and currently has an explicit static shell asset list. It must be reviewed and aligned with the complete test asset tree.

## Known test-environment gaps/errors
- Test app previously returned missing-column/table errors for trainees, exercises, profiles, trainer_exercises, coach_chat_messages, and trainee_registration_requests.
- Test UI reported registration error code `42.1`; root cause is not established. Capture the exact browser response and corresponding Postgres/Edge logs before changing schema/policies.
- Test DB had prior incremental repairs. These are not a substitute for replaying the authoritative schema/migrations from source.

## Required migration sequence
1. Export and inventory the complete source repository tree and commit SHA, including hidden files, workflows, assets, PWA files, vendor assets, and any Supabase directory.
2. Compare source and test repository trees; preserve existing test-only experiments and never overwrite them silently.
3. Copy source code to this dedicated integration branch, excluding secrets and production-only environment values.
4. Review all runtime configuration references (Supabase URL/key, Edge Function invocations, auth redirect URLs, storage buckets, SMS, Turnstile, push, analytics, and Pages paths).
5. Build/reconstruct the TEST database schema from authoritative migrations/schema definitions. Do not infer missing tables/columns from UI errors.
6. Recreate required TEST-only RLS policies, grants, indexes, triggers, RPCs, and storage policies. Verify isolation with coach and trainee test accounts.
7. Deploy Edge Functions to TEST only. Configure test secrets separately; never read or expose production secret values.
8. Seed only synthetic food/exercise/reference data and synthetic trainees.
9. Run build/static checks, PWA/offline checks, and end-to-end workflows for coach and trainee roles.
10. Open a draft PR from this branch to test `main` only after the mirror passes review. Never merge to production repository.

## Safety gates
- No writes to production Supabase or production GitHub repository.
- No production student/trainee records copied.
- No production credentials copied or printed.
- No deployment to the test Pages main branch until the full mirror is reviewed.
- If source tree or environment mapping cannot be verified, stop rather than guess.

## Current state
- Dedicated integration branch created from test repository `main`.
- This commit records the audit baseline only; it does not claim that the full app has been transferred.


## Work branch progress (2026-11-15)
- Dedicated branch: `integration/full-app-mirror-20261115` in the test repository.
- Main `index.html` source was fetched through its Git blob SHA (about 1.2 MB) and copied to the work branch.
- Only the Supabase project URL and publishable key were replaced with the TEST project's public values. Checks confirmed no production Supabase URL/key strings remain in the copied app shell.
- Copied and SHA-verified app dependencies: Supabase JS vendor bundle, coach nutrition builder, Top Genesis PDF embed/parser/CSV parser/publication/archive modules, and PDF test page.
- Copied service worker and adjusted its shell asset list to match the test manifest's SVG-only icon (production PNG icons are binary and absent from the test branch).
- Test manifest retained its test-only identity and scope; it was not overwritten by production manifest.
- Test Supabase already has 13 active Edge Functions. Their presence is confirmed; exact code parity and test-secret configuration remain to be verified.
- No Production DB writes, deployments, or data copies were performed.
