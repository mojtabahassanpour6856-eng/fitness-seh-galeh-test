# TEST database security/constraint audit — password recovery

Read-only audit date: 2026-11-22  
Project: `udptdznbvewkublvzmtm` (TEST only)  
Table: `public.trainee_password_recovery_requests`

No rows were read. No DDL, DML, migration, policy change, or function deployment was performed.

## Catalog findings

### Constraints

- `trainee_password_recovery_requests_phone_normalized_check`: phone must be +989 followed by nine digits (13 characters total).
- `trainee_password_recovery_requests_state_check`:
  - pending/rejected require token_hash and token_expires_at NULL.
  - approved/processing require both token_hash and token_expires_at NOT NULL.
  - completed/expired have no token nullability requirement in this CHECK.
- `trainee_password_recovery_requests_status_check`: pending, approved, processing, rejected, completed, expired.
- `trainee_password_recovery_requests_token_attempts_check`: 0 through 10.
- Primary key on id.
- trainee_id FK to trainees(id), ON DELETE CASCADE.
- reviewed_by FK to auth.users(id).

### RLS

- RLS is enabled; FORCE ROW LEVEL SECURITY is false.
- Policy `deny_public_access_password_recovery_requests` applies to anon and authenticated for all commands with USING false and WITH CHECK false.
- This means the Edge Function's service-role client is the intended data access path. Keep all browser/client access blocked.
- A SECURITY DEFINER RPC must have a tightly controlled owner, fixed search_path, explicit execute grants, and must validate request state/hash/attempt id in the SQL predicate. Do not weaken the table policy to make the RPC work.

## Important design consequences

1. The current status CHECK permits only the existing six statuses. Keep delivery lifecycle in a separate column; do not overload `status` with queued/sent/uncertain/failed.
2. The current state CHECK requires a token hash and expiry for both approved and processing. Any delivery-queue workflow that first marks a request approved must populate both fields in the same atomic transition.
3. `token_attempts` permits up to 10 at schema level, while application security policy should cap at 5. The RPC must stop at 5 and never depend on the broader table CHECK.
4. The unique partial index only covers pending and approved. Processing is not covered. Correct-code claim must remain a single conditional UPDATE; consider a separate unique index or explicit stale-processing recovery policy only after analyzing the full workflow.
5. Because anon/authenticated are denied by RLS, do not test RPC by weakening policy. Test as service_role in an isolated TEST branch or disposable database.
6. Existing rows should receive a conservative delivery state such as `not_started`; never assume an old approved row was delivered successfully.

## Migration hardening notes

The earlier state-machine document showed an illustrative `ALTER TABLE ... ADD CONSTRAINT` statement. PostgreSQL does not support `ADD CONSTRAINT IF NOT EXISTS` in the same way as `ADD COLUMN IF NOT EXISTS`; the migration must query the catalog or use a guarded DO block before adding the named CHECK constraint. Before any migration, inspect existing grants, table owner, and exact column definitions again.

The migration must be tested against a disposable copy first. It must not drop/replace the current state/status checks or RLS policy. A rollback plan must account for rows that have already acquired delivery states.

## Remaining checks before implementation

- Inspect table owner and explicit table/sequence grants.
- Inspect current function owner/ACL for the existing rate-limit RPC and any SECURITY DEFINER functions it calls.
- Verify whether service_role has required table access and whether the new RPC's owner can update the table under RLS.
- Inspect all schema objects referenced by the Edge Function before adding RPCs.
- Confirm Mediana's official response schema and idempotency/status lookup support.

## Safety boundary

This audit queried PostgreSQL catalogs only. It did not select trainee/recovery rows, alter data, modify RLS, create functions, add columns, or touch the production project `qfakyudgidsumeuoqoot`.
