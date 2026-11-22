# Recovery v11 RPC static review findings

Date: 2026-11-22
Scope: source review only; no SQL parser or PostgreSQL execution was available. No database was modified.

## Findings

### F01 — Migration is intentionally one-shot, not rerunnable
`trainee-password-recovery-delivery-metadata-migration.review.sql` uses `ADD CONSTRAINT` without a catalog guard and creates the stronger unique index without `IF NOT EXISTS`. A second run will fail after the first successful run. This is acceptable only if treated as a versioned one-time migration with a recorded migration ID; do not rerun manually. A preflight must check constraint/index names and definitions before execution.

### F02 — Unique-index widening is blocked by the stale approved row
The TEST aggregate audit still shows one `approved` row whose token is expired. Since the stronger index includes `approved`, the row remains open until the separate expiry-reconciliation SQL is explicitly approved and applied. The migration must not silently rewrite that row or set delivery_state='sent'.

### F03 — Locking model needs precise documentation
Request creation and approval use a per-trainee advisory transaction lock. Single-row transitions (claim, failed-attempt increment, delivery-result recording, finish) rely on conditional atomic UPDATE predicates and PostgreSQL row locks. Do not claim that every RPC uses the advisory lock; instead, document which transitions use the advisory lock and which use row-level compare-and-set. Keep a consistent order wherever both locks are used.

### F04 — Atomic failed-attempt SQL is compare-and-set, but caller contract is critical
The RPC requires the expected stored HMAC, status approved, unexpired token, delivery_state='sent', and attempts<5. The Edge Function must obtain the current stored HMAC using service_role and pass that expected value; it must never pass the submitted wrong-code HMAC. If the stored hash is not available, fail closed and do not increment via a local fallback.

### F05 — Claim/finish split is appropriate but not a cross-system transaction
The claim RPC atomically changes approved→processing. Supabase Auth password update is outside that database transaction. Finish must occur only after Auth confirms success. If Auth outcome or finish is ambiguous, leave the request non-reusable and reconcile; never blindly restore approved.

### F06 — Delivery-state meaning must stay narrow
`sent` means provider acceptance only when Mediana's documented response semantics support that conclusion. It does not prove handset delivery. Timeout or undocumented/empty 2xx remains `uncertain` until the provider contract is confirmed.

### F07 — Delivery metadata constraint does not enforce state/attempt consistency
The current check permits `delivery_state='queued'` with a NULL attempt ID, and permits `sent`/`uncertain`/`failed` without timestamps. Application RPCs set the fields together, but stronger CHECK constraints are recommended after deciding legacy-row handling. Avoid a constraint that accidentally rejects the existing NULL legacy row.

### F08 — Approval RPC should serialize coach/trainee ownership changes if those can occur concurrently
The approval RPC checks coach ownership and trainee eligibility in its UPDATE statement, which is good. If trainee reassignment or phone changes can occur concurrently, consider `SELECT ... FOR SHARE` on the trainee row after acquiring the advisory lock and before the request update, using a globally documented lock order. Verify actual update flows before adding locks to avoid deadlocks.

### F09 — Core RPCs do not yet provide complete lifecycle
Missing final pieces include an explicit safe reconciliation RPC, request/reset rate-limit integration, HMAC verification helper contract, and a provider correlation/observability model. Do not deploy the current SQL drafts as a complete v11 implementation.

## Required next corrections
1. Treat metadata migration as a versioned one-shot migration and add a read-only catalog preflight.
2. Define exact state/attempt/timestamp invariants, including legacy NULL rows.
3. Reconcile the expired approved row only after explicit approval.
4. Compile all SQL in a disposable PostgreSQL instance with PL/pgSQL extra warnings/errors enabled.
5. Implement and test Edge Function v11 as a separate source patch with a hard fake-provider switch; no live Mediana route in automated tests.
6. Keep all test execution isolated from the TEST Supabase project until source/SQL compile gates pass.

## Explicit safety status
No SQL function was created in Supabase, no migration was run, no Edge Function was deployed, no secret was read or changed, no SMS was sent, no password was changed, and no production file or database was modified.
### F10 — Targeted ON CONFLICT is safer than a broad exception, but depends on the future index
The create RPC was revised to use `ON CONFLICT (trainee_id) WHERE status IN ('pending','approved','processing') DO NOTHING RETURNING id`. This avoids catching unrelated unique violations as `already_open`. PostgreSQL supports inference of partial unique indexes when the conflict predicate matches the index predicate. This RPC must remain disabled until the widened partial unique index exists; against the current narrower index, a concurrent processing row is not protected by this target. See PostgreSQL INSERT documentation.

### F11 — Delivery-result RPC needs stricter input/state contract review
The delivery-result RPC uses a conditional update keyed by request ID, attempt UUID, approved status, and queued state, which prevents a late result from overwriting a later attempt. Before compile, add explicit argument validation and confirm that the table check permits only the intended values. Consider storing a provider correlation ID only after Mediana confirms its exact response field and privacy/retention requirements. Do not store full raw provider responses.

### F12 — Finish RPC must not be treated as proof of Auth success
The finish RPC itself cannot verify that Supabase Auth changed the password; it trusts the service-role Edge Function call. Keep it private to service_role and call only after a confirmed Auth success response. If the Auth result is ambiguous, do not call finish and do not reopen the request.

### F13 — Request and reset rate limiting are not yet symmetric
The v10 request path has a phone-keyed rate limit. Reset needs its own limit across phone/request and possibly source/IP dimensions, with privacy-preserving keyed hashes and generic responses. Avoid creating a new high-cardinality table or exposing registered-phone status. Confirm the intended policy and storage before implementation.
