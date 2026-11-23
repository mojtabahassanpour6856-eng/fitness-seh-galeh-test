# Recovery v11 concurrency and failure-injection test plan

Status: TEST PLAN ONLY. No test accounts, database rows, SMS, Auth passwords, or production data were touched.

## Test harness boundary
- Use an isolated disposable PostgreSQL database with a schema fixture matching the TEST table definitions and role grants.
- Never point this harness at either Supabase project.
- Use synthetic trainee IDs, coach IDs, phone numbers from reserved/test ranges, and a fake SMS adapter that records calls locally.
- Set `plpgsql.extra_warnings='all'` and `plpgsql.extra_errors='all'` where supported; compile every function before running behavioral tests.
- Run concurrency cases with two or more independent database sessions, not sequential calls in one transaction.
- The current ChatGPT environment has no psql, PostgreSQL server, Docker, or browser automation executable available; therefore this document is not evidence of execution.

## Schema and compile gate
1. Confirm exact TEST column names/types, including trainees.approval_status, auth_user_id, phone_normalized, coach_user_id and recovery delivery metadata.
2. Confirm function owner is postgres, `search_path=''`, `public` schema usage for service_role, and EXECUTE only for service_role (no PUBLIC/anon/authenticated).
3. Confirm unique index predicate includes pending, approved, processing and is valid/ready.
4. Confirm state CHECK constraints permit every transition and reject unknown delivery states.
5. Compile each SQL file in isolation; fail the gate on any warning/error, unresolved relation/column, signature mismatch, or privilege mismatch.
6. Verify all RPC names and argument types exactly match the Edge Function calls before any function deployment.

## Concurrency tests
| ID | Scenario | Expected invariant |
|---|---|---|
| C01 | Two simultaneous request submissions for same trainee | Exactly one pending/open row; one call reports created and the other already_open/conflict. |
| C02 | Two simultaneous approvals of one pending request | Exactly one transition to approved+queued; one SMS adapter invocation only. |
| C03 | Approve vs reject race | Exactly one terminal decision; never both approved and rejected. |
| C04 | Two wrong codes submitted simultaneously | Both increments serialized; no lost update; fifth failed attempt expires token and clears HMAC/expiry. |
| C05 | Two correct codes submitted simultaneously | Exactly one claim to processing; second is rejected as already used/in progress. |
| C06 | Old attempt provider response arrives after new attempt | Old attempt UUID updates zero rows and cannot change current delivery state. |
| C07 | Request arrives while reset is processing | New request is rejected until lifecycle is safely completed/expired; no duplicate open rows. |
| C08 | Coach A tries to approve Coach B trainee | Zero state change and no SMS call. |

## SMS provider failure injection
| ID | Fake provider behavior | Expected result |
|---|---|---|
| S01 | Definite documented rejection before acceptance | delivery_state=failed; no reset accepted. |
| S02 | Timeout after request may have reached provider | delivery_state=uncertain; do not revert to pending; do not retry same code. |
| S03 | 2xx with empty/unrecognized body | uncertain unless Mediana contract explicitly defines that response as accepted. |
| S04 | 2xx with documented acceptance response | delivery_state=sent; response to coach contains no code. |
| S05 | Delayed response from previous attempt | attempt UUID guard prevents stale update. |
| S06 | Missing API key or invalid phone | No provider call; no plaintext code in logs; safe operational error. |

## Reset and Auth failure injection
| ID | Scenario | Expected result |
|---|---|---|
| R01 | Wrong code attempts 1–4 | Atomic counter increments exactly once per request; response does not reveal token state. |
| R02 | Fifth wrong code | Token expires and HMAC/expiry are cleared atomically. |
| R03 | Correct code but delivery state queued/uncertain/failed | Claim denied. |
| R04 | Correct code after expiry | Claim denied. |
| R05 | Correct code with wrong phone | Claim denied; no Auth call. |
| R06 | Auth definitely rejects update without mutation | Request remains non-reusable until an explicitly designed safe retry/reconciliation decision; never blindly reopen. |
| R07 | Auth update succeeds but finish RPC fails | Password change is reported truthfully; request remains processing/non-reusable and creates a reconciliation alert. |
| R08 | Auth response is ambiguous due network interruption | Keep processing; never assume password unchanged and reopen token. |
| R09 | Coach/list/reset unauthorized or wrong role | No sensitive data or code returned; no mutation. |

## Security and abuse tests
- Verify uniform four-digit generation by code review of rejection sampling; statistical tests are supplemental, not proof of cryptographic quality.
- Verify HMAC uses a dedicated 32+ byte secret, domain separation, request UUID, attempt UUID, and code. Pepper must never appear in logs, browser payloads, Git, SQL, or database rows.
- Verify rate limits on request and reset separately; reset attempts must not bypass the existing request limit.
- Verify generic request responses do not enumerate registered phone numbers.
- Verify logs contain only safe request IDs/status/error categories; never phone, plaintext code, HMAC, provider key, password, or full provider payload.
- Verify strict canonical UUID parsing, method/content-type/body-size validation, and origin-aware CORS before public rollout.
- Verify coach sees request status only; code is returned only to SMS provider and never in coach API response.

## Release gates
- All schema/compile tests pass in disposable PostgreSQL.
- All C/S/R cases pass, including repeated runs and forced interleavings.
- Fake SMS adapter proves no live network path is reachable in test mode.
- Mediana contract confirms exact accepted-response semantics and any request/status correlation ID.
- HMAC secret is provisioned only in TEST secret store and never printed/read back.
- Edge Function deployed only to TEST after explicit approval; UI verified in real browser/device with synthetic accounts.
- No merge to mirror/main until user reviews results and explicitly approves.

## Current blockers (not silently waived)
1. SQL files are drafts and have not been parsed/compiled against PostgreSQL.
2. One existing TEST request is approved but already expired; reconcile only after a fresh aggregate check and explicit database-migration approval.
3. The unique index migration must run only after that stale approved row is safely marked expired; otherwise its new predicate includes that row.
4. The metadata migration's ADD CONSTRAINT is one-shot and currently has no idempotent constraint-existence guard; do not rerun it blindly.
5. Edge Function v10 is still active; no v11 source integration/deployment has been performed.
6. Provider acceptance contract and HMAC pepper provisioning remain unresolved.
7. No browser automation or live SMS testing has been performed.

## Stop conditions
Any unexpected row count, duplicate open row, unexpected state, unknown provider response, failed privilege assertion, or Auth outcome uncertainty stops the test. Roll back disposable fixtures and investigate; never force a state transition.