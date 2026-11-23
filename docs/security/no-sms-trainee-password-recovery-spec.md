# No-SMS trainee password recovery — release specification

Status: implementation requirements; NOT approved for production deployment.

## Product flow
1. An authenticated trainee submits a password-recovery request.
2. The request is visible to the currently authorized coach for review.
3. A coach approval is bound to the trainee, request ID, and coach assignment at approval time.
4. Only after approval, the trainee sees a one-time four-digit recovery code inside the authenticated recovery page.
5. The code expires exactly 24 hours after issuance, using server-side UTC time.
6. The trainee submits the code and chooses a new password. Successful completion consumes the code atomically.

## Explicit exclusions
- No SMS sending or receiving.
- No SMS provider, phone-based delivery, provider credentials, or SMS secrets in this flow.
- No email or other external delivery channel unless separately approved.
- No plaintext code persisted in database, logs, analytics, browser storage, or coach-facing views.
- No automatic approval and no code display before coach approval.

## Security requirements
- Generate the code with a cryptographically secure random generator; uniformly sample 0000–9999, preserving leading zeroes.
- Store only a secure verifier/hash. Because the code has only 10,000 possibilities, use a server-side keyed HMAC/pepper (kept outside the database) or equivalent protected verifier; a plain unsalted hash is insufficient against offline enumeration.
- Bind verifier to request ID, trainee ID, and issuance/operation ID.
- Return/display the plaintext code only to the authenticated owner of the approved request, over the authenticated server response; do not expose it in list APIs, coach UI, or unrelated sessions.
- Use atomic state transitions for approval, issuance, attempts, and completion. Concurrent approvals/completions must have at most one winner.
- Enforce a small bounded number of failed attempts (existing product/security policy to be confirmed in code); lock/expire safely after threshold. Do not permit brute-force cycling.
- Re-approval, repeated polling, refresh, and retries must not silently mint unlimited codes or reset the 24-hour expiry. Define idempotent issuance behavior and test it.
- Reject pending, denied, expired, consumed, superseded, reassigned, or otherwise invalid requests.
- Use server UTC for expiry; never trust client clock.
- Responses must not reveal whether a phone/account exists. Apply rate limits to request creation and code verification.
- Ensure RLS and server authorization prevent trainee-to-trainee access and coach access outside assigned trainees.

## Required test gates
- UI: no SMS promises, SMS labels, phone-delivery claims, or SMS-dependent controls remain in trainee/coach recovery screens.
- Positive lifecycle: request → coach approval → code visible to owning trainee → successful password change.
- Negative lifecycle: pending/denied/expired/consumed/reassigned request cannot reveal or accept a code.
- Expiry boundary: valid immediately before 24h; invalid at/after 24h using server time.
- Code shape: exactly four digits including leading zeroes.
- Authorization: other trainee, unauthenticated user, and unassigned coach cannot read code or complete recovery.
- Brute-force: attempt cap, rate limit, lockout/expiry, and no information leakage.
- Concurrency: simultaneous approvals, wrong attempts, and successful completion yield one valid state transition only.
- Replay/idempotency: refresh and duplicate requests do not leak or mint extra valid codes; consumed code cannot be reused.
- Persistence/logging: database and logs contain no plaintext code.
- Legacy data: preflight and audited disposition for existing rows before any migration; never guess/backfill historical status.
- CI: run browser/auth integration against disposable fixtures plus SQL/RLS/grant/concurrency tests.

## Release safety
- Keep this work in the mirror repository and a draft PR.
- Do not run migrations, deploy Edge Functions, alter auth settings, or touch production.
- Do not copy real trainee data into test fixtures.
- Keep the feature fail-closed until every gate above passes and a separate explicit deployment approval is given.
