# Checkpoint 13 — Next-phase security test gaps (2026-11-23)

Scope: follow-up static review planning based on Checkpoint 12 and Checkpoint 10 findings. This document is a test-design checkpoint, not evidence that code tests were executed. No databases, Supabase projects, deployments, SMS, or authentication actions were performed.

## Test gaps prioritized for candidate readiness

### P0 — Candidate SQL is not covered by current CI
The current recovery workflow covers legacy compatibility SQL only. Candidate migration trio must have a separate disposable PostgreSQL job before results can be used as a release signal. The job must fail closed and must not accept hosted Supabase connection URLs.

### P0 — Concurrency process failures must propagate
For each parallel shell test batch, record PIDs and explicitly wait on each PID, collecting nonzero exit statuses. Do not rely on a bare wait. Output parsing alone is not a sufficient failure signal.

### P0 — Candidate authorization and actor binding
Test anon/authenticated cannot execute candidate wrappers/private functions; service role can execute only intended wrappers. Edge layer must derive actor from verified JWT, never trust an actor UUID supplied by the browser. Assert actor mismatch and forged-actor cases are rejected.

### P1 — Recovery attempt enforcement
Test fixed server-side maximum (intended five) rather than caller-controlled threshold. Ensure wrong-code attempts are accepted only when delivery outcome is sent and request is in the expected live state. Verify failed/unknown/pending/expired/completed requests cannot increment or validate attempts.

### P1 — Delivery/outbox state-machine transitions
Exercise pending→processing→sent, failed, and unknown; expired lease before send-start may be reclaimed, after send-start must reconcile to unknown and not auto-resend. Test stale generation/lease rejection and idempotency key reuse rules.

### P1 — Atomicity and trigger behavior
Force a failure in the second write of completion and verify the transaction rolls back both request and outbox. Test approval/outbox trigger ordering, terminal encrypted-payload clearing, and that ciphertext cannot be restored by subsequent trigger updates.

### P1 — Cryptographic envelope
With synthetic data only, test AES-GCM authentication failures (alter ciphertext, tag, IV, key identifier), AAD binding to request/operation IDs, malformed envelope rejection, IV uniqueness expectations, key rotation compatibility, and no plaintext code in logs or error text.

### P2 — Deterministic orchestration
Replace timing-based sleeps in race tests with explicit readiness/release synchronization. Tests should prove ordering (lock held, second transaction blocked, first released) rather than assume timing.

## Acceptance bar before real-world testing
- Candidate migrations compile and execute in a fresh disposable PostgreSQL instance with required roles/extensions/ownership.
- Candidate-specific CI reports separately from legacy RPC compatibility CI.
- Security catalog assertions cover candidate public wrappers, private function execution, Outbox table, trigger functions, and payload-fetch function.
- Concurrency suite aggregates all child process exit codes and is deterministic.
- Edge v11 contract test proves JWT actor binding, rate-limit behavior, response privacy, and provider outcome handling with mocks only.
- All tests use synthetic identities, fake phones, fake provider responses, and disposable local database. No live student records.

## Explicitly not done
- No test suite was run as part of this checkpoint.
- No migration applied.
- No Supabase access or changes.
- No Edge Function deployment/replacement.
- No SMS or password/auth reset.
- No branch merge or main-branch change.
