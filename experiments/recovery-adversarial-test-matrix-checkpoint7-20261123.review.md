# Recovery adversarial test matrix checkpoint 7
Date: 2026-11-23

## Environment and scope
Reviewed existing draft PR #15 test harness and standalone v11 primitive tests. All work remains in the mirror PR branch. This checkpoint adds test requirements only; no code execution against Supabase, no real SMS/Auth actions, no live data changes.

## Existing CI coverage found
- PostgreSQL concurrency script currently exercises the older candidate RPC names/schema: 20 concurrent request creation, 20 failed-code increments (exactly 5 accepted), 20 correct-code claims (exactly one claim), and coach reassignment race.
- Security assertions validate expected RPC count, postgres owner, SECURITY DEFINER, empty search_path, service_role execute, and anon/authenticated/public execute denial.
- v11 primitive tests exercise canonical UUID validation, 4-digit code format/range, unbiased rejection sampling, invalid random source rejection, deterministic HMAC test vector, request/attempt/code binding, MAC comparison, and malformed/short pepper rejection.

## Gap: these tests do not yet validate the newer candidate SQL and encrypted delivery/outbox contract
Do not treat the existing CI run as coverage for the newer private RPC/outbox/encrypted payload candidate migrations. Names and interfaces differ.

## Required additional tests before Gate 3
### Crypto primitives
- GCM ciphertext/tag tampering, IV tampering, wrong AAD/request UUID/operation UUID, unknown key id, key rotation and key removal all fail closed.
- Envelope extra/missing keys and malformed Base64 fail validation.
- Plaintext code is absent from SQL rows, logs, exceptions, RPC responses, and CI output.
- HMAC pepper rotation: old key accepted only for explicitly allowed live request versions; retired keys fail closed.

### Attempts and request state
- Wrong attempts are capped at five server-side regardless of caller-supplied threshold; sixth attempt is rejected; concurrent increments cannot exceed five.
- Wrong-attempt recording is denied unless delivery outcome is sent.
- Correct digest does not increment failed counter; malformed digest does not mutate.
- Expiry boundaries (now, just-before, just-after) and terminal-state cleanup.
- Reapproval creates a new immutable delivery operation id and cannot reuse stale ciphertext/AAD.

### Outbox and provider behavior
- 20-way claim contention: one worker owns a lease; stale worker cannot heartbeat/begin/finish.
- Lease expiry before send is safe to reclaim; expiry after send-start becomes unknown and must not blindly resend.
- Provider idempotency key remains stable for the same operation; reapproval uses a new operation key.
- Confirmed failure clears code material and returns to pending; sent/unknown preserve appropriate state; payload cleared on terminal states.
- Retry ceiling and abandoned processing records are reconciled, never silently stranded.

### Identity, authorization, and exposure
- Edge actor is derived from verified JWT, never trusted from request body.
- Former coach rejected after reassignment; non-coach and inactive/archived trainee denied.
- RPC ACLs and wrapper exposure validated in disposable PostgreSQL; public schema wrappers are service-role-only.
- Error and response shape does not leak request existence, code, phone, or internal provider detail.

## Execution prerequisites
- A disposable local PostgreSQL 18 instance or isolated CI service with synthetic fixture only.
- Exact candidate migration set, in order, including a documented rollback.
- Tests must target candidate function names and encrypted payload schema, not older compatibility RPCs.
- No test against mirror Supabase data. No live migration/deploy until explicitly authorized.

## Result
Gap analysis and adversarial test plan only; no new tests executed in this checkpoint.
