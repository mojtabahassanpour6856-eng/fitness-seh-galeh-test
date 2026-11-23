# Trainee password recovery — approved in-page code (no SMS)

Status: implementation contract for the mirror experiment. This document does not enable, deploy, or migrate anything.

## Confirmed product behavior

1. A trainee submits a password-recovery request from the recovery page.
2. The request remains pending until the assigned coach explicitly approves it.
3. Only after approval, a cryptographically random four-digit code becomes visible on that same trainee's password-recovery page.
4. The code is valid for 24 hours from coach approval. The UI must show the expiry time/countdown and clearly say that the code expires after 24 hours.
5. The trainee enters that code on the same recovery page to continue the password-reset flow.
6. No SMS of any kind: do not send, receive, queue, simulate, configure, or promise SMS in the product flow. No SMS provider, credentials, secrets, or delivery webhooks are in scope.
7. The coach approves/rejects and sees request status only. The recovery code must never be shown to the coach or placed in coach-facing logs/UI.

## Security and lifecycle requirements

- Generate the code with a cryptographically secure random generator; preserve leading zeroes (0000–9999).
- Store only a one-way verifier/hash for validation. If the page must re-display the code after refresh, use a separately encrypted, short-lived payload with strict request/trainee binding; never store plaintext.
- Reveal the code only to the matching trainee's recovery session/request, after approval. Do not expose it through public table reads, coach endpoints, logs, analytics, or generic API responses.
- Expiry is enforced server-side using database time, not only by a browser countdown. At approved_at + 24 hours, reject the code and clear/retire any encrypted reveal payload.
- Code is single-use. Successful verification atomically claims it and invalidates it.
- Keep the existing bounded-attempt protection: at most five failed code attempts; the fifth failure expires and clears the code. Test concurrent attempts so the limit cannot be bypassed.
- A pending request has no code. Rejection, cancellation, expiry, reassignment, or superseding request invalidates any prior code/payload.
- Prevent duplicate active requests and concurrent double-claims. Coach approval must be bound to the coach currently assigned to the trainee at the time of approval.
- Use generic responses for unknown trainee/request states to avoid account enumeration.
- Do not change trainee records, passwords, auth settings, production functions, or Supabase data during this experiment.

## Existing work that must be retained and revalidated

- Mirror PR #15: trainee recovery UI and disposable PostgreSQL lifecycle/security/concurrency tests.
- Main-repository PR #260: isolated candidate handler, cryptographic payload envelope and outbox/worker experiments. Its SMS-specific delivery path is not the product behavior and must not be activated; reuse only independently suitable security primitives after review.
- Re-run and preserve CI coverage for duplicate-request concurrency, five-attempt atomic limit, one-time code claim, coach reassignment/approval race, RPC grants/ownership/search_path, and lifecycle smoke tests.
- Add browser tests for: pending state shows no code; approval makes the four-digit code appear on the trainee recovery page; leading-zero code renders correctly; refresh/re-entry behavior; exact 24-hour expiry; expired/used/rejected/reassigned code rejection; no SMS text or network/provider call.
- Validate schema compatibility against the mirror read-only first. The known legacy expired row and missing request_coach_user_id column require an explicit, audited disposition; never infer/backfill it silently.

## Release gates

- All changes remain on a separate mirror experiment branch and Draft PR until code review and CI pass.
- No migration, Edge Function deploy, merge, production change, real trainee account reset, or SMS action is authorized by this document.
- Do not call the feature release-ready until browser/auth integration tests and read-only schema preflight pass, all security blockers are resolved, and the owner explicitly approves the final release action.