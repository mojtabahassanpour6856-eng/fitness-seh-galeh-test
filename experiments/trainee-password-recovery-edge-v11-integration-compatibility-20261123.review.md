# Edge v11 integration compatibility review — 2026-11-23

Status: REVIEW ONLY. No Edge Function deployed, no SQL executed, no SMS/provider request, no Auth password change.

## Scope and live-function safety

The currently active TEST function remains `trainee-password-recovery` version 10, `verify_jwt=false`, SHA-256 `f9bbda8b8d0f38d266fe009a0492ca5008f7f1fc4bd531bf60f70ec302331678`. Its source directly references `MEDIANA_API_KEY` and `https://api.mediana.ir/sms/v1/send/pattern`. Do not overwrite or redeploy this function. Mediana remains out of scope.

## Important architecture mismatch found

There are two incompatible candidate contracts in the current work:

### TEST mirror PR #15 draft contract
- `create_trainee_recovery_request(p_trainee_id, p_phone_normalized)`
- `approve_and_queue_trainee_recovery(p_request_id, p_coach_user_id, p_token_hmac, p_expires_at, p_attempt_id)`
- `claim_trainee_recovery_code(p_request_id, p_expected_token_hmac)`
- `record_trainee_recovery_failed_attempt(p_request_id, p_expected_token_hash)`
- `record_trainee_recovery_delivery_result(p_request_id, p_attempt_id, p_result)`
- `finish_trainee_recovery(p_request_id, p_expected_token_hmac)`
- Table delivery metadata is only `delivery_state`, `delivery_attempt_id`, `delivery_started_at`, `delivery_updated_at`.
- Approval stores a token HMAC and marks delivery `queued`, but there is no encrypted payload/outbox table or worker claim lease in this draft.

### Main-repository candidate PR #260 contract
- Handler calls `recovery_submit_request`, `recovery_coach_review_encrypted`, `recovery_claim_reset`, `recovery_record_wrong_attempt`, `recovery_begin_auth_update`, and `recovery_finish_auth_update`.
- It persists an AES-256-GCM encrypted code envelope in a transactional outbox and uses operation IDs, HMAC key versions, Auth outcome markers, worker leases and reconciliation states.
- Its Edge handler and worker are dependency-injected candidates and have their own mock/isolated tests.
- It is also Draft/unmerged and must not be treated as deployed or production-ready.

These RPC names and parameters are not interchangeable. Copying the main handler into the mirror or merely changing RPC names would be unsafe. The mirror approval draft currently has nowhere durable and encrypted to store the plaintext code for a later SMS worker. Returning `queued` without an encrypted outbox payload would create a request that can never safely deliver its code. Sending directly from the HTTP handler would reintroduce timeout ambiguity and retry hazards.

## Additional contract issue: HMAC binding

The mirror crypto primitive computes HMAC over request ID + attempt ID + code. The mirror SQL draft currently stores a token hash and delivery attempt ID, but the reset lookup/claim contract must fetch and validate the exact attempt ID and key version before recomputing the HMAC. The current mirror core RPC list does not yet define a complete, tested reset-claim/auth-outcome lifecycle matching that requirement.

## Required decision before writing Edge v11 adapter

Use one canonical state machine, not two partially compatible implementations. Recommended path is to port/adapt the already tested main candidate's outbox architecture into the TEST mirror branch, then run its disposable PostgreSQL and mock-worker suites against the mirror's actual fixture. This requires a deliberate schema/RPC migration draft for the mirror, not an ad-hoc adapter.

Required mirror-side components before an Edge adapter can be considered integration-ready:
1. Transactional encrypted delivery outbox with unique operation ID, request ID, attempt ID, ciphertext envelope, key version, state, lease generation, and timestamps.
2. Atomic coach approval RPC that locks trainee ownership/reassignment and inserts the encrypted outbox row in the same transaction.
3. Worker-only claim/start/heartbeat/complete RPCs with lease fencing and service-role-only grants.
4. Provider outcome semantics: confirmed acceptance => `sent`; definite rejection => `failed`; timeout/unknown => `uncertain`; never auto-retry an ambiguous send.
5. Reset claim, failed-attempt, Auth begin/finish, and reconciliation RPCs all bound to the same attempt and HMAC key version.
6. Edge HTTP adapter with strict origin allowlist, bearer coach authentication, generic public request response, no-store responses, request-size limits, redacted errors, and no direct provider calls.
7. Fake-provider-only tests for acceptance, definite failure, timeout after simulated acceptance, late response, duplicate worker, expired lease, stale worker, and encrypted payload authentication failure.

## Safe work completed / not completed

- Existing TEST v10 source retrieved read-only and fingerprint recorded above.
- Main PR #260 handler/adapter/crypto candidate reviewed read-only.
- Mirror SQL RPC names and delivery schema compared with the main candidate.
- No new Edge handler was added because it would have to guess or silently bridge incompatible contracts.
- No function deployment, SQL migration, SMS, Auth update, or production write occurred.

## Current gate

Disposable SQL/crypto/security/lifecycle/concurrency CI on mirror PR #15 passes. Edge integration is **blocked on canonical outbox/state-machine alignment**, not on TypeScript syntax. Keep PR #15 Draft and unmerged; keep active v10 untouched.
