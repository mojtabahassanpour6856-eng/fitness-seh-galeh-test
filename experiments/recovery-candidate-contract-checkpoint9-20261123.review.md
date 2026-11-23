# Recovery Candidate Contract Review Checkpoint 9 — 2026-11-23

## Scope
Read-only static review of the main-repository experimental candidate migration trio (atomic RPC, Outbox/Worker lease protocol, encrypted delivery payload) to identify concrete contracts that candidate tests must assert. This is not an execution test. No DBs, migrations, secrets, SMS, or accounts were changed.

## Candidate integration flow confirmed by source
- Coach approval in the encrypted candidate receives a pre-generated delivery operation UUID and a strict encrypted envelope, stores both on the request, and triggers an Outbox insert in the same transaction.
- Outbox claims only eligible pending records or expired pre-send processing records; claims use SKIP LOCKED and increase lease generation.
- Begin-send is tied to the current owner/generation/lease and requires send_started_at null; it atomically transitions request delivery_outcome pending -> attempting and outbox send_started_at.
- Payload fetch requires current processing lease/generation, send-started, approved request, matching operation, attempting outcome, and payload equality on request and outbox.
- Finish requires send-started and a valid lease; sent/failed/unknown update request and outbox. Terminal payload-clearing triggers remove encrypted payload after sent/failed/unknown.
- Reconciliation converts expired post-send-start processing records to unknown rather than blindly retrying.

## Candidate-specific invariants to test (static contract; tests not run)
1. Approval with malformed/missing envelope, mismatched operation, unknown kid, or invalid base64/length is rejected; approval must not leave partial request/outbox state.
2. Outbox trigger inserts exactly one row per immutable delivery operation; payload equality enforced; duplicate operation cannot create another item.
3. No worker can fetch/decrypt payload before begin-send; expired lease or stale generation cannot fetch, heartbeat, begin, or finish.
4. Lease reclaim is permitted only before send-start; after send-start expiry reconciles to unknown, with no automatic retry.
5. A confirmed failure clears payload/token and allows a new coach approval only with a new operation and idempotency key; previous Outbox record is terminal.
6. Successful send clears both payload copies; unknown clears both payload copies and remains non-resendable; request/outbox terminal state changes must be atomic.
7. Wrong-code counter must be hard-capped server-side at five and require delivery outcome sent. Existing candidate review notes that the helper parameterization and sent prerequisite require hardening/validation.
8. Test envelope key rotation and ciphertext tampering, including AAD bound to request + delivery operation. Ensure plaintext never reaches SQL logs, worker logs, or error responses.
9. Explicitly test concurrent approval, worker claim, lease expiry/reclaim, send-start and reconciliation boundaries with deterministic synchronization.

## Test workflow gap
The mirror's current CI applies the legacy compatibility RPC scripts and does not run this candidate migration trio. Do not interpret legacy CI success as candidate coverage.

## Gate status
Candidate migration trio remains unexecuted and unapproved. Required next: contract/schema mapping, dedicated disposable-Postgres candidate fixture and tests, then static/ACL review of worker entrypoints before any controlled mirror deployment.
