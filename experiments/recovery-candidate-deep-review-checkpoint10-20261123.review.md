# Recovery Candidate Deep Review — Checkpoint 10 (2026-11-23)

Scope: static inspection only of the three experimental migration candidates on the main repository experiment branch. No migrations were run, no Supabase project was modified, no deployment/SMS/Auth action occurred, and no real recovery row was read.

## Files reviewed
- `docs/experimental/migrations/20261122_recovery_atomic_rpc_candidate.sql`
- `docs/experimental/migrations/20261122_recovery_outbox_worker_candidate.sql`
- `docs/experimental/migrations/20261122_recovery_encrypted_delivery_payload_candidate.sql`

## Positive structural observations
- Request approval and delivery operation are represented separately; encrypted candidate requires a caller-provided operation UUID and envelope.
- Outbox claim uses row locking with `SKIP LOCKED`, worker lease, and generation counter.
- Begin-send is guarded by active lease/generation and send-start null, and updates request and outbox inside one transaction.
- Payload retrieval requires lease ownership/generation, a send-start marker, matching request/outbox operation and ciphertext, and approved/attempting state.
- Expired processing leases before send-start can be reclaimed; after send-start the reconciliation path marks delivery unknown rather than automatically sending again.
- Service-role grants are explicit and public wrappers revoke execution from PUBLIC/anon/authenticated. Candidate must still be validated against actual owner/role behavior in disposable PostgreSQL.

## Findings / gates
1. **Wrong-code threshold is caller-configurable.** `record_recovery_wrong_attempt(..., p_max_attempts)` accepts 1–10. Enforce a fixed server-side threshold (currently intended five) or trusted server configuration; never accept a client-selected value.
2. **Wrong-code attempt state guard is incomplete.** The candidate RPC updates attempts for requests in approved state but does not require `delivery_outcome='sent'`. Add that guard and test rejected/unknown/failed delivery states cannot consume or validate recovery attempts.
3. **Delivery completion and request state require concurrency tests.** Candidate `finish_recovery_outbox` transitions request then outbox, relying on transaction rollback if the second update fails. Test atomic rollback and stale lease/generation behavior.
4. **Payload clearing and trigger order require runtime validation.** Request and Outbox terminal triggers clear encrypted payload; verify trigger interaction with enqueue/finish/reconcile, no payload resurrection, and no lingering ciphertext in terminal states.
5. **Security-definer wrapper contract needs disposable-role tests.** Verify owner, fixed empty search_path, direct private-function execution denial, wrapper ACLs, service_role only, and that Edge binds actor identity from verified JWT rather than caller-supplied actor ID.
6. **Encryption acceptance is only static.** Test AES-GCM tampering, key-id rotation, IV uniqueness, AAD binding to request and operation IDs, strict envelope validation, and absence of plaintext/code in logs.
7. **Unknown delivery is intentionally non-retryable automatically.** UX and coach workflow must explicitly handle unknown outcome without automatic resend; test reconciliation and manual resolution.

## Test readiness
- The existing mirror CI is legacy-RPC compatibility coverage and does not compile/run the three candidate migrations.
- Candidate-specific disposable PostgreSQL harness is still required before any migration or Edge implementation is considered test-ready.
- No release gate is passed by this static review.

## Safety status
- Mirror PR #15 remains draft/unmerged.
- Main branch untouched.
- Supabase projects untouched.
- No paid services, real SMS, Auth reset, or live recovery flow.
