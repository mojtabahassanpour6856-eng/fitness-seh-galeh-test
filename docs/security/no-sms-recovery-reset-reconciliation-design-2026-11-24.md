# Design: recoverable no-SMS password reset across Supabase Auth boundary
Date: 2026-11-24
Status: design candidate only — not implemented, not deployed, not approved for production.

## Problem statement

PostgreSQL state changes and Supabase Auth's `updateUserById` call cannot participate in one shared transaction. The current candidate claims a code (approved -> processing), calls Auth, then marks the request completed. A timeout or process crash between those operations leaves an ambiguous result. It is unsafe to reopen the code as approved, but permanently locking the request is poor recovery behavior.

## Required invariant

A code is never available to a second concurrent password-reset operation. No raw password is persisted in the database, logs, analytics, or an envelope. A request can be retried only by the same authenticated trainee, with the same still-verifiable recovery code, after the active lease expires. A successful Auth update is followed by an idempotent completion marker.

## Proposed state machine

- `pending`: awaiting coach decision; no verifier, expiry, or envelope.
- `approved`: code issued; verifier and encrypted display envelope exist; no active reset lease.
- `processing`: code has been verified at least once; verifier remains, envelope remains only as needed for trainee display, and a short reset lease is held by one attempt.
- `completed`: Auth update was confirmed successful and completion was atomically recorded; verifier, expiry, envelope, lease and attempt identifiers are cleared.
- `expired`: code expired before any reset began, or the five-failure limit was reached; verifier, expiry, envelope and lease are cleared.
- `rejected`: coach rejected; all code material is absent.

Do not change the existing meanings of `approved` and `processing` without updating the state constraint and tests.

## Additional DB fields (proposal)

Add nullable fields to the recovery request:
- `reset_attempt_id uuid`: random attempt identifier for the current lease.
- `reset_lease_until timestamptz`: short lease deadline (suggested 2 minutes; tune only after timeout testing).
- `reset_started_at timestamptz`: first successful code claim timestamp.
- `reset_recovery_until timestamptz`: bounded continuation deadline, suggested 24 hours after first claim, so an ambiguous Auth response can be retried without treating it as a fresh code issuance.

No password, password hash, password-derived material, or client session token is stored.

## RPC contract proposal

All RPCs are SECURITY DEFINER, fixed `search_path`, revoked from public/anon/authenticated and executable only by service_role. Each returns explicit row/boolean results; Edge Function must validate exactly one expected result.

1. `begin_or_resume_trainee_password_reset(request_id, expected_verifier, attempt_id, lease_seconds)`
   - Lock the row with UPDATE/CTE semantics.
   - Require matching trainee/request (identity is checked in Edge Function), matching verifier, token_attempts < 5, and status approved or processing.
   - For approved: require token_expires_at > now(); transition to processing and set reset_started_at/reset_recovery_until.
   - For processing: require reset_recovery_until > now(); allow resume only when reset_lease_until is null/expired.
   - Set reset_attempt_id and reset_lease_until atomically. A live lease returns busy; no second caller may acquire it.
   - Return acquired/busy/invalid distinctly. Do not return code or password.

2. `finish_trainee_password_reset(request_id, attempt_id, expected_verifier)`
   - Conditional update only where status=processing, attempt id matches, verifier matches, and lease is still owned by this attempt.
   - Set completed and clear all code and lease material.
   - Return exactly one row or false.

3. `release_trainee_password_reset_lease(request_id, attempt_id)`
   - Only for a confirmed, definitive Auth rejection where the server can establish no password update occurred (e.g. deterministic password-policy validation response).
   - Clear lease fields but keep status=processing and recovery deadline so the same trainee can retry.
   - For network timeout, connection reset, unknown 5xx, or any ambiguous result, do NOT release early; let the short lease expire naturally.

4. Existing failed-attempt RPC:
   - Return a row only if exactly one approved request was atomically updated.
   - Edge Function must inspect returned data length. Zero rows means stale/raced/expired; return conflict and do not claim an attempt was recorded.
   - Fifth failure transitions approved -> expired and clears verifier, expiry and envelope, satisfying the state constraint.

## Edge Function algorithm

