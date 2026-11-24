# Recovery Edge Function v10 — deeper source findings

Date: 2026-11-22
Source: active TEST Edge Function version 10, read-only retrieval.
Scope: source inspection only. No deployment, SQL writes, SMS calls, secret reads, or Auth changes.

## P0/P1 findings confirmed directly in source

### P1 — four-digit recovery code is stored as an unkeyed SHA-256 hash

The function stores `SHA-256(code)` where code has only 10,000 possibilities. Anyone who obtains a database backup or a leaked token_hash can brute-force the code offline almost instantly. RLS protects normal API access, but it does not make a low-entropy unkeyed hash resistant to a database disclosure.

Required correction before live use:
- Use a dedicated server-side pepper/HMAC key stored only as an Edge Function secret, separate from the Supabase service key and Mediana key.
- Compute HMAC-SHA-256 over a domain-separated value that includes request ID and code (and preferably attempt UUID once introduced).
- Compare the resulting fixed-length digest; never store the code or pepper.
- Rotate/expire all outstanding recovery tokens when changing the hashing scheme; do not attempt to interpret old unkeyed hashes as HMAC values.
- Test secret absence and rotation behavior without printing or returning secret values.

### P1 — request creation is a read-then-insert race

The request action queries for pending/approved and then inserts pending in a separate request. Two concurrent calls can both see no row and attempt insertion. The existing partial unique index is a backstop for pending/approved, but the function currently returns a generic 503 on a uniqueness race rather than a clean generic accepted/in-progress response. More importantly, processing is not covered by that index.

Required correction: a single atomic create RPC plus a unique invariant covering pending/approved/processing, after defining safe processing reconciliation. Do not rely on the pre-check.

### P1 — wrong-code update errors are ignored

In the reset action, the wrong-code branch awaits the UPDATE but never checks its error or whether a row was actually updated. The endpoint always returns the wrong-code response. Under DB failure or a race, attempts may not be counted, allowing more than five guesses.

Required correction: use the reviewed atomic failed-attempt RPC; if it errors, return a safe 503 and do not fall back to a TypeScript increment.

### P1 — code claim allows attempts < 10 although precheck stops at 5

The initial read rejects attempts >=5, but the final compare-and-set claim predicate is `.lt("token_attempts", 10)`. A concurrent mismatch can increment after the precheck and before the claim, creating inconsistent enforcement.

Required correction: atomic wrong-attempt and correct-claim operations must serialize on the same row and both enforce attempts <5. Correct claim must additionally require delivery_state=sent.

### P1 — SMS failure/timeout reopens request unsafely

Both fetch exceptions and several response failures change approved back to pending and clear token fields. A timeout or broken connection does not prove Mediana did not accept the SMS. The trainee may receive a code after the request is reopened, and the coach may approve again.

Required correction: persist queued/sent/uncertain/failed state and attempt UUID. Timeout or ambiguous response becomes uncertain; never reopen automatically. A later retry must rotate to a new code and invalidate the previous token.

### P1 — completion-marker failure is not reconciled

If Auth password update succeeds but the final database update fails, the function returns success while the row remains processing with its token hash/expiry. This avoids immediate code reuse, but leaves the request stuck and no operational reconciliation path.

Required correction: retain non-reusable processing state and add a secure reconciliation path that verifies Auth outcome. Never reopen based only on elapsed time.

## Additional source observations

- The coach role is derived from a validated Bearer token and checked against `profiles.role`; the coach ownership check is performed against `trainees.coach_user_id` before review.
- Approve/reject updates use a conditional `status=pending` update, which provides a single winner for concurrent reviews.
- The code is never returned to the coach in the response. Preserve this behavior.
- `validId` accepts any 36-character string composed of hex digits and hyphens rather than enforcing canonical UUID grouping. This is not the primary risk because the database lookup still binds the ID, but use a strict UUID regex for clean input validation.
- `request` and `reset` are unauthenticated by design; retain generic responses to reduce account enumeration and apply rate limits to both actions, with additional limits keyed by IP/device where feasible.
- The outer catch returns HTTP 400 for all unexpected errors. Separate malformed input from internal failures; unexpected server errors should be logged safely and return 500/503, without leaking stack traces.
- CORS currently allows `*`. This is not an authentication boundary, but consider restricting origins to the actual app domains once the deployment model is stable.
- Password length is checked in characters 8..128. Confirm this matches the product's actual password policy and test Unicode handling consistently with Supabase Auth.

## Required sequencing before implementation

1. Decide and provision a dedicated recovery HMAC secret in TEST; do not reuse MEDIANA_API_KEY or SUPABASE_SERVICE_ROLE_KEY.
2. Design additive delivery metadata and the processing reconciliation policy.
3. Finalize atomic RPCs and the unique-open-request invariant.
4. Implement the Edge Function patch behind a stubbed SMS adapter.
5. Run concurrency tests for wrong-code vs correct-code races, request creation races, late provider responses, and Auth completion failures.
6. Only then consider a TEST deployment, with explicit user approval.

## Safety status

No live SMS was sent. No secrets were read. No Auth password was changed. No database writes/migrations or Edge Function deployment were performed. Production remains untouched.