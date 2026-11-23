# Recovery v11 mirror porting map — 2026-11-23

Status: REVIEW ONLY. This is a static integration map, not an executable migration plan or deployment approval.

## Fresh checkpoint

- Mirror PR #15 remains open, Draft, and unmerged.
- Mirror branch head at review time: `473871462ca3818f59a34971d9f7a55684960633`.
- Mirror CI run `45069274089` (run #63) completed successfully. Both jobs passed:
  - disposable PostgreSQL SQL compile/security/lifecycle/concurrency job;
  - isolated recovery crypto unit tests.
- Main-repository PR #260 remains a separate Draft candidate. It is not a deployed canonical implementation.
- No Supabase SQL was run and no Edge Function was deployed.

## Exact candidate migration dependency chain (main PR #260)

Static inspection found that the encrypted outbox is split across multiple candidate migrations. The files are not interchangeable with the mirror's existing RPC draft.

1. `20261122_recovery_atomic_rpc_candidate.sql`
   - extends recovery request state and creates the private rate-limit/core state machine;
   - adds request submission, coach review, wrong-attempt, reset-claim, and Auth begin/finish RPC wrappers;
   - replaces the one-open-request index to include `processing`.
2. `20261122_recovery_outbox_worker_candidate.sql`
   - creates `public.trainee_password_recovery_outbox`;
   - creates lease claim, heartbeat, begin-send, finish, and expired-lease reconciliation RPCs;
   - uses worker ID + lease generation fencing and a stable provider idempotency key.
3. `20261122_recovery_encrypted_delivery_payload_candidate.sql`
   - adds encrypted AES-256-GCM payload envelope storage;
   - adds `recovery_coach_review_encrypted`;
   - adds transactional enqueue/trigger logic and worker-only payload fetch;
   - restricts direct table writes and grants service-role access to the required wrappers.

The encrypted-payload migration alters the outbox table, so it depends on the outbox migration. The outbox migration depends on the recovery request table and base columns from the atomic/core migration. The three files must be reviewed and tested as one ordered set, not cherry-picked independently.

## RPC contract map for the mirror adapter

| Concern | Main candidate RPC contract | Mirror PR #15 draft |
|---|---|---|
| Submit request | `recovery_submit_request(p_phone_normalized)` | `create_trainee_recovery_request(p_trainee_id,p_phone_normalized)` |
| Coach approval | `recovery_coach_review_encrypted(...,p_delivery_operation_id,p_delivery_payload)` | `approve_and_queue_trainee_recovery(...,p_attempt_id)` |
| Worker claim | `recovery_outbox_claim(p_worker_id,p_lease_seconds)` | No equivalent |
| Worker heartbeat | `recovery_outbox_heartbeat(p_outbox_id,p_worker_id,p_generation,p_lease_seconds)` | No equivalent |
| Worker send-start | `recovery_outbox_begin_send(p_outbox_id,p_worker_id,p_generation)` | No equivalent |
| Worker payload | `recovery_outbox_fetch_payload(p_outbox_id,p_worker_id,p_generation)` | No equivalent |
| Worker finish | `recovery_outbox_finish(...,p_outcome,...)` | `record_trainee_recovery_delivery_result(...)` (not lease-fenced) |
| Reset claim | `recovery_claim_reset(p_request_id,p_code_digest,p_operation_id)` | `claim_trainee_recovery_code(p_request_id,p_expected_token_hmac)` |
| Auth begin/finish | `recovery_begin_auth_update` / `recovery_finish_auth_update` | `finish_trainee_recovery` only; no equivalent operation lifecycle |

Conclusion: do not adapt the Edge handler by renaming RPC calls. The mirror needs a reviewed schema/state-machine port first.

## Porting blockers before any Edge v11 adapter

1. **Existing data preflight:** the mirror recovery table already contains historical state, including an expired row. A future migration must inspect all rows, existing constraints/indexes, duplicate open requests, and current ownership before changing constraints or indexes. Do not delete or rewrite the historical row as cleanup.
2. **Index transition safety:** the candidate core migration drops/recreates the one-open-request unique index and expands its predicate to include `processing`. This needs a duplicate-state preflight and an explicit lock/downtime assessment against the real mirror schema before it can be considered safe.
3. **Schema parity:** verify every referenced column, enum/check constraint, FK, extension, role, and function owner against the mirror. Candidate SQL was tested in disposable PostgreSQL, not applied to the mirror.
4. **Security model:** verify private-schema exposure settings, SECURITY DEFINER owners/search_path, wrapper EXECUTE grants, table SELECT grants, and service-role-only worker functions in a disposable Supabase-compatible environment. The candidate uses public wrappers because PostgREST exposure is normally public; this must be validated rather than assumed.
5. **Atomic enqueue:** prove coach approval and encrypted outbox enqueue commit or roll back together, including coach reassignment races and duplicate approval.
6. **Worker safety:** prove stale lease generations cannot heartbeat, start, or finish; ambiguous provider outcomes remain terminal/unknown and are never automatically resent.
7. **Reset/Auth consistency:** bind the code digest to the stored HMAC key version and the same request/attempt/operation; prove wrong-attempt limits, one-time claim, Auth outcome reconciliation, and no retry after ambiguous Auth update.
8. **Provider contract:** provider remains unselected. Do not connect Mediana. Any provider adapter must document idempotency, accepted/rejected/timeout semantics, receipt lookup, and manual reconciliation before a live test.
9. **Runtime integration:** only after the SQL contract is aligned, add a dependency-injected Edge adapter and test it against the exact mirror RPC schema using fake provider/Auth clients.
10. **Release gates:** disposable PostgreSQL + local Supabase Auth + browser testing with dedicated synthetic accounts + staging migration/deploy rehearsal + explicit approval. CI success alone is not release approval.

## Safety boundary retained

- Do not run these candidate migrations on the mirror or production.
- Do not alter the active TEST Edge Function v10.
- Do not send real SMS or change any Auth password.
- Do not call Mediana.
- Keep PR #15 and PR #260 Draft/open/unmerged.
- Preserve all existing trainee data, including expired recovery history.
