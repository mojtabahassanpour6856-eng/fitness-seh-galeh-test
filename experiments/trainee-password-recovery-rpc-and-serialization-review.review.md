# Recovery RPC and request-serialization review — follow-up

Date: 2026-11-22  
Environment: TEST only; read-only catalog checks plus GitHub review artifacts.  
No schema or data was modified.

## 1. Corrected atomic failed-attempt draft

The earlier draft used `SET search_path = public, pg_temp`. That is not the required hardened configuration for a SECURITY DEFINER function. The updated draft now uses:

- `SET search_path = ''`
- fully qualified `public.trainee_password_recovery_requests`
- strict 64-character lowercase SHA-256 hash input validation
- a single conditional UPDATE that locks and increments the row atomically
- a hard limit of five attempts
- hash comparison in the UPDATE predicate so stale submissions cannot affect a rotated code
- explicit revocation from PUBLIC, anon, and authenticated
- EXECUTE granted only to service_role

The function remains in `public` for now because current TEST catalog permissions show:
- service_role has USAGE on public;
- service_role does not have USAGE on private;
- authenticated currently has USAGE on private, so moving a privileged function into private without a schema ACL review is not automatically safer.
The function's EXECUTE privilege is the key immediate restriction. A later migration may move internal RPCs to a non-exposed schema only after deliberate schema USAGE grants are designed and audited.

Supabase's current guidance recommends SECURITY INVOKER by default; where SECURITY DEFINER is necessary, pin `search_path` to empty, qualify object names, and narrowly restrict EXECUTE. See https://supabase.com/docs/guides/database/functions.

## 2. Catalog checks completed

Read-only catalog queries on TEST confirmed:
- recovery table owner is postgres;
- RLS is enabled and FORCE RLS is false;
- the existing unique partial index covers only pending and approved;
- existing `consume_registration_rate_limit` is owned by postgres, SECURITY DEFINER, has empty search_path, and EXECUTE is granted only to postgres and service_role;
- schema USAGE grants differ between public and private as described above.

No trainee or recovery-request row data was selected.

## 3. Request-creation race: recommended design

The current unique partial index is:

```sql
CREATE UNIQUE INDEX trainee_password_recovery_one_open_request_per_trainee
ON public.trainee_password_recovery_requests (trainee_id)
WHERE status IN ('pending', 'approved');
```

It does not cover `processing`. Therefore a new pending request can coexist with an older processing request.

Recommended target invariant:
- at most one request per trainee in pending, approved, or processing.

Implementation should be staged, not applied blindly:

1. Define the processing reconciliation policy first. A processing row must never be reopened merely because it is old; Auth may already have accepted the password change.
2. Read aggregate duplicate counts in a disposable TEST clone before creating a wider unique index. Do not inspect or expose trainee PII for this check.
3. Design an additive replacement partial unique index covering pending, approved, and processing.
4. Use an atomic `create_recovery_request` RPC that serializes per trainee and inserts only if no open request exists. Keep the unique index as the final integrity backstop.
5. Ensure all transitions to processing and all request creations obey the same invariant. Existing direct insert code must be removed in the Edge Function patch.
6. Add an explicit administrative reconciliation workflow for stale processing rows. Never silently change them to pending.

Do not simply widen the index before checking existing TEST state: pre-existing duplicates could make index creation fail. Do not use a time-based predicate in a partial unique index; PostgreSQL index predicates must be immutable and time-dependent expiration belongs in an explicit state transition.

## 4. Required atomic RPC boundaries

| RPC | Atomic responsibility | Critical predicate |
|---|---|---|
| `create_recovery_request` | serialize + insert one open request | trainee ID + no pending/approved/processing |
| `approve_and_queue_recovery` | approve and queue one SMS attempt | request pending + coach owns trainee |
| `record_recovery_delivery_result` | persist provider outcome | request ID + current attempt UUID + queued |
| `record_trainee_recovery_failed_attempt` | increment wrong-code count | approved + current hash + unexpired + attempts<5 |
| `claim_recovery_code` | consume valid delivered code once | approved + delivery_state=sent + hash + expiry + attempts<5 |
| `finish_recovery` | mark successful Auth reset complete | processing + same claim/attempt identifier |
| `reconcile_recovery_processing` | resolve uncertain Auth completion | verified Auth outcome; never age alone |

Every SECURITY DEFINER function needs:
- a documented reason it cannot safely be SECURITY INVOKER;
- fixed empty search_path;
- schema-qualified references;
- exact argument validation;
- explicit owner;
- EXECUTE revoked from PUBLIC, anon, authenticated;
- EXECUTE granted only to service_role (or a separately justified private role);
- cross-coach and unauthorized-call tests.

## 5. Important edge-case ordering

- Wrong-code and correct-code requests serialize on the same row. If the fifth wrong attempt wins first, the correct-code claim must fail because the row is expired. If the correct claim wins first, later wrong attempts must not mutate a processing row.
- A stale wrong-code request must include the expected token hash in its UPDATE predicate.
- A late provider response must include the attempt UUID in its UPDATE predicate.
- A new request must be blocked while an older row is processing.
- Auth success followed by database completion failure must not make the code reusable.

## 6. Current status

- Updated SQL draft: review-only, not executed.
- Existing active Edge Function: still version 10, unchanged.
- Database: no DDL/DML performed.
- SMS: no outbound calls.
- Auth: no password changes.
- Production project and main app: untouched.
