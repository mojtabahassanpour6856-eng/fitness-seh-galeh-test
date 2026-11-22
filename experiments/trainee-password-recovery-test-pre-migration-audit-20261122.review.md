# TEST recovery lifecycle pre-migration audit

Date: 2026-11-22
Project: `udptdznbvewkublvzmtm`
Method: aggregate-only read-only SQL; no trainee identifiers, phone numbers, token hashes, or timestamps selected.

## Results

Recovery request status counts:
- `approved`: 1
- `processing`: 0
- `pending`: 0
- `rejected`: 0
- `completed`: 0
- `expired`: 0

Open-request duplicate audit across pending/approved/processing:
- Trainees with 2+ open rows: 0

Index catalog audit:
- Primary key index: valid and ready.
- `idx_trainee_password_recovery_requests_reviewed_by_fk`: valid and ready.
- `trainee_password_recovery_status_requested_at`: valid and ready.
- `trainee_password_recovery_one_open_request_per_trainee`: valid and ready; currently covers only pending and approved, not processing.

## Interpretation

- There are no current processing rows to reconcile before designing the widened invariant.
- No duplicate open-request groups were found in this aggregate snapshot.
- There is one approved request, but an aggregate-only expiry check found its `token_expires_at` is already in the past. No token value, row ID, phone, or personal data was read.
- The approved row is logically stale because its token is expired, but its status remains `approved`; the current request-creation logic may still treat it as open. A narrowly guarded reconciliation to `expired` and token clearing should be prepared as a separate TEST-only operation. No row mutation was performed.\n- HMAC cutover can be planned only after this stale row is safely reconciled; do not assume expiry timestamp alone changes status.
- The current unique index is healthy but does not protect against a second open row while an existing request is in processing. The migration must widen its predicate only after a reviewed plan.

## Next safe step

Prepare a TEST-only additive migration draft with delivery metadata and the widened unique index, but do not apply it until the outstanding approved request's lifecycle is safely resolved and the user approves the test migration. Do not use real SMS or real password reset for that resolution.

## Safety

Read-only catalog/aggregate queries only. No rows were changed. No personal identifiers or secrets were retrieved. No Edge Function deployment, SMS send, or Auth password operation occurred. Production project was not accessed.