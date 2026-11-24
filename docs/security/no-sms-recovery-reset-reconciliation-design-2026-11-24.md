

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
- **CAS/fencing:** stale attempt IDs cannot mark, release, finalize, or clear a newer row; in this policy no new trainee attempt is allowed after ambiguity anyway.
- **State/permission tests:** no trainee, coach, anon, or authenticated client can manually clear reconciliation state; only the audited operator path can do so.
- Assert in every ambiguous/crash case that the fake Auth call count never increases after the first dispatch.

### Release gate

No migration, function deployment, feature-flag activation, real SMS, or real password update is authorized by this design work. The candidate remains blocked until the SQL state constraint/RPCs, Edge Function, deterministic fake-Auth tests, PostgreSQL integration tests, and CI all implement and prove this fail-closed policy. Production/main and the live Supabase project remain untouched.
