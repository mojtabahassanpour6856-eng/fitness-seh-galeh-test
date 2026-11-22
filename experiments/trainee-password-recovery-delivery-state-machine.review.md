# Password recovery delivery state machine — implementation proposal (REVIEW ONLY)

Scope: TEST project only, Edge Function `trainee-password-recovery`.  
Status: proposal; not executable approval. No database or function changes are made by this document.

## Why a separate delivery state is required

The request lifecycle and the SMS provider lifecycle are different things. Keep the existing request `status` values (`pending`, `approved`, `processing`, `rejected`, `completed`, `expired`) for compatibility, and add a separate delivery state:

- `not_started`: no SMS attempt has been made.
- `queued`: token has been generated and this exact attempt is ready to send.
- `sent`: provider response has been validated against its documented success contract.
- `uncertain`: request timed out, connection broke, or provider response was ambiguous.
- `failed`: provider gave a documented definitive rejection or local validation failed.

Never convert a timeout into `pending`/definite failure. Never display plaintext code to the coach or store plaintext code in the database.

## Proposed metadata (DDL sketch — DO NOT RUN)

Before preparing a migration, verify the current full CHECK constraint names/definitions and any RLS policies in TEST. This sketch deliberately does not drop or replace existing constraints.

```sql
alter table public.trainee_password_recovery_requests
  add column if not exists delivery_state text not null default 'not_started',
  add column if not exists delivery_attempt_id uuid,
  add column if not exists delivery_updated_at timestamptz,
  add column if not exists provider_message_id text;

alter table public.trainee_password_recovery_requests
  add constraint trainee_password_recovery_delivery_state_check
  check (delivery_state in ('not_started','queued','sent','uncertain','failed'));
```

Migration must be idempotent and reviewed against the actual constraint catalog before execution. Existing rows should default to `not_started`; do not infer that historic approved rows were successfully delivered.

## Required atomic transitions

Implement as narrowly scoped SECURITY DEFINER RPCs, with fixed `search_path`, execute revoked from PUBLIC/anon/authenticated and granted only to service_role. All transitions must check expected prior status and attempt identifier.

1. **Approve and queue**
   - Verify request is pending and belongs to the coach's trainee (ownership check remains in Edge Function).
   - Generate a cryptographically uniform 4-digit code using rejection sampling.
   - Atomically set request status approved, hash, 15-minute expiry, attempts=0, delivery_state=queued, new delivery_attempt_id, reviewer and timestamps.
   - Only one concurrent approval may win.

2. **Record provider result**
   - Accept request id + delivery_attempt_id.
   - `sent`: only after strict provider success validation; optionally persist provider message id.
   - `failed`: only for a documented definitive rejection.
   - `uncertain`: timeout, network exception, malformed/empty/unknown response.
   - Ignore stale attempt identifiers so a late response cannot overwrite a newer retry.

3. **Retry**
   - Require an authorized coach and an eligible state (`uncertain` or `failed`), subject to rate limits.
   - Generate a new code and atomically rotate hash, expiry, attempts=0, delivery_attempt_id, and delivery_state=queued before sending.
   - Any delayed previous SMS then contains an invalid code.
   - Never blindly resend the same plaintext code because it is not recoverable from the hash.

4. **Consume code**
   - Wrong-code increments use the atomic RPC already proposed in `trainee-password-recovery-atomic-attempts.review.sql`.
   - Correct-code claim must require status approved, delivery_state sent, token not expired, and attempts < 5.
   - Claim must be a single conditional update; only one concurrent request can move approved -> processing.
   - Revisit the existing behavior that returns success if Auth password update succeeded but marking the request completed failed. A reconciliation state/operation is needed; never make the token reusable in this case.

## Mediana contract questions — must be answered before implementation

- What exact JSON schema means successful pattern delivery?
- Does the API return a stable message identifier?
- Does it support idempotency keys?
- Is there a status-query endpoint for a message id?
- Which HTTP/provider errors guarantee that no message was accepted?

Until verified from Mediana's current official API documentation or provider support, no code should claim exactly-once SMS delivery. The safe default for ambiguous outcomes is `uncertain`.

## Verification sequence

A. Static review of current active function source and database constraints/policies.  
B. Implement SQL migration + RPCs in a disposable TEST branch/database snapshot only.  
C. Run transaction-isolated SQL tests with synthetic UUID fixtures and rollback; do not use real trainees.  
D. Unit-test pure state transitions and provider-response parsing with fixtures (no network).  
E. Run Edge Function integration tests with a mocked SMS transport and mocked Auth client.  
F. Only after all tests pass, request explicit permission before applying any TEST migration or deploying any TEST function version.  
G. Verify coach ownership, trainee UI, rate limits, one-time use, and no plaintext code disclosure.  
H. Production remains out of scope until separate explicit approval.

## Explicitly prohibited during this review

- No real SMS provider calls.
- No real Auth password updates.
- No real trainee data in fixtures.
- No production project access or writes.
- No migrations, SQL writes, Edge Function deployment, PR merge, or release.
