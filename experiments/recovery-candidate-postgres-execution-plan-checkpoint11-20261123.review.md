# Checkpoint 11 — Candidate PostgreSQL test execution plan (2026-11-23)

Status: planning/documentation only. Runtime check found no `psql`, `postgres`, `initdb`, `docker`, or `podman` available in this workspace. No packages were installed.

## Safety boundary
- Only a local disposable PostgreSQL instance is permitted.
- Reject any connection URL containing hosted Supabase/project host indicators; never use either known Supabase project ref.
- Fixture must use synthetic coach/trainee UUIDs and synthetic phones.
- Never import live trainee or recovery-request rows.
- No Supabase migrations, deploys, real SMS, Auth password changes, PR merges, or main-branch changes.

## Required candidate migration sequence
Apply the three candidate files in this order, on a newly created throwaway database:
1. `20261122_recovery_atomic_rpc_candidate.sql`
2. `20261122_recovery_outbox_worker_candidate.sql`
3. `20261122_recovery_encrypted_delivery_payload_candidate.sql`

Before applying, fixture only the minimum schemas/roles/tables/extensions referenced by these migrations. Capture the disposable database version and migration hashes. Stop on the first SQL error and destroy/recreate the disposable database; do not attempt partial repairs.

## Test execution stages
### A. Compile / migration safety
- Fresh schema applies all three migrations without errors.
- Re-apply is not assumed idempotent; test on a fresh database only.
- Verify constraints, triggers, indexes, function signatures and owners.

### B. Access control
- Confirm SECURITY DEFINER functions have empty search_path.
- Confirm private schema is not exposed and private functions cannot be called by anon/authenticated.
- Verify service_role is the only intended RPC caller.
- Ensure public wrapper function ACLs and table privileges are correct.
- Edge actor identity must derive from verified JWT, not caller-controlled body.

### C. Atomic request/approval/outbox
- Synthetic phone normalization and duplicate phone records.
- Repeated request and concurrent request creation.
- Coach role, coach ownership, inactive/archive and reassignment checks.
- Reject decisions must not enqueue.
- Approve must insert exactly one outbox operation with ciphertext copied consistently.

### D. Encrypted envelope
- Reject missing/extraneous envelope keys, malformed base64, wrong IV/ciphertext lengths, invalid algorithm/version/kid, mismatched operation ID.
- AES-GCM decrypt/encrypt round-trip only in test code.
- Tampered ciphertext/tag fails.
- AAD binds request ID + immutable delivery operation ID.
- Key rotation and unknown key ID are covered.
- Assert plaintext code is absent from database, SQL logs, worker logs and error strings.

### E. Outbox lease/concurrency
- Claim race: only one worker claims an eligible row.
- Generation increments on lease reclaim; old worker cannot heartbeat, fetch payload, begin-send, or finish.
- Pre-send lease expiry is safely reclaimable.
- After send-start, expired lease reconciles to unknown; no automatic resend.
- Begin-send/finish/reconcile transitions are atomic across request and outbox.
- Test confirmed failure → terminal payload clear and fresh coach approval creates new operation.
- Test provider idempotency key stability per operation.

### F. Recovery token/auth state
- Wrong attempts fixed at server threshold five, not caller-selected.
- Wrong attempts require delivery outcome sent.
- Correct code claim is one-time under concurrent requests.
- Expired, archived, inactive, reassigned coach, stale operation and replay are denied.
- Auth update outcomes completed / confirmed_no_change / unknown are reconciled correctly.
- Unknown Auth outcome must not blindly repeat password change.

### G. Data preservation and teardown
- Verify only synthetic records change.
- Verify all assertions pass before exporting a sanitized test report.
- Destroy the disposable database and confirm teardown; keep only logs that contain no secrets or personal data.

## Current blockers before execution
1. PostgreSQL runtime tools are not available in this environment.
2. Candidate-specific tests do not yet exist; mirror CI tests only the legacy compatibility RPC set.
3. The migration trio references Supabase roles and schemas; a synthetic fixture must reproduce required dependencies carefully.
4. Static review findings from checkpoint 10 must be addressed in candidate code before calling the suite release-ready.

## Verdict
Execution is blocked by absent local PostgreSQL tooling. Do not interpret static review or existing legacy CI as candidate migration runtime success. The next safe step is to prepare a disposable local PostgreSQL environment in a user-controlled machine/workspace where tooling is available, then execute this plan.
