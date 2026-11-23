# Recovery mirror preflight checkpoint 2 — 2026-11-23

Read-only inspection only. Project: TEST mirror `udptdznbvewkublvzmtm`.

## Confirmed indexes
- Primary key unique index on id.
- Unique partial index `trainee_password_recovery_one_open_request_per_trainee` on trainee_id for statuses pending/approved.
- Index `trainee_password_recovery_status_requested_at` on (status, requested_at DESC).
- FK support index on reviewed_by.

## Constraints/state invariant
- Iranian normalized phone CHECK (+989 prefix, 13 chars).
- status enum-like CHECK: pending, approved, processing, rejected, completed, expired.
- state CHECK: pending/rejected require null token hash/expiry; approved/processing require non-null hash/expiry; completed/expired accepted.
- attempts CHECK 0..10.
- trainee FK cascade; reviewer FK auth.users.

## RLS
- Policy `deny_public_access_password_recovery_requests`: ALL for anon/authenticated, predicate false and with_check false. RLS enabled.
- This is restrictive for public client access, but does not alone prove service_role behavior or RPC security.

## Function inventory query
An information_schema.routines query for public routine names matching recovery returned an empty result. This should be treated as inconclusive (metadata/API visibility may omit functions), not proof no RPCs exist. Function owners, SECURITY DEFINER/search_path, ACLs, and role behavior remain unverified.

## Current PR #15
Open, Draft, unmerged; base mirror branch; head now `0ef9a10667f734c7331cd2e14d2700bd9381b535`. Existing CI results documented in PR are isolated fixture runs, not live mirror tests.

## Risks/blockers
- Delivery metadata columns absent from live mirror.
- Approved/processing token state invariant currently requires hash and expiry, complicating safe transition to new outbox/attempt design.
- Need examine actual RPC catalog/grants using reliable metadata before migration design.
- Do not touch the existing recovery row; no row-level details were queried.

## Actions taken
Only SELECT catalog metadata queries and read-only table metadata inspection. No migration, DDL/DML, function invocation, deployment, SMS, auth changes, secret reads, merge, or production change.
