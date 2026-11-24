# Recovery candidate SQL review checkpoint 4
Date: 2026-11-23

## Scope
Read-only review of three experimental migration files in main repository branch `experiment/trainee-password-recovery-mock-20261122`. No SQL was executed, no migrations applied, and no main/mirror database changes made.

Files reviewed:
- `20261122_recovery_atomic_rpc_candidate.sql`
- `20261122_recovery_outbox_worker_candidate.sql`
- `20261122_recovery_encrypted_delivery_payload_candidate.sql`

## Confirmed positive controls
- Candidate private functions consistently declare `SECURITY DEFINER` and an empty `search_path`; they operate within `recovery_private`.
- Public wrappers revoke execution from `PUBLIC, anon, authenticated` and explicitly grant `service_role` where listed.
- Outbox worker operations are lease/generation-based; fetch-payload function binds worker id, generation, active lease, request/delivery operation, and sent-start status.
- The encrypted delivery candidate enforces a JSON envelope shape for AES-256-GCM with key id, IV and ciphertext; ciphertext is copied into outbox and terminal-state triggers clear it.
- Candidate migrations include explicit guards for duplicate active requests and existing approved/processing requests before applying the atomic-RPC candidate.

## Review observations / follow-up gates
1. **Actor identity trust boundary:** RPCs take `p_actor_user_id` explicitly. The SQL checks coach role and assigned-coach relationship, which is good, but the eventual Edge Function must derive this actor from a verified JWT/session and never accept a client-supplied actor id as authoritative. Must add a negative test attempting forged coach identity.
2. **SECURITY DEFINER ownership/ACL proof:** `search_path=''` is present, but migration execution ownership and function ACL must be validated in a disposable PostgreSQL instance. Catalog visibility in the live mirror was inconclusive.
3. **Public wrapper security:** The `recovery_coach_review_encrypted` and worker payload wrapper are SECURITY DEFINER; verify exact owner and ACL after migration. Their intended EXECUTE grants are service_role only, but cannot be accepted until test catalog inspection confirms.
4. **Encrypted payload lifecycle:** confirm ciphertext clearing is safe across sent/failure/unknown outcomes and verify trigger behavior with tests; no plaintext should be logged or persisted.
5. **Operational retries/idempotency:** exercise delivery lease expiry before/after send-start, duplicate claims, stale generation calls, and confirmed failure vs unknown outcomes in disposable PostgreSQL.
6. **Function visibility:** live mirror catalog lookup returned no expected routines; treat this as visibility/absence unresolved, not a finding of deployed absence.

## Status
This review is static only. It is not a release approval. Gate 1 remains incomplete; Gates 2–6 remain pending. No real SMS, auth mutation, data mutation, migration, deployment, PR merge, or production/main change occurred.
