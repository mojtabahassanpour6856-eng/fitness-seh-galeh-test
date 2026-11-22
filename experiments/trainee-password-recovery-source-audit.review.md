# Trainee password recovery — source audit findings (TEST only)

Date: 2026-11-22  
Target: Supabase TEST project `udptdznbvewkublvzmtm`, active Edge Function version 10  
GitHub review branch: `fix/trainee-password-recovery-ui-20261122`

This is a review artifact only. It does not modify the active function, database, secrets, users, or SMS provider.

## Confirmed source-level findings

### P0 — SMS delivery is ambiguous after timeout
The coach approval path first changes the request from `pending` to `approved`, stores the code hash, and then calls Mediana with a 5-second abort timeout. On fetch exception, the current code resets the request to `pending` and clears the token. A timeout does not prove that Mediana did not accept the SMS; a delayed message may still arrive. Retrying approval can therefore send another code and create confusing delivery behavior.

**Required design:** persist a delivery state separate from approval state (for example `queued`, `sent`, `uncertain`, `failed`), preserve an attempt identifier, and never treat a network timeout as definite non-delivery. Retry must atomically rotate the token hash/expiry before sending a new code. Confirm whether Mediana supports idempotency or message-status lookup before claiming exactly-once delivery.

### P0 — HTTP 2xx response can be accepted without proof of delivery
The current response check rejects non-2xx, explicit non-success `meta.code`, and `data.succeed === false`; it can still accept an empty or unknown JSON body with HTTP 2xx.

**Required design:** validate the documented Mediana success schema strictly. Unknown, empty, or malformed provider responses should be classified as `uncertain`, not `sent`.

### P1 — Wrong-code attempt counter is not atomic
The current implementation reads `token_attempts`, calculates +1 in TypeScript, then updates by id/status/hash. Concurrent wrong-code requests can overwrite one another. The review-only RPC proposal in `trainee-password-recovery-atomic-attempts.review.sql` is intended to serialize the increment in one database UPDATE. It has not been executed or syntax-tested.

### P1 — Claim threshold disagrees with precheck
The reset path rejects `token_attempts >= 5` before verification, but the correct-code claim uses `.lt("token_attempts", 10)`. Align the claim predicate to 5 as documented in the SQL review file.

### P1 — Approval transition and delivery are not one recoverable workflow
The current code approves and stores a token before calling SMS. Missing API key/invalid recipient or provider failure resets the row to pending. This loses the distinction between a definite configuration failure and an uncertain delivery outcome. The DB has a unique partial index for only `pending` and `approved` requests; `processing` is not covered by that index.

### P2 — Random code generation
The function derives a four-digit code from a 32-bit random value using modulo operations. Use rejection sampling (or a vetted cryptographic helper) to avoid modulo bias. The code is short by design, so retain strict attempt limits, expiry, rate limits, and one-time use.

## TEST database metadata observed (read-only)

- Foreign key `trainee_id` references `trainees(id)` with ON DELETE CASCADE.
- `reviewed_by` references `auth.users(id)`.
- Unique partial index enforces one request per trainee only while status is `pending` or `approved`.
- Indexes exist for reviewer lookup and status/requested_at.
- No non-internal trigger was returned for this table.
- No table rows were selected or changed.

## Required test cases before any implementation/deploy

1. Wrong code attempts 1–4 increment exactly once each.
2. Fifth wrong code atomically changes status to `expired` and clears token hash/expiry.
3. Two concurrent wrong-code requests cannot lose an increment or exceed the limit.
4. Correct code succeeds only when status is `approved`, token is unexpired, and attempts < 5.
5. Two concurrent correct-code requests: exactly one claims the request.
6. A code cannot be reused after successful password update.
7. A definite Auth password-update failure does not falsely mark the request completed.
8. If Auth update succeeds but completion marker fails, response and recovery state remain safe; no code reuse is possible.
9. SMS timeout is recorded as uncertain; request is not silently reset to pending.
10. HTTP 2xx with empty/malformed/unknown provider body is not marked sent.
11. Explicit provider rejection is recorded as failed without exposing the code.
12. Retry rotates the token atomically; a late-arriving older SMS code is rejected.
13. Coach can only list/review requests belonging to their own trainees.
14. Coach response/UI never contains plaintext recovery code or a copy action.
15. No test invokes a real SMS, changes a real Auth password, or uses a real trainee.

## Current safety boundary

- Edge Function version 10 was read only; no source was changed or deployed.
- TEST database metadata was read only; no SQL write, migration, or row access occurred.
- No SMS was sent and no API secret value was read.
- Main project `qfakyudgidsumeuoqoot` was not accessed.
- This document is review guidance, not an implementation or approval to deploy.
