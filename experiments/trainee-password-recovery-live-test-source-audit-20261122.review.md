# Live TEST recovery v10 source/schema audit — 2026-11-22

Status: READ-ONLY AUDIT. No source deployment, database mutation, secret access, SMS, or Auth password update was performed.

## Scope and target
- Repository: `mojtabahassanpour6856-eng/fitness-seh-galeh-test`
- Working branch: `fix/trainee-password-recovery-ui-20261122`
- Supabase TEST project: `udptdznbvewkublvzmtm`
- Active TEST Edge Function: `trainee-password-recovery`, version 10, `verify_jwt=false`
- Production project `qfakyudgidsumeuoqoot` was not queried or modified during this audit.

## Verified live TEST schema facts
- `public.trainee_password_recovery_requests` currently has only the v10 columns; no `delivery_state`, `delivery_attempt_id`, `delivery_started_at`, or `delivery_updated_at`.
- Current partial unique index covers only `pending` and `approved`, not `processing`.
- Recovery table has RLS enabled and an explicit deny-all policy for `anon` and `authenticated`.
- No recovery-named RPC functions are currently installed in `public`.
- Aggregate state query returned one `approved` row, and that row's token is expired. No row identifiers, phone numbers, or token hashes were selected.
- The TEST project is ACTIVE_HEALTHY. No migration was applied.

## Verified v10 Edge Function findings

### Critical — low-entropy token digest
- Code uses plain SHA-256 of the four-digit code.
- The digest is vulnerable to offline enumeration if the table or backup is disclosed.
- Replace only with a dedicated server-side HMAC-SHA-256 pepper, domain-separated and bound to request ID + delivery attempt UUID. Do not reuse service-role or SMS credentials.

### Critical — attempt counter is not atomic
- Wrong-code path reads `token_attempts` in the Edge Function and writes a computed value.
- Concurrent wrong-code requests can overwrite one another and lose increments.
- Replace with a conditional atomic SQL update/RPC. Fail closed if the RPC fails; no TypeScript fallback.

### Critical — request creation check-then-insert
- Request action checks for `pending/approved` and then inserts in a separate request.
- The current partial unique index helps prevent duplicates only for those two states; the check/insert remains non-atomic and does not cover `processing`.
- Replace with a serialized/atomic create RPC and a widened partial unique invariant only after the expired approved row is reconciled safely.

### Critical — claim threshold mismatch
- Reset pre-check rejects when attempts >= 5, but the final claim UPDATE still checks `token_attempts < 10`.
- The claim predicate must enforce <5 as well, and require delivery state = sent after the delivery migration.

### Critical — SMS timeout ambiguity
- Approval writes `approved` and the plain SHA-256 token before calling Mediana.
- Missing credentials, fetch exceptions, and provider rejection currently restore the request to `pending` and clear token fields.
- A timeout may happen after provider acceptance; restoring pending loses the delivery outcome and can lead to duplicate/ambiguous sends.
- Introduce durable queued/sent/uncertain/failed delivery state and attempt UUID. Ambiguous responses must become uncertain, never pending. Do not label an empty/unrecognized 2xx as sent.

### High — random-code generation
- Current implementation reduces random values with modulo twice (`% 100000000`, then `% 10000`), creating avoidable modulo bias.
- Replace with rejection sampling over a 32-bit random word, preserve the four-character string and leading zeroes.

### High — processing/reconciliation
- Auth update occurs after the request is claimed as `processing`.
- On Auth error, v10 blindly restores `approved`; this is unsafe if the outcome is ambiguous.
- If Auth password update succeeds but the completion marker fails, the function returns success while the row can remain processing. Keep it non-reusable and add an explicit reconciliation procedure based on verified Auth outcome, not elapsed time alone.

### Medium — browser/API boundary
- CORS currently uses wildcard origin.
- Coach actions validate the Bearer token with `auth.getUser()` and check the coach profile; ownership is also checked against the trainee before review. Preserve those checks, derive coach identity only from verified JWT, and restrict CORS to actual app origins where practical.
- The request/reset responses should remain generic enough to avoid phone/account enumeration.

## CI evidence boundary
GitHub Actions run `45002259212` passed for the SQL draft set on a disposable PostgreSQL 18.7 fixture. This does NOT prove the live TEST schema is migrated, the Supabase role/RLS behavior is correct, concurrent calls are safe, Edge Function v11 compiles/deploys, or Mediana delivery semantics are known.

## Required next sequence (not executed)
1. Decide the privileged RPC schema boundary. Prefer a non-exposed schema with narrowly scoped service_role USAGE/EXECUTE over SECURITY DEFINER functions in exposed `public`. Do not widen grants without an explicit TEST-only migration plan.
2. Re-run aggregate read-only preflight immediately before any proposed TEST migration. The currently observed expired approved row blocks the stronger open-request unique index.
3. Compile the full SQL set against a fixture matching the actual TEST schema, constraints, owners, roles, RLS, and grants; test under `SET ROLE service_role`, not only postgres.
4. Implement Edge Function v11 as a separate candidate source with injected fake SMS transport and no live provider route in tests.
5. Add true concurrency, role-boundary, stale-provider-response, Auth-ambiguity, request/reset rate-limit, and browser tests.
6. Only after explicit approval, apply additive migration to TEST, deploy TEST candidate, and test with synthetic accounts. No production rollout without separate explicit approval.

## Safety
This audit is documentation only. No database DDL/DML, no Edge Function deployment, no secret read/write, no real SMS, no password update, no merge, and no production change.
