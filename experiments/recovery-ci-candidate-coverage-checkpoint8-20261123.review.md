# Recovery Candidate vs CI Coverage Checkpoint 8 — 2026-11-23

## Scope
Read-only inspection of the mirror PR's existing GitHub Actions workflow, disposable PostgreSQL fixture, smoke tests, and independent-session concurrency tests. No workflow execution, database writes, migrations, deployments, or SMS occurred.

## Finding: CI coverage is for the earlier RPC implementation, not the newer outbox/encrypted-delivery candidate
The workflow `.github/workflows/recovery-sql-compile.yml` applies:
- `trainee-password-recovery-delivery-metadata-migration.review.sql`
- `trainee-password-recovery-core-rpcs.review.sql`
- `trainee-password-recovery-atomic-attempts.review.sql`
- `trainee-password-recovery-delivery-finish-rpcs.review.sql`

It then checks six legacy public RPCs and runs smoke/concurrency scripts against their signatures.

The newly reviewed atomic RPC + outbox + encrypted-delivery candidate trio from the main experiment branch is not wired into this workflow. Therefore, the existing successful CI run is evidence only for the legacy compatibility draft and fixture, not for the newer candidate lifecycle or worker.

## Coverage strengths in current legacy CI
- Disposable PostgreSQL 18 service and synthetic fixture; no Supabase target.
- Six RPCs checked for owner, SECURITY DEFINER, empty search_path, and service_role-only execute grants.
- Lifecycle smoke tests include duplicate request, wrong coach rejection, stale delivery attempt, five failed attempts/token cleanup, successful one-time claim, replay rejection, and finish.
- Independent sessions test concurrent request creation, five-attempt ceiling, one-time claim, and coach reassignment race.

## Important test reliability concern
The shell concurrency script starts multiple background psql commands and then uses a plain `wait`. It does not collect each child exit status explicitly; a failed psql process could be obscured by a later successful wait. Output-count assertions help, but future CI hardening should track PIDs and fail on each nonzero exit.

## Required next CI phase (do not implement against live DB)
1. Keep legacy workflow as a compatibility test, clearly labeled.
2. Add a separate candidate workflow/job only after candidate RPC signatures and migration order are finalized.
3. Apply candidate migrations in order to a fresh disposable PostgreSQL database with synthetic fixtures.
4. Add catalog assertions for all candidate RPCs and worker routines, including owner, SECURITY DEFINER, search_path, grants, and unexpected PUBLIC execute.
5. Add candidate-specific tests for outbox leasing/claim contention, stale lease generation, heartbeat, pre-send vs post-send recovery, unknown delivery outcomes (no blind resend), stable idempotency keys, encrypted envelope tamper/key rotation, attempt ceiling fixed at five, and the requirement that wrong attempts only count after delivery outcome is sent.
6. Explicitly capture and propagate every parallel psql process exit status.
7. Run only in CI/disposable local PostgreSQL; never run these scripts against either Supabase project.

## Status
Static review only. No tests run during this checkpoint. The candidate test gate remains incomplete.
