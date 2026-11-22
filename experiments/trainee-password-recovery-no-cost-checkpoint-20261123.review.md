# No-cost recovery checkpoint — 2026-11-23

## Scope and safety

This checkpoint uses only the existing mirror repository and its existing Supabase TEST project. No paid Supabase development branch was created. No Supabase DDL/DML, Edge deployment, secret access/change, SMS, Auth password update, merge, or production operation was performed.

## Freshly verified state

- TEST Supabase project ref: `udptdznbvewkublvzmtm`; project is active.
- Existing TEST Edge Function `trainee-password-recovery`: active version 10; `verify_jwt=false`.
- The active v10 source still contains a direct Mediana Pattern SMS request to `https://api.mediana.ir/sms/v1/send/pattern`.
- Recovery table aggregate status query returned one row in status `expired`; no request identifiers, phone numbers, or token hashes were selected.
- The recovery table currently has the legacy columns only; the v11 delivery metadata columns are not present.
- No Supabase development branches exist for this TEST project.
- Mirror PR #15 remains open, Draft, and unmerged. UI/source review was performed against head `e0ce88bd93fd374944f854543cb43eedfc5bd381`; this checkpoint was then committed as `a38a29cb49e39404f78c020452b782efd55df5fb` on the same PR branch. Base: `integration/full-app-mirror-20261115`.
- Recovery SQL compile workflow run `45003962097` completed successfully. Both jobs passed: disposable PostgreSQL SQL compile/lifecycle smoke tests and isolated Deno crypto tests. This validates only the CI fixture, not the live TEST schema or deployed function.

## Critical product/provider mismatch

The PR #15 UI copy now tells trainees that a four-digit code will be SMSed after coach approval and tells coaches that the code has been SMSed. However, the deployed TEST Edge Function is still v10 and its review path calls Mediana directly.

Mediana was previously put on hold because of the IP/connectivity limitation. Therefore the current UI promise is not safe to publish: there is no approved active SMS provider adapter for this recovery flow. Do not deploy or merge this UI as a working SMS flow until an approved provider is selected and integrated, or change the UI copy to say that SMS delivery is not yet available.

The Mediana API contract audit also found that the published Pattern SMS example does not establish a stable response identifier or idempotency-key semantics. An empty 2xx response cannot safely be treated as confirmed delivery, and a timeout cannot safely be treated as definite failure. Do not implement automatic retry or claim exactly-once delivery.

## Remaining technical blockers before any TEST DB migration

1. Review the proposed SQL against the live TEST catalog in read-only mode, including exact constraints, indexes, table owner, RLS, grants, and function schema privileges.
2. Reconcile the existing expired row only through a separately reviewed, explicitly authorized operation; do not silently alter it as part of migration.
3. Resolve SECURITY DEFINER RPC placement and permissions. The current drafts place privileged functions in `public`; a conscious schema/API exposure decision and catalog-level grant verification are required.
4. Finish the Edge v11 implementation as a separate candidate, with an enforced fake-provider mode in automated tests and no Mediana/live-provider route.
5. Define safe delivery-unknown handling, rate limits for both request and reset, and an operational reconciliation path for ambiguous Auth outcomes.
6. Run synthetic browser/HTTP acceptance against an isolated environment. The current CI does not prove deployed HTTP behavior, CORS, real coach JWT authorization, or browser UX.

## Decision

**CI candidate checks: PASS. Live TEST integration: NOT RUN. Limited-user release: NOT APPROVED.**

Keep PR #15 Draft/unmerged and keep Edge Function v10 unchanged until the provider/UI mismatch and the remaining security gates are resolved. No paid infrastructure is required for further source review and disposable CI work.


## Additional CI hardening added after this checkpoint

- Added `experiments/ci/recovery-postgres-security-assertions.sql`.
- Updated `.github/workflows/recovery-sql-compile.yml` to run it after all six RPC drafts compile and before lifecycle smoke tests.
- The new assertion fails unless exactly six expected RPCs exist and each is owned by `postgres`, is `SECURITY DEFINER`, pins `search_path=""`, grants EXECUTE to `service_role`, denies it to `anon` and `authenticated`, and has no PUBLIC EXECUTE grant.
- Workflow change commit: `7f7f377857029fac85b403472d707bc9260dee5a`.
- The workflow run for this new commit has not yet been observed through the available run lookup. Therefore this added gate is **committed but not yet verified as passing**. Earlier run `45003962097` predates this new assertion and cannot be used as evidence for it.
