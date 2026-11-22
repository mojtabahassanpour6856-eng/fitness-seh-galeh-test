-- REVIEW ONLY: atomic failed-attempt counter for trainee password recovery.
-- This is a proposed SQL definition, NOT an executed migration.
-- Target is the disposable TEST project only; never run against production.
--
-- Security choices:
-- - Keep the function in public for now because TEST currently grants USAGE on
--   public to service_role but not on private. Do not widen private schema ACLs
--   just for this RPC without a separate schema-access review.
-- - SECURITY DEFINER is required because the recovery table denies browser roles
--   via RLS. Owner must be postgres; caller execution is limited to service_role.
-- - Pin search_path to the empty string and schema-qualify every object.
--
-- Before execution, re-check table constraints, owner, ACL, and RLS in TEST.

create or replace function public.record_trainee_recovery_failed_attempt(
  p_request_id uuid,
  p_expected_token_hash text
)
returns table (
  accepted boolean,
  attempts smallint,
  expired boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Reject malformed inputs without touching a row.
  if p_request_id is null
     or p_expected_token_hash is null
     or p_expected_token_hash !~ '^[0-9a-f]{64}$' then
    return query
      select false, null::smallint, false;
    return;
  end if;

  -- The UPDATE itself obtains the row lock and increments the counter atomically.
  -- The expected hash prevents a stale request from affecting a rotated token.
  return query
    with changed as (
      update public.trainee_password_recovery_requests as r
      set
        token_attempts = (r.token_attempts + 1)::smallint,
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
        and r.token_hash = p_expected_token_hash
        and r.token_expires_at > pg_catalog.clock_timestamp()
        and r.delivery_state = 'sent'
        and r.token_attempts < 5
      returning r.token_attempts, r.status
    )
    select true, c.token_attempts, (c.status = 'expired')
      from changed as c
    union all
    select false, null::smallint, false
      where not exists (select 1 from changed);
end;
$function$;

-- Explicitly remove the default PUBLIC grant and direct browser-role grants.
revoke all on function public.record_trainee_recovery_failed_attempt(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_trainee_recovery_failed_attempt(uuid, text)
  to service_role;

-- Required Edge Function follow-up (not applied here):
-- 1. After a submitted code HMAC mismatches, call this RPC with the STORED expected HMAC fetched for this request (not the submitted wrong-code HMAC); the RPC is service_role-only and the expected hash guards against a stale token rotation.
-- 2. If the RPC errors, return a safe 503; never fall back to a TypeScript counter.
-- 3. If accepted=false, report the code as expired/invalid without disclosing state.
-- 4. Change the correct-code claim predicate from token_attempts < 10 to < 5.
-- 5. The correct-code claim must also require delivery_state='sent' after that
--    column/state machine has been implemented and verified.
--
-- No RPC invocation, migration, DDL, DML, SMS, or password update was performed.
