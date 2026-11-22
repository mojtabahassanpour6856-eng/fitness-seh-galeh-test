# Trainee password recovery — implementation runbook (REVIEW ONLY)

Date: 2026-11-22  
Target: TEST project `udptdznbvewkublvzmtm`, Edge Function `trainee-password-recovery` v10  
Working branch: `fix/trainee-password-recovery-ui-20261122`  
Baseline: `integration/full-app-mirror-20261115`  
Status: design and sequencing only. No SQL executed, no Edge Function deployed, no SMS sent, no password changed.

## 1. Non-negotiable boundaries

- All future implementation and tests stay in the disposable TEST environment.
- Never write to production project `qfakyudgidsumeuoqoot`.
- Keep browser roles denied by RLS on recovery and rate-limit tables.
- Do not expose the four-digit code, token hash, provider credentials, or internal delivery diagnostics to the coach UI.
- No real trainee fixtures, real SMS, or real password reset during synthetic testing.
- Do not merge or publish to the main app until the user explicitly approves after test evidence.
- Do not claim exactly-once SMS delivery: the provider contract currently documented does not establish an idempotency key or a reliable response identifier for pattern sends.

## 2. Confirmed current state

- Active TEST Edge Function version: 10; `verify_jwt=false`.
- Coach actions perform Bearer-token validation via `auth.getUser()` and require `profiles.role='coach'`.
- Request and reset actions are unauthenticated and use generic responses to reduce phone enumeration.
- Recovery table has statuses: pending, approved, processing, rejected, completed, expired.
- Partial unique index currently covers only pending/approved per trainee.
- `token_attempts` is constrained to 0..10; application precheck rejects at 5, but the claim predicate currently allows values below 10.
- Wrong-code attempts currently use read-then-write and are vulnerable to lost increments.
- Provider timeout currently resets approved -> pending and clears token data, although provider acceptance may have occurred.
- Completion-marker failure after successful Auth password update is logged, but no reconciliation mechanism exists.
- The existing rate-limit RPC is atomic and already has a pinned empty search_path; preserve its narrow grants and validation.

## 3. Database design — required before Edge Function rollout

### 3.1 Delivery metadata

Add a durable delivery record/state without weakening existing RLS:
- `delivery_state`: not_started | queued | sent | uncertain | failed.
- `delivery_attempt_id`: fresh UUID for each newly generated code/send attempt.
- `delivery_started_at`, `delivery_updated_at`.
- Optional provider request/message identifiers only after Mediana confirms the exact response contract and that pattern-send supplies usable identifiers.
- Never store the plaintext code. Store only its hash.

Migration must be additive and reversible. Preserve current constraints, indexes, owner, RLS policies, and service_role-only table access. Define backfill semantics explicitly; pre-existing approved rows must not be assumed delivered. Safest default is to make them ineligible for reset until reconciled or expired and reissued.

### 3.2 Atomic RPCs

Implement and review the following operations as narrowly scoped database functions:

1. `create_recovery_request`
   - Enforce one open request per trainee across pending, approved, and processing.
   - Lock or serialize by trainee ID so concurrent creates cannot race.
   - Return only a generic outcome; do not reveal whether a phone belongs to a trainee.
   - Do not auto-clear a processing row based only on age.

2. `approve_and_queue_recovery`
   - Atomically require pending state and confirm trainee belongs to the authenticated coach identity supplied by the trusted Edge Function.
   - Set approved, reviewer, token hash, expiry, attempts=0, delivery_state=queued, and a new attempt UUID in one transaction.
   - Preserve compare-and-set semantics so only one coach review wins.

3. `record_recovery_delivery_result`
   - Accept request ID + attempt UUID + result.
   - Update only if the current attempt UUID matches and state is queued.
   - Late responses for an old attempt must be ignored.
   - Timeout/ambiguous provider outcome becomes uncertain, never pending.
   - A definite provider rejection may become failed, but only when the provider contract proves it was not accepted.

4. `record_recovery_wrong_attempt`
   - In one atomic statement/transaction, require current request ID, approved state, matching token hash, unexpired token, and attempts<5.
   - Increment exactly once under concurrent requests.
   - At attempt 5, expire/invalidate the token atomically.
   - A stale request using an old hash must not increment a newly rotated token.

5. `claim_recovery_code`
   - Compare-and-set approved -> processing.
   - Require delivery_state=sent, matching hash, unexpired token, attempts<5.
   - Exactly one concurrent correct-code request may claim it.

6. `finish_recovery` and `reconcile_recovery_processing`
   - Mark completed and clear token only after Auth password update succeeds.
   - If Auth update definitively fails, only restore approved when the code remains valid and the failure is known to have occurred before password mutation.
   - If Auth outcome is unknown or completion write fails, retain non-reusable processing state and surface an operational reconciliation task; never blindly reopen the code.
   - Reconciliation must use a reliable Auth outcome, not merely elapsed time.

### 3.3 Function security

