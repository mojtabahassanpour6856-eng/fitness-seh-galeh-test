# Recovery mirror preflight checkpoint 3 — RPC catalog visibility
Date: 2026-11-23

## Scope
Read-only catalog inspection of Supabase mirror project `udptdznbvewkublvzmtm`. No SQL mutations, function calls, migrations, Edge Function deployments, SMS, or password resets.

## Findings
- PR #15 remains open, Draft, unmerged, and its head is `4ce4070b9bc5a7e59bc9131c26e309107c2bf8cb`.
- Direct catalog lookup in `pg_proc` joined to `pg_namespace`, searching expected recovery RPC names and password/recovery-related names, returned no rows.
- Earlier `information_schema.routines` search also returned no results. This is treated as catalog visibility/permissions or absence of routines, not proof that the expected functions are deployed.
- The recovery table and its RLS/index/constraint metadata were previously confirmed in the earlier checkpoints. Direct access is denied by its current policy.
- Because the function catalog is not visible via these queries, SECURITY DEFINER, owner, search_path, EXECUTE grants, and existence of RPCs remain **unverified**. Do not run function calls or infer permissions.

## Release gate status
Gate 1 (read-only mirror schema/RPC preflight): **INCOMPLETE / BLOCKED** on RPC catalog visibility and the previously listed review items.
Gates 2–6: not started.

## Safety boundary
No table rows or sensitive fields were inspected in this checkpoint. No database change, real SMS, auth change, Edge Function deployment, PR merge, or main-repository modification occurred.
