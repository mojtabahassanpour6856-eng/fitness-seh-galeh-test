# Recovery Edge Function v10 → v11 integration contract (review only)

Date: 2026-11-22
Scope: TEST project only. This is a source-level integration plan; no function deployment or SMS was performed.

## Confirmed v10 behavior from active source
- Request path reads trainees by phone_normalized + approval_status='active', requires auth_user_id, then checks open statuses pending/approved and inserts pending.
- The open-request check is not atomic with insert; the current partial unique index is the last line of defense and does not include processing.
- Reset selects the latest approved request by phone, hashes the four-digit code with plain SHA-256, increments token_attempts with a non-atomic read-then-write, then claims by updating status to processing.
- Reset claim currently checks token_attempts < 10 although an earlier precheck rejects >=5.
- Auth password update is performed after claim. On Auth error, code reopens the request to approved; this can make stale/ambiguous states reusable.
- After Auth password success, completion marker failure is logged but the endpoint still reports success; this avoids inviting another reset but leaves a stuck processing row requiring reconciliation.
- Coach approval changes pending→approved before SMS; on timeout/error it returns the row to pending. A timeout can be ambiguous because the provider may have accepted the SMS before the client timed out.
- Provider 2xx with empty/unrecognized body can currently be treated as success.
- The four-digit code is returned only in SMS request body; coach response does not include it. Do not regress this property.
- CORS is wildcard; validId is a loose 36-character hex/hyphen pattern; the outer catch maps all unexpected failures to 400.

## Required v11 ordering
1. Keep the request endpoint generic to avoid account enumeration and retain the existing request rate limit.
2. Call an atomic create-request RPC; never perform an application-side check-then-insert.
3. Coach review still authenticates with auth.getUser(), derives coach user ID from the verified user, and calls an ownership-checking RPC.
4. On approval, create a cryptographically uniform 4-digit code with rejection sampling, a random attempt UUID, and HMAC-SHA-256 using a dedicated RECOVERY_TOKEN_PEPPER. HMAC input must be domain-separated and bind request ID + attempt UUID + code.
5. Atomic approve RPC writes approved + queued + attempt UUID + HMAC + expiry. It must re-check active trainee, auth_user_id, coach ownership, and registered phone.
6. Send SMS once for that attempt. Definite provider rejection→failed; ambiguous timeout/network/response→uncertain. Never restore pending or retry the same code automatically after an ambiguous outcome.
7. Mark delivery_state='sent' only when the provider response contract supports that conclusion. This means provider acceptance, not handset delivery.
8. Reset validates input, computes the same HMAC, and atomically increments failed attempts or claims the request. Correct-code claim requires status=approved, unexpired token, attempts<5, and delivery_state='sent'.
9. On wrong code, call record_trainee_recovery_failed_attempt RPC; if RPC errors, return 503 and do not fall back to a local counter.
10. After claim, update Auth password. Do not blindly restore approved on generic errors. If Auth result is ambiguous, retain processing and reconcile; if definitely rejected without mutation, a carefully designed recovery path may be considered after provider/Auth semantics are verified.
11. After Auth success, call finish RPC to clear HMAC/expiry and mark completed. If finish fails, do not claim the password update failed; keep the request non-reusable and raise an operational reconciliation signal.

## Important integration blockers
- The current finish RPC draft is intentionally separate from the Auth update. There is no atomic transaction spanning Supabase Auth and Postgres; a durable processing state + reconciliation procedure is required.
- `delivery_state='sent'` is a provider-acceptance state only. Do not tell the trainee the SMS was delivered to the handset.
- HMAC pepper is not provisioned. Never substitute SUPABASE_SERVICE_ROLE_KEY or MEDIANA_API_KEY as the HMAC key.
- The active provider contract is not fully established: response/correlation identifiers and timeout semantics remain unknown.
- The SQL drafts have not been compiled. Their referenced columns, owners, ACLs, index predicates, and function signatures must be checked against the current TEST schema before migration.
- The existing TEST database contains one approved-but-expired row. It must be safely reconciled before enabling the stronger open-request invariant. Do not mark it sent or reuse its token.
- No browser automation is available in this environment; UI behavior cannot be declared runtime-tested from source review.

## Acceptance tests before any rollout
- Concurrent duplicate request submissions create at most one open lifecycle row.
- Concurrent approve/reject actions yield exactly one state transition.
- A timeout after provider acceptance leaves delivery uncertain, not pending, and does not trigger same-code resend.
- Old provider attempt result cannot overwrite a newer attempt.
- Four-digit codes include leading zeroes and are uniformly generated.
- Wrong-code attempts are atomic; fifth failed attempt expires and clears the token.
- Two simultaneous correct resets cannot both claim the same code.
- Reset is rejected unless delivery_state='sent'.
- A coach cannot list, approve, or reject another coach's trainee request.
- Coach response/logs never contain the plaintext code or HMAC pepper.
- Password update success + finish RPC failure leaves a non-reusable processing row and a reconciliation alert.
- Rate limiting applies to both request and reset paths without exposing whether a phone is registered.

## Safety boundary
No database DDL/DML, Edge Function deployment, secret read/write, SMS, Auth password update, merge, or production change was performed.