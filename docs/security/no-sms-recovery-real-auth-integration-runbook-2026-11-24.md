# No-SMS password recovery: isolated real-Auth integration gate

Status: **local GoTrue and no-SMS happy-path E2E passed; remaining release-gate cases are still pending**  
Scope: candidate branch only. This runbook does not authorize deployment, migration, or testing against the production Supabase project.

## Why this gate is separate

The existing CI verifies three different things:

1. PostgreSQL candidate migrations and RPC behavior against disposable PostgreSQL.
2. Recovery orchestration behavior with controlled fake dependencies.
3. Supabase JS 2.119.2 error parsing using controlled HTTP responses.

Those checks do **not** prove behavior against a running GoTrue/Supabase Auth server. The SDK contract test is not a real Auth integration test.

## Required isolated environment

Use a newly provisioned Supabase project dedicated to this test, or a fully initialized local Supabase stack with the matching Auth schema and migrations. Do not reuse production credentials, project URL, database, service-role key, JWT secret, or real trainee accounts.

Before any request is sent, record and verify:

- Supabase project reference / local stack identity is the dedicated test target.
- Auth URL and database are isolated from production.
- A disposable coach and disposable trainee exist only in that environment.
- The trainee row is linked to the disposable Auth user and the disposable coach.
- The candidate recovery migrations are applied only to the isolated database.
- Edge Function secrets are generated specifically for this test and are not copied from production.
- Recovery feature flag is enabled only in this isolated environment.
- Logs and test output never print passwords, recovery codes, JWTs, service-role keys, or encryption keys.

If the project identity cannot be positively verified, stop. Do not fall back to a configured/default project.

## Test sequence

Run against a clean disposable coach/trainee pair:

1. Sign in as the trainee and verify the JWT resolves to the expected disposable Auth user.
2. Submit a recovery request. Confirm exactly one pending row is created and it is linked to the authenticated trainee, not a client-supplied trainee ID.
3. Sign in as the coach. Confirm the coach can list only their own pending request.
4. Approve the request. Confirm the response does not disclose the recovery code and the database stores only the HMAC verifier plus authenticated encrypted envelope.
5. As the trainee, retrieve the approved code through the intended authenticated flow. Confirm a different trainee cannot retrieve it.
6. Submit a valid new password. Confirm the reset completes once, the recovery row becomes completed, and verifier/envelope material is cleared.
7. Sign in with the new password. Confirm success.
8. Sign in with the old password. Confirm failure.
9. Re-submit the same recovery reset request. Confirm it cannot trigger another Auth password update.
10. Create a second disposable request and simulate a network interruption after the Auth request is dispatched. Confirm the row is quarantined or transitions to the fail-closed reconciliation state and that a second request cannot dispatch another Auth update.
11. Verify coach A cannot list, approve, reject, or inspect a request belonging to coach B.
12. Verify expired codes, exhausted attempts, rejected requests, inactive trainees, and invalid JWTs fail closed.

## Evidence to retain

Store only sanitized results:

- Test run URL and commit SHA.
- Isolated project reference (never its keys).
- Auth server / GoTrue version.
- Migration identifiers and applied timestamps.
- Pass/fail per test case.
- Sanitized Auth response class, error code, and HTTP status where relevant.
- Sanitized before/after row state with IDs replaced by stable test labels.

Never attach raw environment dumps, HTTP Authorization headers, recovery codes, passwords, JWTs, service-role credentials, or secret values.

## Release gate

Real-Auth integration remains **BLOCKED** until all of the following are true:

- A dedicated isolated Auth environment is available and its identity is verified.
- Candidate migrations are applied there only.
- The full sequence above passes, including new-password login and old-password rejection.
- Ambiguous network outcome is demonstrated to block a second Auth dispatch.
- Sanitized evidence is reviewed.
- A separate explicit release decision is made.

Passing this gate does not itself authorize production migration or deployment. Production rollout requires a separate backup, migration review, rollback plan, and explicit approval.


## CI implementation update (2026-11-24)

A separate GitHub Actions job, `real-local-gotrue-integration`, has been added. It creates a temporary Supabase project directory on the GitHub-hosted runner, starts the local Supabase stack (including a real GoTrue Auth server), creates one random disposable Auth user, and verifies:

- The original password can sign in before the admin password update.
- GoTrue rejects a deliberately weak password with the pinned SDK's structured `AuthWeakPasswordError` / `weak_password` / HTTP 422 contract, and the old password remains valid after that rejection.
- `auth.admin.updateUserById` changes the password through the real local GoTrue server.
- The old password is rejected after the update.
- The new password is accepted after the update.
- The disposable Auth user is deleted in a `finally` cleanup path.
- No remote Supabase project, production key, or persistent test account is used by this job.

This integration is deliberately narrower than the complete no-SMS recovery flow. It validates the real Auth password-mutation boundary; database-backed request approval, encrypted code retrieval, rate limits, coach isolation, and end-to-end Edge Function behavior remain separate gates.

## Existing remote mirror safety assessment (read-only)

The existing remote project named `fitness-seh-galeh-test` is **not treated as a clean throwaway Auth environment**. Read-only inspection found existing Auth users, an existing recovery request row, and active Edge Functions for the wider app. Its applied migration history also does not yet include the current candidate Auth-reconciliation migration.

Therefore this remote mirror was not modified: no users were created or deleted, no passwords changed, no migrations applied, and no functions deployed. It must not be used as a disposable password-reset fixture without a separately approved cleanup/fixture plan. The production project was not modified either.

## Current execution status (2026-11-24)

The candidate branch now has two green isolated local-Supabase CI gates:

- **Run 45406696823** — overall conclusion: `success`; commit `9436f88e554274fa4b3a2ba0fe85806c82767ed8`.
- `real-local-gotrue-integration`: passed against a disposable local GoTrue server. It verifies the real Auth password lifecycle, weak-password rejection, old-password rejection, new-password acceptance, and cleanup of the temporary Auth user.
- `local-no-sms-recovery-e2e`: passed against a separate disposable local Supabase stack with candidate migrations and generated test-only secrets. Its sanitized output confirms: trainee request creation; coach-to-coach isolation; approval without code disclosure; owner-trainee-only code retrieval; one-time password reset; old-password rejection; new-password acceptance; and replay rejection. The test creates two coaches and two trainees and deletes all four Auth users in cleanup.
- PostgreSQL migration compilation, RPC security/ACL assertions, 20-contender concurrency tests, Auth ambiguity reconciliation, SDK error-contract tests, and crypto tests also passed in the same run.

The first E2E attempt exposed a port collision; the local E2E stack now uses isolated ports. The next attempt exposed test-harness mismatches (Origin and reset payload field); those were corrected. These were test-harness failures, not changes to the production project.

**Still not covered by this successful full-flow run:** simulated transport interruption after Auth dispatch within the full Edge Function flow; explicit end-to-end expiry/exhaustion/inactive-account cases; coach B reject/inspect variants beyond list/approve isolation; and a full manual review of all deployment prerequisites. The separate deterministic reconciliation tests cover the ambiguous Auth outcome and no-second-dispatch barrier, but the complete real-GoTrue E2E flow has not simulated a network interruption.

All work remains on the candidate branch and in disposable local CI environments. No remote Supabase project, production database, production Auth user, production secret, deployment, or production migration was used. A green CI run is evidence for these tested paths only; it does **not** authorize deployment or production migration.
