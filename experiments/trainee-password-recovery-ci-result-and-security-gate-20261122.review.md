# Recovery CI result and additional security gate — 2026-11-22

Status: CI PASSED for the current SQL draft set. This is evidence only for the disposable PostgreSQL 18 fixture, not proof of compatibility with the live TEST Supabase schema.

## Observed run
- Workflow: Recovery SQL compile check
- Run ID: 45002259212
- Commit: cf2aaeb478b083c29ee3e986cea7bbb487d7f273
- Result: success
- Job: compile-recovery-sql — success
- PostgreSQL image: 18.7
- All listed steps completed: fixture initialization, delivery metadata draft, core RPC definitions, atomic-attempt RPC, delivery/finish RPCs, service_role-only EXECUTE assertions, lifecycle smoke tests.
- The log shows CREATE FUNCTION/GRANT/REVOKE succeeded and the smoke-test DO block completed.

## What this run proves
- The SQL draft files parsed/created successfully against the synthetic fixture.
- The exercised happy path (request → approve/queue → sent → claim → finish) completed in the disposable DB.
- The exercised wrong-code path incremented attempts 1..5 and expired/cleared the token on attempt five.
- The six RPCs passed the current function EXECUTE privilege assertion: service_role allowed; anon/authenticated denied.
- PL/pgSQL extra warnings/errors were enabled for the run.

## What this run does NOT prove
- No live TEST Supabase schema was modified or used by CI.
- The fixture is a simplified schema; it does not reproduce Supabase RLS policies, actual table ownership, production grants, triggers, extensions, or exact Auth behavior.
- Smoke tests run as the fixture's postgres role; the privilege assertion checks ACL metadata but does not exercise every call under SET ROLE service_role.
- No concurrency/interleaving tests, request-rate-limit tests, CORS tests, provider adapter tests, browser tests, or real SMS tests ran.
- No proof of Mediana handset delivery; 'sent' remains provider-acceptance semantics only.
- No Edge Function v11 compile/deploy or Auth password change occurred.

## Additional security architecture gate
The RPC drafts are currently in the exposed `public` schema as SECURITY DEFINER functions and rely on EXECUTE being revoked from PUBLIC/anon/authenticated and granted only to service_role. That is a narrow backend-only permission boundary, but it is weaker in defense-in-depth than placing privileged functions in a non-exposed schema. Supabase's security guidance warns that SECURITY DEFINER bypasses RLS and recommends keeping such functions out of exposed schemas; the current TEST project has private-schema USAGE denied to service_role, which is why the draft was kept in public.

Before any TEST migration, choose and document one of these approaches:
1. Preferred: grant only the service_role schema USAGE on a dedicated non-exposed schema, create the RPCs there, and call them schema-qualified from the Edge Function; or
2. Explicitly accept public-schema placement only after verifying Data API exposure settings, function ACLs (including PUBLIC), function owner, pinned empty search_path, and no other execute paths. Run Supabase advisors after the change.

Do not widen schema grants or move functions without an approved TEST migration. No change is made here.

## Remaining blockers
- Reconcile the one pre-existing approved-but-expired TEST row only after fresh aggregate preflight and explicit user approval.
- Review one-shot metadata migration / constraint idempotency.
- Provision a dedicated RECOVERY_TOKEN_PEPPER only through the secret manager; never read or print it.
- Integrate v11 Edge Function with RPCs and explicit delivery-state handling; no deployment until separately approved.
- Verify Mediana's documented response/correlation semantics.
- Add tests for duplicate request, wrong coach, role-context execution, and true concurrent calls.

## Safety
No Supabase DDL/DML, Edge Function deployment, secret read/write, SMS, Auth password update, production change, or merge was performed.
