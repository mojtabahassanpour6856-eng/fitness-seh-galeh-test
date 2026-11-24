# No-SMS recovery candidate: focused security review
Date: 2026-11-24
Branch reviewed: implementation/recovery-no-sms-db-candidate-20261123
Scope: read-only review of the current Edge Function and migration candidate. No database or deployment changes were made.

## Release blockers

1. **Migration syntax error:** the migration contains a line beginning `// A request in processing...`. PostgreSQL does not accept JavaScript-style comments. Replace it with `--` before any migration validation.
2. **Reset is not recoverable after an ambiguous Auth result:** the function claims approved -> processing before calling Supabase Auth. If the Auth call times out or returns an error after the password was actually changed, the code remains processing and there is no safe self-service reconciliation path. If the final status update fails after Auth succeeds, the endpoint reports completion_pending but no reconciler exists. Do not enable this flow until an explicit recovery/reconciliation protocol exists.
3. **Failed-attempt RPC result is ignored:** the SQL RPC returns a table (attempts, new_status), but the Edge Function checks only `error`. A stale/raced verifier can update zero rows and still be reported as a counted failed attempt. Check the returned row count and treat no row as a conflict; add a concurrency test.
4. **Request creation race:** the function performs a read for an open request followed by insert. The unique index prevents duplicate open rows, but the resulting unique-violation is returned as generic 503 rather than re-reading and returning the existing request. Handle the unique conflict safely.
5. **Coach review atomicity:** the conditional update is good for the pending-state race, but the approval path generates secrets before the conditional update. That is safe from disclosure, though wasted work can occur. Confirm the actual PostgREST relationship name for `trainees!inner(...)` against the deployed TEST schema before relying on coach list/join.
6. **CORS policy:** only one exact origin is supported. Requests without an Origin header are currently accepted when the configured origin exists; browser CORS is not an authentication control, but document the intended non-browser behavior and ensure every response (including origin rejection) has no-store headers.
7. **Rate-limit identity:** request/code/reset limits are keyed only by authenticated user id. Add account-independent/IP or other abuse controls only if the deployment environment can do so safely without leaking phone/account existence; otherwise document this residual risk.
8. **Expiry cleanup:** expired approved rows remain open under the partial unique index until another process changes their status. Add a safe expiry transition/cleanup strategy and tests.
9. **No executable verification yet:** no Deno format/type-check, SQL parse/apply-on-disposable-DB, integration, RLS, concurrency, or Auth failure-injection test has been run for this current candidate.

## Positive findings observed

- The candidate requires a valid Supabase JWT and resolves trainee identity from `auth_user_id`, not client-supplied phone or trainee id.
- Code generation uses rejection sampling and preserves leading zeroes.
- The verifier is HMAC-bound to request, trainee and expiry; the display envelope uses AES-GCM with associated data.
- The feature flag fails closed unless `RECOVERY_NO_SMS_ENABLED=true`.
- The reviewed source contains no SMS/email provider call.
- The candidate sets no-store headers on its normal JSON/OPTIONS responses and avoids returning the code to the coach.

## Decision

**Not ready for deployment or release.** Keep the feature flag off. Do not apply the migration or deploy the function. First fix the SQL syntax, validate the RPC response contract, and design/test a recoverable reset state machine for ambiguous Auth outcomes. This document records review findings only; it does not authorize production changes.
