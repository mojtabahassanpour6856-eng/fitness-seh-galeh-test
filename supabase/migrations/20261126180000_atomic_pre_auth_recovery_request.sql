-- Candidate migration only. Keep disabled until local and manual tests pass.
-- Serialize request creation per trainee. Never replace a live claim or processing request.

create or replace function public.create_trainee_password_recovery_request_no_sms(
  p_request_id uuid,
  p_trainee_id uuid,
  p_phone_normalized text,
  p_claim_token_hash text,
  p_claim_expires_at timestamptz,
  p_request_ip_hash text,
  p_request_phone_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_request public.trainee_password_recovery_requests%rowtype;
begin
  if p_request_id is null then return 'invalid'; end if;
  if p_trainee_id is null then return 'invalid'; end if;
  if p_phone_normalized is null then return 'invalid'; end if;
  if p_claim_token_hash is null then return 'invalid'; end if;
  if p_request_ip_hash is null then return 'invalid'; end if;
  if p_request_phone_hash is null then return 'invalid'; end if;
  if p_claim_expires_at is null then return 'invalid'; end if;
  if p_phone_normalized !~ '^\\+989[0-9]{9}$' then return 'invalid'; end if;
  if p_claim_token_hash !~ '^[A-Za-z0-9_-]{43}$' then return 'invalid'; end if;
  if p_request_ip_hash !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;
  if p_request_phone_hash !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;
  if p_claim_expires_at <= pg_catalog.now() then return 'invalid'; end if;
  if p_claim_expires_at > pg_catalog.now() + interval '24 hours 5 minutes' then return 'invalid'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_trainee_id::text, 0)
  );

  select *
    into current_request
    from public.trainee_password_recovery_requests
   where trainee_id = p_trainee_id
     and status in ('pending', 'approved', 'processing')
   order by requested_at desc
   limit 1
   for update;

  if found then
    if current_request.status = 'processing' then
      return 'processing';
    end if;

    -- Missing expiry is treated as live/locked, never as permission to take over.
    if current_request.claim_expires_at is null
       or current_request.claim_expires_at > pg_catalog.now() then
      return 'open';
    end if;

    update public.trainee_password_recovery_requests
       set status = 'expired',
           token_hash = null,
           token_expires_at = null,
           code_envelope = null,
           claim_token_hash = null,
           claim_expires_at = null,
           request_ip_hash = null,
           request_phone_hash = null,
           updated_at = pg_catalog.now()
     where id = current_request.id
       and status in ('pending', 'approved')
       and claim_expires_at is not null
       and claim_expires_at <= pg_catalog.now();

    if not found then
      return 'open';
    end if;
  end if;

  insert into public.trainee_password_recovery_requests (
    id, trainee_id, phone_normalized, status,
    claim_token_hash, claim_expires_at,
    request_ip_hash, request_phone_hash
  ) values (
    p_request_id, p_trainee_id, p_phone_normalized, 'pending',
    p_claim_token_hash, p_claim_expires_at,
    p_request_ip_hash, p_request_phone_hash
  );

  return 'created';
exception
  when unique_violation then
    return 'open';
end;
$$;

revoke all on function public.create_trainee_password_recovery_request_no_sms(
  uuid, uuid, text, text, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.create_trainee_password_recovery_request_no_sms(
  uuid, uuid, text, text, timestamptz, text, text
) to service_role;
