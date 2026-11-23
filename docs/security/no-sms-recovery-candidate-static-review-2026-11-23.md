# No-SMS recovery candidate — static review notes

Date: 2026-11-23  
Branch: `implementation/recovery-no-sms-db-candidate-20261123`

## Safety state
- Candidate source only; not deployed.
- Feature gate `RECOVERY_NO_SMS_ENABLED` must equal the literal string `true`; unset/misspelled values fail closed.
- No SMS, email, or external delivery provider is called.
- No database migration has been applied.

## Security properties implemented in candidate
- Supabase Auth JWT validation via `auth.getUser()`.
- Trainee identity resolved from `trainees.auth_user_id`, not client-supplied identifiers.
- Coach role and trainee ownership checks.
- Four-digit CSPRNG generation with rejection sampling.
- HMAC-SHA256 verifier, pepper from server environment, now bound to request, trainee, expiry and code.
- AES-256-GCM envelope with request/trainee/expiry AAD.
- 24-hour expiry, leading-zero preservation, Persian/Arabic digit normalization.
- Five-attempt atomic RPC hook and single-use claim RPC hook.

## Blocking issues before deployment
1. Confirm the rate-limit RPC `consume_registration_rate_limit` exists, its exact signature/return type, and that it is safe for this use. Until confirmed, request creation is not integration-ready.
2. Candidate schema migration must be corrected/reviewed for the state constraint: the existing state check requires verifier and expiry for `processing`; cleanup/terminal transitions must satisfy it.
3. The failed-attempt RPC currently accepts a verifier value supplied by the privileged caller. It must be reviewed together with the Edge Function and tested under concurrent wrong-code submissions; ideally compare-and-increment should be a single transaction that validates current request state and verifier.
4. The reset flow has a non-atomic boundary between claiming the code and Supabase Auth password update. A crash or ambiguous Auth response can leave a request stuck in `processing`. A recovery/reconciliation design is required before production.
5. The request creation query and unique index must agree on all open states, including `processing`; database uniqueness is the final concurrency guard.
6. CORS wildcard should be replaced with the exact approved application origins before release.
7. Confirm deployed Deno runtime compatibility and run formatter, type-check, unit tests, integration tests, and authorization/concurrency tests.
8. Coach list response must be checked against actual relationship names and selected trainee fields in the deployed schema.
9. Ensure secret provisioning and rotation procedures exist; do not place secrets in GitHub.
10. Add audit events that never contain raw codes, passwords, bearer tokens, envelopes, or verifier values.

## Test status
No Deno test, type-check, database migration, function deployment, or end-to-end test was executed as part of this commit. This document is a review checklist, not a release approval.
