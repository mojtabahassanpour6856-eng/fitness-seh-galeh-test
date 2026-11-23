# Password recovery concurrency and race-condition audit — REVIEW ONLY

Date: 2026-11-22  
Scope: TEST Edge Function `trainee-password-recovery` version 10 and TEST schema metadata.  
No rows modified, no function deployed, no SMS or Auth operation performed.

## Concurrency review

### A. Two coaches approve the same pending request

Current behavior:
- Both requests can read status=pending.
- The subsequent UPDATE includes `.eq("status","pending")` and returns the changed row.
- Only one UPDATE can transition the row; the other should receive no row and return conflict/error.
Assessment: the conditional UPDATE protects the state transition. Keep it.

### B. Two correct reset attempts arrive simultaneously

Current behavior:
- Both may read the same approved token.
- Both calculate the same hash.
- The conditional UPDATE claims approved -> processing and checks the token hash/expiry.
- Only one request can win the conditional transition.
Assessment: single-use claim is structurally sound. Tighten attempts predicate from <10 to <5, and additionally require delivery_state='sent' after the delivery-state migration.

### C. Multiple wrong codes arrive simultaneously

Current behavior:
- Edge Function reads token_attempts, increments in TypeScript, then writes the new value.
- Concurrent requests can read the same old count and overwrite each other.
Assessment: unsafe lost-update race. Replace with one SQL UPDATE/RPC that increments under row lock and checks id, approved status, exact expected hash, expiry, and attempts <5 in the same statement. A stale hash must not increment a newly rotated token's counter.

### D. Two recovery requests are submitted for the same trainee

Current behavior:
- Request handler checks for pending/approved, then inserts pending.
- The partial unique index protects pending/approved from duplicate insertion even if both requests pass the pre-check.
Assessment: duplicate pending/approved requests are protected by the unique index; preserve it.

### E. New request while an older request is processing

Current behavior:
- Request pre-check only looks for pending/approved.
- Unique partial index only covers pending/approved, not processing.
- A request in processing can therefore coexist with a new pending request.
Assessment: real gap. Before implementation, define processing recovery/reconciliation. Do not simply add processing to a unique index without a recovery policy: a stuck processing row could block the trainee forever. Prefer a dedicated atomic request-creation RPC that treats pending/approved/processing as open, plus a carefully authorized stale-processing reconciliation flow based on Auth outcome. Never automatically revert processing to approved or pending.

### F. Provider timeout followed by coach retry

Current behavior:
- Version 10 resets approved to pending and clears the hash on transport failure/timeout.
- This loses the fact that the provider may have accepted the message.
Assessment: unsafe ambiguity. Keep a durable delivery attempt record/state. A timeout becomes uncertain. Do not send the same code again. A coach retry must rotate the code and delivery attempt ID, atomically invalidate the old hash, and must not occur until the previous attempt has been reconciled or the user explicitly accepts the risk of a duplicate SMS.

### G. Auth password update succeeds but completion marker fails

Current behavior:
- Function logs the completion marker failure but still returns success.
- The row may remain processing with a still-present hash.
Assessment: returning success is user-friendly because the password has already changed, but the database requires reconciliation. Do not make the code reusable. Add an explicit reconciliation path that verifies Auth state only through a safe, supported method; do not guess based on processing age alone.

### H. Coach rejects while another review/approval is in flight

Current behavior:
- Both reject and approve updates require status=pending.
Assessment: conditional updates prevent both transitions from winning. Preserve the condition and use conflict responses for losers.

## Required atomic operations before production

1. `create_recovery_request`: enforce one open request across pending/approved/processing; enforce rate-limit separately; return generic response to avoid phone enumeration.
2. `approve_and_queue_recovery`: atomically validate pending + coach ownership context, set approved, token hash/expiry, attempts=0, delivery_state=queued, new attempt UUID, reviewer.
3. `record_recovery_delivery_result`: compare request id + attempt UUID; ignore stale provider responses; record sent/failed/uncertain only from queued.
4. `record_recovery_wrong_attempt`: atomically increment to max five only for current approved token.
5. `claim_recovery_code`: one-time approved -> processing transition, requiring sent state, current hash, unexpired token, attempts<5.
6. `reconcile_recovery_processing`: handle Auth success / failure / unknown without blindly reopening a possibly consumed token.

## Synthetic concurrency test matrix (not run)

- 20 concurrent approvals of one pending request: exactly one winner.
- 20 concurrent correct-code claims: exactly one winner.
- 20 concurrent wrong-code submissions: counter increments monotonically and expires at exactly 5.
- Stale wrong-code request racing with token rotation: old hash cannot increment the new token's counter.
- Two request creations for one trainee: one open request only.
- New request while processing: rejected as already in progress.
- Old provider response arriving after retry: attempt UUID mismatch means ignored.
- Timeout after provider accepted: state remains uncertain, not pending.
- Auth password update succeeded but completion DB write failed: code remains non-reusable; reconciliation needed.
- Coach A attempts to review Coach B's trainee: denied.
- All tests use synthetic fixtures in a disposable TEST clone, never real trainee rows or SMS.

## Important distinction

The current SQL catalog and function source support the findings above. No claim is made that these concurrency tests have been executed. The existing active Edge Function remains version 10 and is unchanged.

## Safety boundary

Review/documentation only. No DDL/DML, no Edge Function edit/deploy, no SMS, no password change, no PR merge, and no production operation.