- Prefer SECURITY INVOKER. Use SECURITY DEFINER only where atomic privileged access is necessary.
- Every SECURITY DEFINER function must use `SET search_path = ''` and schema-qualify every relation/function.
- Revoke EXECUTE from PUBLIC, anon, and authenticated unless a narrowly justified caller needs it; grant only to service_role or a private trusted caller as designed.
- Validate every argument inside the function. Never trust a coach ID passed by the client; Edge Function must derive it from validated JWT identity.
- Keep helper functions in a non-exposed schema where possible.
- Test function owner, ACL, search_path, RLS behavior, and cross-coach denial after migration.

## 4. Edge Function patch sequence

1. Replace modulo-based code generation with rejection sampling over a uniformly distributed 0..9999 range.
2. Keep phone normalization and generic request responses.
3. Replace request pre-check + direct insert with `create_recovery_request`.
4. For coach approval, call `approve_and_queue_recovery`; do not send before the durable queued state exists.
5. Send the code only to the registered trainee number. Never return it or its hash to the coach.
6. On a definite provider response, record sent/failed using request ID + attempt UUID. On timeout, network interruption, malformed/ambiguous response, or unknown provider result, record uncertain.
7. Do not reset uncertain sends to pending. A later resend requires a new code/hash and new attempt UUID, with an explicit policy that invalidates the previous token and handles possible duplicate SMS.
8. For wrong codes, call the atomic attempt RPC. For correct codes, call the atomic claim RPC and require delivery_state=sent.
9. Update Auth password only after claim. Then finish/reconcile without allowing token reuse.
10. Keep coach list restricted to pending requests belonging to that coach. Return no token, code, hash, or provider secrets.

## 5. Mediana contract gate — blocking

The currently reviewed official pattern-send documentation describes `POST /sms/v1/send/pattern` and an example with no response body/headers. It does not establish that this pattern endpoint returns a durable request ID or message ID, nor does the reviewed material establish an idempotency key.

Before enabling automatic retries or delivery reconciliation, obtain written provider confirmation of:
- HTTP status meanings for accepted vs rejected pattern requests;
- whether the endpoint returns a request ID/message ID in headers or body in real responses;
- whether a status lookup can use that exact identifier;
- whether a timeout can be safely retried and whether duplicate sends are possible;
- whether an idempotency key is supported for pattern sends.

Until confirmed, an empty 2xx response is only an accepted HTTP response, not proof of handset delivery. Do not claim message delivery certainty. Never log API keys or plaintext codes.

## 6. Test plan — synthetic only

Run only against a disposable TEST clone with synthetic coach/trainee/Auth users and a stubbed SMS transport. Do not point tests at the real Mediana endpoint.

### Database/security
- anon and authenticated cannot select/insert/update/delete recovery rows.
- anon and authenticated cannot execute privileged RPCs.
- service_role can execute only intended RPCs.
- Coach A cannot list/review Coach B's synthetic trainee.
- SECURITY DEFINER functions have empty search_path and qualified names.
- Existing rate-limit RPC ACL/search_path remain unchanged.

### Concurrency
- 20 simultaneous approvals of one pending request: one winner.
- 20 simultaneous correct-code claims: one winner.
- 20 simultaneous wrong codes: monotonic increments; token expires at exactly five.
- Old-hash wrong attempt racing with code rotation cannot affect the new token.
- Simultaneous request creation produces one open request.
- A new request while processing is blocked.
- Late response from an old delivery attempt cannot overwrite a newer attempt.
- Provider timeout remains uncertain, not pending.
- Auth update succeeds but completion marker fails: code remains non-reusable and reconciliation is required.
- Definite Auth failure follows the documented safe recovery path.

### UI/manual
- Trainee sees only request status and code-entry form.
- Coach sees pending request and approve/reject controls, never the code.
- Correct code accepted only after delivery state is sent.
- Wrong code, expired code, reused code, and five failed attempts produce safe Persian messages.
- Mobile layout and the recovery panel mount/observer behavior are checked in a real browser before any merge.

No test above is claimed as executed by this document.

## 7. Rollout and rollback order

1. Snapshot TEST schema/function metadata and current Edge Function v10 source.
2. Apply additive TEST migration only after SQL review.
3. Verify RLS, grants, constraints, indexes, and RPC behavior with synthetic SQL tests.
4. Deploy a patched TEST Edge Function only after RPC tests pass; use a stubbed SMS transport.
5. Run concurrency/security/UI test matrix and record evidence.
6. Verify recovery request/reset flows end-to-end with synthetic users only.
7. Obtain provider contract confirmation before enabling live Mediana delivery.
8. Ask user for explicit approval before any real SMS test or main-app integration.
9. Keep production and main branch untouched until separate explicit approval.

Rollback: disable the TEST recovery flow first; restore prior TEST Edge Function source/version if needed; reverse only additive TEST schema changes after verifying no dependent rows/functions. Never run rollback SQL against production.

## 8. References

- Supabase Database Functions security guidance: https://supabase.com/docs/guides/database/functions
- Supabase RLS guidance: https://supabase.com/docs/guides/database/postgres/row-level-security
- Mediana API documentation: https://apidoc.mediana.ir/

These references support the design principles; they do not prove the unexecuted tests or undocumented provider behavior.