1. Authenticate the JWT and resolve the active trainee from auth_user_id.
2. Validate request id, four-digit code, and new-password policy without logging sensitive values.
3. Load only the trainee-owned request and compute the HMAC verifier using request id, trainee id and original expiry.
4. If state is approved, require original code expiry still valid. If state is processing, allow only continuation before reset_recovery_until and require the same verifier.
5. Generate a cryptographically random attempt UUID and acquire the lease via RPC. If busy, return 409 with a retry-after hint; never call Auth.
6. Call `auth.admin.updateUserById` using the authenticated trainee's own auth_user_id. Never store the password.
7. On confirmed success, call finish RPC. If finish RPC fails, return an explicit "Auth may have changed; retry recovery with the same code and password" state. After lease expiry the same trainee can reacquire and safely set the password again, then finish.
8. On ambiguous Auth outcome, do not mark completed and do not clear the verifier. Return a neutral retry-later response; after lease expiry the trainee can resubmit the same code and desired password.
9. On a confirmed definitive Auth rejection, release the lease using the RPC and return a safe validation error. If classification is uncertain, treat as ambiguous and allow lease expiry.
10. Do not return the code to the coach. Code display remains trainee-only and rate-limited. Ensure processing requests are not shown as pending coach work.

## Important security and product trade-offs

- A retry after an ambiguous result may set the password again. This is acceptable only because the same authenticated trainee must resubmit the still-valid recovery code and the new password is never persisted.
- The continuation deadline bounds how long an interrupted reset can be resumed. After that deadline, require a separately reviewed support/admin reconciliation path; do not silently reopen the request or issue a second code.
- If Auth reports success but the completion RPC fails, the UI must not falsely say "password unchanged." It must explain that the result may have succeeded and give the exact safe retry path.
- Do not let coach review, request creation, code display, or a second trainee bypass the processing lease.
- A code request refresh must not reset attempts, extend either deadline, or replace the verifier/envelope.

## Required tests before implementation approval

- Two simultaneous begin/resume calls: exactly one lease owner.
- Live lease returns busy; expired lease can be reacquired by same trainee only.
- Different trainee, different request, different verifier, expired code and expired recovery deadline all fail.
- Auth success + finish success => completed, all code/lease material cleared.
- Auth success + finish timeout => processing; same-code retry after lease can finish; no second concurrent call.
- Auth timeout before/after server-side update => processing; retry can set the submitted password and finish.
- Definitive Auth policy rejection => lease released; request remains processing and retryable.
- Fifth wrong code => expired and no verifier/envelope.
- Concurrent wrong-code attempts do not exceed five and stale verifier cannot increment a changed request.
- RLS, coach ownership, trainee identity, enumeration behavior, CORS, no-store and log redaction.
- SQL migration parses and applies only to a disposable TEST clone before any real TEST database is considered.
- Deno format, type-check and integration tests run in CI. No claim of pass until logs/artifacts prove it.

## Current decision

This design addresses the recoverable reset boundary but has not been implemented or tested. The existing candidate remains blocked. Keep `RECOVERY_NO_SMS_ENABLED` unset/false; do not apply migrations or deploy.


## Addendum — distributed Auth/DB boundary (2026-11-24)

A lease plus a fencing token protects database state, but it cannot fence an already-issued
Supabase Auth HTTP request. If request A times out locally while Auth is still processing it,
its lease can expire; request B can acquire a new lease and submit another password update;
request A may then complete late and overwrite B. A later conditional DB finalize cannot undo
that external Auth side effect.

Therefore the current candidate's automatic "retry after lease expiry" is **not proven safe**
for ambiguous Auth outcomes. Do not treat a lease as exactly-once execution across Postgres
and Auth.

Safe release/retry policy:
- A lease may be released automatically only when the Auth endpoint returns a definitive
  rejection that guarantees the password was not changed.
- For timeout, connection reset, gateway error, or any uncertain outcome, do not automatically
  issue another Auth update merely because the lease expires.
- Keep the request in a distinct reconciliation-required state (or processing with an explicit
  manual-review marker), block further reset attempts, and require an operator to verify the
  account state through an independently authenticated recovery/admin process before reopening.
- Never ask the trainee to submit a new password while the previous Auth update may still be
  in flight.
- Add fault-injection tests where Auth completion is delayed beyond lease expiry; the second
  update must not be issued.

This is a hard distributed-systems limitation, not something a longer lease or DB transaction
can eliminate. The implementation must be revised to fail closed on ambiguous Auth outcomes
before any deployment. The existing 120-second lease/resume behavior is a candidate experiment
only and is not approved for production.


## Superseding decision — no automatic retry after any expired/ambiguous Auth attempt (2026-11-24)

This section supersedes conflicting retry language above, including the earlier proposal that an expired lease may be reacquired by the same trainee. That proposal is rejected.

### Non-negotiable invariant

Once an attempt may have crossed the network boundary to Supabase Auth, **no second password-update request may be issued automatically** until the first attempt's outcome is independently reconciled. A database lease, attempt UUID, fencing token, longer timeout, or conditional finalize protects database rows only; none can cancel or fence an Auth HTTP request already accepted by the remote service.

### Revised state and lease semantics

