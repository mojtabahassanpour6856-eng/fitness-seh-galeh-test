# Password recovery Edge Function patch plan (REVIEW ONLY)

Target: TEST project `udptdznbvewkublvzmtm`, TEST repository branch `fix/trainee-password-recovery-ui-20261122`.
This document is a review artifact only. It is not deployed code. Do not execute SQL, deploy an Edge Function, send SMS, or merge this PR as part of this plan.

## Confirmed TEST schema

`public.trainee_password_recovery_requests` contains:
- `id uuid`, `trainee_id uuid`, `phone_normalized text`, `status text`
- `token_hash text null`, `token_expires_at timestamptz null`
- `token_attempts smallint not null default 0`
- `requested_at`, `reviewed_at`, `reviewed_by`, `completed_at`, `updated_at`

Constraints observed:
- Status values: pending, approved, processing, rejected, completed, expired.
- approved/processing require non-null token_hash and token_expires_at.
- pending/rejected require both token fields null.
- completed/expired allow null token fields.
- token_attempts is constrained to 0..10.

The proposed atomic RPC updates only an approved, unexpired row whose hash still matches and whose attempts are below 5. On the fifth mismatch it sets status=expired and clears token fields. This satisfies the observed state constraint.

## Required Edge Function edits (not applied)

### 1. Wrong-code branch

Replace the current read-then-write increment with the RPC call below, only after comparing the submitted code hash with the stored hash:

```ts
const { data: attemptRows, error: attemptErr } = await admin.rpc(
  "record_trainee_recovery_failed_attempt",
  {
    p_request_id: request.id,
    p_expected_token_hash: request.token_hash
  }
);
if (attemptErr) {
  console.error("recovery attempt counter failed", attemptErr.message);
  return reply({ error: "بررسی کد انجام نشد؛ کمی بعد دوباره تلاش کنید." }, 503);
}
const attempt = Array.isArray(attemptRows) ? attemptRows[0] : null;
if (!attempt?.accepted) {
  return reply({ error: "کد منقضی شده یا دیگر معتبر نیست؛ از مربی کد تازه بگیرید." }, 409);
}
return reply({ error: "کد بازیابی نادرست است." }, 400);
```

Do not fall back to a client-side increment if the RPC fails. That would reintroduce the race.

### 2. Correct-code claim

Change the claim predicate from `.lt("token_attempts", 10)` to `.lt("token_attempts", 5)`. Keep the existing conditional update predicates on request id, approved status, token hash, and expiry. The conditional update is the single-winner claim; if two correct submissions race, only one should move approved -> processing.

### 3. Expiry and processing recovery

The current function can leave a request in processing if the Auth password update succeeds but the final DB marker fails. It correctly avoids inviting reuse of the code, but needs an operational reconciliation path. Do not automatically return processing to approved: Auth may already have changed the password. A later maintenance path should inspect processing records and reconcile them without exposing secrets.

## SMS timeout: do not make a blind rollback

Current code returns an approved request to pending when the SMS fetch throws. A timeout is ambiguous: the provider may have accepted the SMS even though the function did not receive the response. Reverting to pending allows another approval to generate and send another code.

A safe correction needs an explicit delivery-state design, not just deleting the rollback:
- Add a delivery state such as queued / sent / uncertain / failed and a stable request/attempt identifier, or document provider-supported idempotency after confirming Mediana's actual contract.
- Keep the request non-pending after an ambiguous timeout so the coach cannot unknowingly approve it again.
- Provide a coach-visible retry action that generates a fresh code, atomically replaces the hash/expiry, and sends that new code. Any late-arriving older SMS then contains an invalid code.
- Never persist or return the plaintext code to the coach.
- Validate the real provider response schema before marking delivery as sent. An HTTP 2xx with an empty or unrecognized body must not be treated as confirmed delivery.

This requires a separate schema + UI + function change and should remain out of the current narrow UI PR until designed and tested.

## TEST-only verification checklist (no real SMS)

1. Static/type-check the proposed Edge Function source before deployment.
2. Exercise the RPC with synthetic rows in a disposable TEST fixture, not real trainee records:
   - attempts 0..3 increment by one and remain approved;
   - fifth mismatch expires the row and clears token fields;
   - sixth mismatch is rejected without increment;
   - expired token, wrong request id, wrong stored hash, and non-approved status do not increment;
   - two simultaneous mismatches cannot lose an increment;
   - a correct-code claim racing a mismatch has one consistent winner and never permits more than five attempts.
3. Exercise the request/reset/coach authorization paths using isolated synthetic coach and trainee identities.
4. Keep the SMS adapter mocked/stubbed. No outbound provider request and no real phone number.
5. Confirm the test Pages workflow is triggered only from `integration/full-app-mirror-20261115`; this feature branch does not trigger that deployment workflow.
6. Keep PR #15 Draft and unmerged until browser testing, database tests, and an explicitly authorized SMS test are completed.

## Current safety status

- No SQL has been executed or migrated.
- No Edge Function has been changed or deployed.
- No SMS has been sent.
- No production project or production repository has been written.
