# Atomic recovery RPC architecture — review only

Date: 2026-11-22
Target: TEST project only. Architecture and implementation contract; not executed.

## 1. Core invariant

For each trainee, at most one recovery request may be in an open lifecycle state:

`pending`, `approved`, or `processing`.

`uncertain` is a delivery_state, not a request status. It remains attached to an `approved` request, and the token is not eligible for reset unless delivery_state is `sent`.

An old `processing` row must never be reopened because it is old. It can be resolved only after reliable evidence about the Auth password-update outcome.

## 2. Serialization strategy

Use a transaction-scoped advisory lock keyed by trainee UUID in every RPC that creates or transitions an open request. PostgreSQL transaction-level advisory locks are released automatically at transaction end. Hash collisions can only serialize unrelated trainees unnecessarily; they must not weaken correctness.

Every operation that changes request lifecycle must use the same lock convention. In addition, enforce the invariant with a partial unique index over `trainee_id` for statuses `pending`, `approved`, and `processing`.

Important: advisory locks only protect callers that follow the convention. Keep the unique index as the final database invariant. Before widening the existing index, run a read-only duplicate audit and define how any legacy processing rows are resolved. Do not blindly delete or expire them.

PostgreSQL documents transaction-level advisory locks and their automatic transaction lifetime in its explicit-locking guidance. Concurrent index builds can fail and leave invalid indexes, so index validity must be checked if a concurrent build is ever selected. See the PostgreSQL locking and CREATE INDEX documentation.

## 3. RPC contracts

All RPCs below are intended to be called only by the trusted Edge Function using service_role. The client must never call them directly. The Edge Function must derive coach identity from a validated JWT; never accept coach_user_id from request JSON.

### A. create_recovery_request

Inputs: `p_trainee_id uuid`, `p_phone_normalized text`.

Transaction steps:
1. Validate non-null trainee UUID and canonical Iranian normalized phone format.
2. Acquire transaction advisory lock for trainee UUID.
3. Re-read trainee inside the transaction and verify active status, matching normalized phone, and non-null auth_user_id.
4. Check for any pending/approved/processing request.
5. If one exists, return a generic `already_open` result without disclosing details.
6. Insert one pending row and return generic `created`.
7. Let the partial unique index handle any writer that bypasses the advisory-lock convention; map unique violation to generic `already_open`.

Do not return trainee existence, auth_user_id, or row details to the public request endpoint. The Edge Function continues to return a generic response.

### B. approve_and_queue_recovery

Inputs: `p_request_id uuid`, `p_coach_user_id uuid`, `p_token_hash text`, `p_expires_at timestamptz`, `p_attempt_id uuid`.

Preconditions:
- `p_coach_user_id` comes only from `auth.getUser()` in the Edge Function.
- Edge Function has already loaded and checked that the trainee belongs to this coach; RPC must independently enforce ownership by joining the trainee row.
- token hash must be a fixed-length lowercase HMAC digest; expiry must be in a bounded future window; attempt UUID must be non-null.

Transaction steps:
1. Lock the request row and trainee lifecycle key in a consistent order to avoid deadlocks.
2. Verify request is pending and trainee coach_user_id equals the supplied trusted coach identity.
3. Atomically set status=approved, reviewer metadata, token hash/expiry, attempts=0, delivery_state=queued, and delivery_attempt_id.
4. Return only request ID and attempt UUID to the Edge Function; never return code or token hash to coach UI.
5. If another reviewer already changed status, return `not_pending` without overwriting.

### C. record_recovery_delivery_result

Inputs: `p_request_id uuid`, `p_attempt_id uuid`, `p_result text`, optional provider reference only after provider contract is confirmed.

Allowed result values: `sent`, `failed`, `uncertain`.

Update only where request ID matches, status=approved, current delivery_attempt_id matches, and delivery_state=queued. Late results for superseded attempts return `stale_attempt` and make no changes.

Use `sent` only for a provider response whose documented semantics establish acceptance. Use `failed` only when the provider contract establishes definite non-acceptance. Timeout, connection loss, malformed response, and unknown response map to `uncertain`.

### D. record_trainee_recovery_failed_attempt

Inputs: `p_request_id uuid`, `p_expected_token_hash text`.

Single atomic conditional update: request ID matches, status=approved, hash matches, expiry is in future, delivery_state=sent, attempts<5. Increment exactly once. At the fifth failed attempt, set status=expired and clear token hash/expiry. Return a boolean/outcome indicating whether an attempt was counted.

A stale hash must not increment a newly rotated token. Database errors must be treated as server errors, never as a counted failed attempt.

### E. claim_recovery_code

Inputs: `p_request_id uuid`, `p_expected_token_hash text`, `p_now timestamptz` (or use database clock internally).

Atomic compare-and-set approved -> processing only when token hash matches, expiry is future, delivery_state=sent, and attempts<5. Only one concurrent correct-code request may win. Do not accept a caller-provided time; use database clock_timestamp() internally.

### F. finish_recovery

Inputs: `p_request_id uuid`, `p_expected_token_hash text` or claim generation identifier.

Transition processing -> completed and clear token fields only after Auth password update succeeded. Use compare-and-set on processing state and claim identity. A zero-row result is an operational reconciliation condition, not a reason to reopen the token.

### G. reconcile_recovery_processing

Privileged operational path, not callable by clients. Reconcile only with reliable evidence from Auth or an explicit verified administrative process. Never reopen solely because `updated_at` is old. If outcome cannot be proven, preserve non-reusable processing state and alert operator.

## 4. Table/index migration gate

Before applying any migration in TEST:
- Read-only count of duplicate open rows by trainee across pending/approved/processing.
- Inspect every processing row and define its outcome; no automatic mass status changes.
- Confirm no existing index with invalid state or unexpected definition.
- Add delivery metadata columns additively with safe defaults/nullability.
- Widen/replace the partial unique index only after duplicates are reconciled.
- Preserve RLS, FORCE setting, owner, grants, existing foreign keys, and unrelated indexes.
- Verify service_role-only RPC execution and deny anon/authenticated execution.

Do not put time-dependent predicates such as `expires_at > now()` in a partial unique index. Index membership should depend on stable lifecycle status; expiry must be handled by explicit state transitions.

## 5. Critical race tests

- 30 simultaneous create calls for the same synthetic trainee: exactly one row created; all others return already_open.
- Two different trainees create concurrently: neither blocks on the other's logical key.
- Two coaches approve same request: exactly one transition wins; wrong coach denied.
- Delivery result from old attempt arrives after a new attempt: no state mutation.
- 20 wrong-code calls: counter advances monotonically to five; token expires exactly at five.
- Wrong-code and correct-code calls race: row serialization produces one consistent order and never permits >5 attempts.
- Correct code with delivery_state=queued or uncertain: denied.
- Two correct-code calls: exactly one processing claim.
- Auth success + finish RPC failure: request remains non-reusable and enters reconciliation.
- Old plain SHA-256 digest cannot validate after HMAC cutover.

## 6. Current decision

Do not implement or execute these RPCs yet. The active schema lacks delivery metadata, and the current unique index excludes processing. First complete the read-only duplicate/processing audit, then prepare one additive TEST migration with an explicit rollback plan. Keep the active Edge Function v10 unchanged until that migration and its synthetic tests are approved.

## 7. Reference links

- PostgreSQL explicit locking: https://www.postgresql.org/docs/current/explicit-locking.html
- PostgreSQL CREATE INDEX: https://www.postgresql.org/docs/current/sql-createindex.html

Status: design only; no SQL, deployment, SMS, or password operation performed.