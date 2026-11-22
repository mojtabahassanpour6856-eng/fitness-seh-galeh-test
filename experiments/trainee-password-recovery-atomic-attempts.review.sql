-- REVIEW ONLY: atomic failed-attempt counter for trainee password recovery.
-- Do not execute in production or deploy until reviewed and tested in the TEST project.
-- The Edge Function must call this RPC only after a submitted code hash mismatches.

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
set search_path = public, pg_temp
as $$
begin
  return query
  update public.trainee_password_recovery_requests as r
  set
    token_attempts = (r.token_attempts + 1)::smallint,
    status = case when r.token_attempts + 1 >= 5 then 'expired' else r.status end,
    token_hash = case when r.token_attempts + 1 >= 5 then null else r.token_hash end,
    token_expires_at = case when r.token_attempts + 1 >= 5 then null else r.token_expires_at end,
    updated_at = now()
  where r.id = p_request_id
    and r.status = 'approved'
    and r.token_hash = p_expected_token_hash
    and r.token_expires_at > now()
    and r.token_attempts < 5
  returning
    true,
    r.token_attempts,
    (r.status = 'expired');

  if not found then
    return query select false, null::smallint, false;
  end if;
end;
$$;

revoke all on function public.record_trainee_recovery_failed_attempt(uuid, text) from public, anon, authenticated;
grant execute on function public.record_trainee_recovery_failed_attempt(uuid, text) to service_role;

-- Edge Function follow-up required (not included/deployed here):
-- On a wrong code hash, call:
--   admin.rpc('record_trainee_recovery_failed_attempt', {
--     p_request_id: request.id,
--     p_expected_token_hash: request.token_hash
--   })
-- Do not perform a read-then-write increment in TypeScript.
-- Also change the correct-code claim predicate from token_attempts < 10 to < 5.
