# Recovery Outbox worker static review checkpoint 5
Date: 2026-11-23

## Scope
Read-only review of the experimental outbox worker SQL. No execution, database mutation, deployment, or SMS/auth operation.

## Flow reviewed
- Claim uses row locks with SKIP LOCKED and lease generation.
- Claim is allowed for pending rows due now or expired processing rows whose send has not begun, and checks the request is approved/pending for the same immutable delivery operation.
- Heartbeat requires matching worker id, generation, and active lease.
- Begin-send requires active lease, matching generation, no prior send-start, and attempt_count below 10; it atomically changes request delivery outcome and records send_started_at/attempt count.
- Finish-send requires active lease and send_started_at; transitions request and outbox together.
- Expired lease after send-start reconciles to unknown, preventing automatic resend after ambiguous provider outcome.

## Positive observations
- `FOR UPDATE SKIP LOCKED` prevents workers from selecting the same row simultaneously.
- Generation increments on each claim and guards stale worker actions.
- The code distinguishes confirmed failure from unknown delivery result, reducing duplicate SMS risk.
- Terminal states clear lock ownership; status/lock invariant is enforced by a table check.
- Idempotency key is stable for the delivery operation.

## Risks/tests still required
1. **Worker transactions:** Each RPC call must be executed with transaction semantics; especially begin-send and finish-send must be tested for atomic request/outbox updates and rollback behavior.
2. **Attempt ceiling recovery:** Rows at attempt_count=10 must be verified to end in a recoverable, visible terminal state (not silently stranded as processing/pending). Static review shows begin-send refuses further attempts; test explicit boundary.
3. **Provider idempotency contract:** A stable key is included, but actual duplicate suppression depends on provider support and must be validated against a fake provider contract first. No real provider calls.
4. **Lease race tests:** Exercise claim contention, lease expiration pre-send, expiration after send-start, stale generation heartbeat/finish, and worker crashes.
5. **Reconciliation authorization:** Reconciliation wrapper is service_role-only by intended grants. Validate owner and ACL in disposable DB.
6. **Expired/unknown behavior:** Verify coach UI and trainee UI communicate an unknown SMS outcome safely and do not automatically reissue code delivery.

## Status
Static worker review completed; no test execution. Gate 1 remains incomplete. Gate 3 (disposable PostgreSQL integration tests) not started.
