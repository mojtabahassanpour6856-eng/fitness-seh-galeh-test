# Mirror recovery preflight checkpoint — 2026-11-23

Status: READ-ONLY schema inspection; no SQL executed and no data rows read.

## Verified TEST mirror metadata
- Project ref: `udptdznbvewkublvzmtm`.
- Table `public.trainee_password_recovery_requests` exists, has RLS enabled, and reports 1 row.
- Columns observed: id UUID PK; trainee_id UUID; phone_normalized TEXT with Iranian-number CHECK; status TEXT with allowed values pending/approved/processing/rejected/completed/expired; requested_at; reviewed_at; reviewed_by; token_hash; token_expires_at; token_attempts SMALLINT with 0..10 CHECK; completed_at; updated_at.
- Foreign keys observed: trainee_id -> public.trainees(id), reviewed_by -> auth.users(id).
- The draft delivery-metadata columns (delivery_state, delivery_attempt_id, delivery_started_at, delivery_updated_at) are not present in the live table metadata.
- This inspection used the read-only table metadata API; it did not query individual rows, phones, hashes, or secret values.

## Compatibility implication
The live mirror table does not yet match the PR #15 delivery-metadata draft. Edge v11 must remain blocked until the schema/state-machine design is reconciled and tested.

## Remaining read-only checks
- Exact indexes and partial-index predicates.
- Existing CHECK/unique constraints and validation state.
- Function inventory, owners, SECURITY DEFINER, search_path, ACLs.
- RLS policy definitions and grants on table/schema.
- Aggregate-only lifecycle counts and duplicate-open-state preflight; no row identifiers or sensitive fields.

## Safety
No migration, DDL/DML, function invocation, deployment, SMS, Auth change, secret access, merge, or production change occurred. Preserve the existing row. Do not run migration until explicit user approval.
