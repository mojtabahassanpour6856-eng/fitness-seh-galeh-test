-- REVIEW ONLY: no-SMS atomic failed-attempt counter.
-- Candidate adaptation of the earlier SMS-oriented RPC. NOT EXECUTED.
-- Assumes the existing TEST table columns: id, status, token_attempts,
-- token_hash, token_expires_at, updated_at. Verify schema before any migration.
-- No delivery_state predicate: this product flow has no external delivery.

create or replace function public.record_trainee_recovery_failed_attempt_no_sms(
  p_request_id uuid,
  p_expected_code_hmac text
)
returns table (
  accepted boolean,
  attempts smallint,
  locked boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_request_id is null
     or p_expected_code_hmac is null
     or p_expected_code_hmac !~ '^[0-9a-f]{64}$' then
    return query select false, null::smallint, false;
    return;
  end if;

  return query
    with changed as (
      update public.trainee_password_recovery_requests as r
      set token_attempts = (r.token_attempts + 1)::smallint,
          status = case
            when r.token_attempts + 1 >= 5 then 'expired'
            else r.status
          end,
          token_hash = case
            when r.token_attempts + 1 >= 5 then null
            else r.token_hash
          end,
          token_expires_at = case
            when r.token_attempts + 1 >= 5 then null
            else r.token_expires_at
          end,
          updated_at = pg_catalog.clock_timestamp()
      where r.id = p_request_id
        and r.status = 'approved'
        and r.token_hash = p_expected_code_hmac
        and r.token_expires_at > pg_catalog.clock_timestamp()
        and r.token_attempts < 5
      returning r.token_attempts
    )
    select true, c.token_attempts, (c.token_attempts >= 5)
      from changed c
    union all
    select false, null::smallint, false
      where not exists (select 1 from changed);
end;
$function$;

revoke all on function public.record_trainee_recovery_failed_attempt_no_sms(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_trainee_recovery_failed_attempt_no_sms(uuid, text)
  to service_role;

-- Required integration contract:
-- * Invoke only after comparing submitted HMAC with stored HMAC and finding mismatch.
-- * Pass the stored expected HMAC, never the submitted wrong-code HMAC.
-- * On RPC error, fail closed (503); never maintain a process-local counter.
-- * Correct-code claim must independently require status='approved',
--   token_expires_at > clock_timestamp(), token_attempts < 5, and one-time claim.
-- * The authenticated owner check must happen server-side before code retrieval.
-- * The code envelope must be deleted/cleared on completion or lockout.
-- This function alone does NOT implement code issuance, retrieval, password change,
-- completion reconciliation, request authorization, or rate limiting.
