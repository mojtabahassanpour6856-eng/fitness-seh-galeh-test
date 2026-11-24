# No-SMS trainee password recovery — release specification

Status: implementation requirements; NOT approved for production deployment.

## Confirmed product flow
1. Authenticated trainee submits a password-recovery request.
2. The request is shown to the authorized coach.
3. Coach approves the specific request for the specific trainee.
4. Only after approval, a four-digit code is displayed in that trainee's authenticated recovery page.
5. The code is valid for exactly 24 hours from server-side issuance time.
6. The trainee submits the code and sets a new password; successful completion consumes the code atomically.

## Explicit exclusions
- No SMS sending or receiving; no SMS provider, phone delivery, credentials, or secrets.
- No email or external delivery channel unless separately approved.
- No plaintext code in database, logs, analytics, browser storage, coach UI, or list APIs.
- No code visible before coach approval.

## Security requirements
- Generate exactly four digits using a cryptographically secure random generator; preserve leading zeroes.
- Store only a protected verifier. A plain unsalted hash is insufficient for a 10,000-value code space; use a server-side keyed HMAC/pepper or equivalent protected verifier.
- Bind verifier to request ID, trainee ID, and issuance/operation ID.
- Return plaintext only to the authenticated owner of the approved request.
- Approval, issuance, attempt counting, and completion must be atomic and concurrency-safe.
- Enforce a bounded failed-attempt limit and rate limits; prevent brute force and account enumeration.
- Repeated polling/refresh/retries must not mint unlimited codes or reset the 24-hour expiry; issuance must be idempotent.
- Reject pending, denied, expired, consumed, superseded, reassigned, or invalid requests.
- Use server UTC for expiry, never the client clock.
- RLS and server authorization must block other trainees and unassigned coaches.

## Required QA gates
- Remove every SMS promise/label/phone-delivery claim from trainee and coach recovery UI.
- Positive flow: request → coach approval → code appears only to owner trainee → password changes.
- Negative states: pending, denied, expired, consumed, reassigned cannot reveal or accept a code.
- Expiry boundary: valid before 24h, invalid at/after 24h using server time.
- Four-digit shape, including leading-zero cases.
- Authorization: unauthenticated, other trainee, and unassigned coach denied.
- Attempt cap, rate limiting, lockout, and no account-existence leakage.
- Concurrency: duplicate approvals, wrong attempts, and completion races have one safe winner.
- Replay/idempotency: refresh does not create extra valid codes; consumed code cannot be reused.
- Verify no plaintext code in persistence or logs.
- Legacy-row preflight and audited disposition before any migration; never guess historical status.
- Browser/auth integration plus SQL, RLS/grants, and concurrency tests on disposable fixtures.

## Release safety
Mirror repository only. Keep PR Draft. No migration, Edge Function deploy, auth-setting change, or production write. Do not copy real trainee data into test. Keep feature fail-closed until all gates pass and separate explicit deployment approval is given.
