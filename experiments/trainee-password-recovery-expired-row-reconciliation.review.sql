-- REVIEW ONLY — DO NOT EXECUTE WITHOUT EXPLICIT TEST-MIGRATION APPROVAL
-- Purpose: reconcile only already-expired approved recovery rows in TEST.
-- Read-only aggregate audit on 2026-11-22 found exactly one approved row with token_expires_at <= clock_timestamp().
-- No identifiers, phone numbers, or token hashes were retrieved.

BEGIN;

WITH expired AS (
  UPDATE public.trainee_password_recovery_requests
  SET status = 'expired',
      token_hash = NULL,
      token_expires_at = NULL,
      updated_at = pg_catalog.clock_timestamp()
  WHERE status = 'approved'
    AND token_expires_at IS NOT NULL
    AND token_expires_at <= pg_catalog.clock_timestamp()
  RETURNING id
)
SELECT count(*)::bigint AS rows_reconciled FROM expired;

-- Expected result at draft time: 1 row.
-- If result is 0, re-run the read-only aggregate audit; do not force an update.
-- If result is greater than 1, ROLLBACK and investigate before proceeding.
-- After confirming exactly the expected count, COMMIT manually; otherwise ROLLBACK.

-- This changes no trainee profile, auth account, password, phone, or message.
-- It does not send SMS. It only expires database recovery tokens whose expiry has already passed.

-- COMMIT;
-- ROLLBACK;