- Keep `processing` as the in-flight/possibly-in-flight state.
- Add a terminal-for-automation state `reconciliation_required` (or an equivalent explicit durable marker) for any ambiguous outcome.
- An active lease may block competing attempts while its deadline is in the future.
- **Lease expiry is not permission to retry.** If a row is still `processing` after its lease expires, the next atomic DB operation must quarantine it as `reconciliation_required` (or return a durable blocked result that has the same effect). It must never grant a new lease.
- If the Edge Function receives a timeout, connection reset, gateway/unknown 5xx, loses the Auth response, or cannot prove whether Auth applied the password, it must atomically mark the attempt as `reconciliation_required` using the matching attempt ID. If that marker write itself fails, the existing `processing` row plus expired-lease fail-closed rule still blocks retries.
- If the process crashes after dispatching Auth but before recording any result, the same expired-`processing` rule quarantines it. This deliberately accepts a possible false-positive manual review when the process crashed before dispatch; safety takes precedence over automatic availability.
- A lease can be released for retry only for a narrowly allow-listed, documented Auth response that proves the password was not changed. Unknown response classes default to ambiguous. The allow-list must be backed by provider contract evidence and tests; do not infer definitiveness from HTTP status alone.
- A `reconciliation_required` row cannot transition back to `approved` or acquire a reset lease through trainee-facing RPCs. Only a separately authenticated, audited operator reconciliation path may resolve it, after independently establishing the Auth account state. If that cannot be established, keep it blocked and use a separately reviewed account-support procedure.
- Never ask the trainee to submit another password while an earlier Auth update may still be in flight.

### Revised RPC behavior

1. `begin_trainee_password_reset` may acquire a lease only from a fresh `approved` request. A second caller sees `busy` while the lease is live.
2. It must not reacquire a lease from `processing`, whether the lease is live or expired. A live lease returns `busy`; an expired lease atomically transitions to or reports `reconciliation_required` and returns `blocked_unknown_outcome`.
3. The explicit ambiguous-outcome marker RPC is conditional on request ID + attempt ID and can only move the matching `processing` attempt to `reconciliation_required`. It must not clear the durable block.
4. The definitive-rejection release RPC is conditional on the matching attempt ID and only callable after the Edge Function has classified a documented, proven-no-side-effect rejection. It may return the request to a retryable state only if the code's original validity policy still permits it; otherwise it expires the request.
5. Finalize-success remains conditional on the matching attempt ID. If Auth success is known but finalize fails, do not issue another Auth update. Keep the request blocked for operator reconciliation; a later DB-only completion repair may be considered only when success is independently evidenced.
6. All trainee-facing code paths must reject `reconciliation_required`, stale `processing`, and expired-`processing` rows without calling Auth.

### Required deterministic fault-injection tests

Use a fake Auth server with explicit barriers/promises so the test controls when the remote password update begins and completes. Do not rely on sleep-only timing tests.

- **Delayed first request beyond lease expiry:** A starts Auth update and remains unresolved; advance DB clock beyond lease; B submits a second reset; assert B is blocked and Auth call count remains exactly 1; then complete A late and assert no second update occurred.
- **Late overwrite regression:** A carries password P1 and B attempts P2 after lease expiry; force A to complete late; assert B never reached Auth and final Auth password can only be P1 (or unchanged if A did not apply).
- **Connection dropped after remote apply:** fake Auth applies P1, then drops response; after lease expiry B/P2 is blocked; assert no second Auth call.
- **Connection dropped before remote apply:** fake Auth receives the request but does not apply it and drops response; after lease expiry B is still blocked. This proves fail-closed behavior even when the true outcome is unknown.
- **Worker/process crash after dispatch:** persist `processing`, dispatch Auth, simulate process death before result persistence; after lease expiry, a new invocation must quarantine/block and make zero Auth calls.
- **Crash before dispatch:** simulate crash after lease acquisition but before Auth dispatch; after expiry, retry remains blocked and requires reconciliation (document the intentional availability trade-off).
- **Definitive rejection allow-list:** each permitted response proves no side effect and releases only the matching attempt; all unrecognized statuses, malformed responses and thrown transport errors remain blocked.
- **CAS/fencing:** stale attempt IDs cannot mark, release, finalize, or clear reconciliation state; in this policy no new trainee attempt is allowed after ambiguity anyway.
- **State/permission tests:** no trainee, coach, anon, or authenticated client can manually clear reconciliation state; only the audited operator path can do so.
- Assert in every ambiguous/crash case that the fake Auth call count never increases after the first dispatch.

### Release gate

No migration, function deployment, feature-flag activation, real SMS, or real password update is authorized by this design work. The candidate remains blocked until the SQL state constraint/RPCs, Edge Function, deterministic fake-Auth tests, PostgreSQL integration tests, and CI all implement and prove this fail-closed policy. Production/main and the live Supabase project remain untouched.
