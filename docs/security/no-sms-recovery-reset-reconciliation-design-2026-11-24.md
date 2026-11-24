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
