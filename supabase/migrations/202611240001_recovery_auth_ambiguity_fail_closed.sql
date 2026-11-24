-- CANDIDATE ONLY — DO NOT APPLY TO ANY DATABASE YET.
-- Fail-closed reconciliation guard for ambiguous Supabase Auth password updates.
-- This migration is additive and intentionally does not touch trainee data.

begin;

alter table public.trainee_password_recovery_requests
  add column if not exists reset_reconciliation_required boolean not null default false;

comment on column public.trainee_password_recovery_requests.reset_reconciliation_required is
  'Durable fail-closed marker: an Auth password update may have been dispatched with unknown outcome; trainee retries are prohibited until audited operator reconciliation.';

-- Replace the unsafe lease-resume behavior. An expired processing lease is NOT retry permission.
create or replace function public.begin_or_resume_trainee_password_reset(
  p_request_id uuid,
  p_expected_verifier text,
  p_attempt_id uuid,
  p_lease_seconds integer default 120
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.trainee_password_recovery_requests%rowtype;
begin
  if p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception 'invalid lease duration';
  end if;

  select * into r
    from public.trainee_password_recovery_requests
   where id = p_request_id
   for update;

  if not found
     or r.token_hash is distinct from p_expected_verifier
     or r.token_attempts >= 5 then
    return 'invalid';
  end if;

  if r.reset_reconciliation_required then
    return 'blocked_unknown_outcome';
  end if;

  if r.status = 'approved' then
    if r.token_expires_at is null or r.token_expires_at <= pg_catalog.now() then
      update public.trainee_password_recovery_requests
         set status = 'expired', token_hash = null, token_expires_at = null,
             code_envelope = null, updated_at = pg_catalog.now()
       where id = p_request_id;
      return 'expired';
    end if;

    update public.trainee_password_recovery_requests
       set status = 'processing',
           reset_started_at = pg_catalog.now(),
           reset_recovery_until = pg_catalog.now() + interval '24 hours',
           reset_attempt_id = p_attempt_id,
           reset_lease_until = pg_catalog.now() + make_interval(secs => p_lease_seconds),
           updated_at = pg_catalog.now()
     where id = p_request_id;
    return 'acquired';
  end if;

  if r.status = 'processing' then
    if r.reset_lease_until is not null and r.reset_lease_until > pg_catalog.now() then
      return 'busy';
    end if;

    -- A lease may have expired while its Auth HTTP request is still executing remotely.
    -- Quarantine permanently for trainee automation; never assign a second attempt.
    update public.trainee_password_recovery_requests
       set reset_reconciliation_required = true,
           reset_lease_until = null,
           updated_at = pg_catalog.now()
     where id = p_request_id
       and status = 'processing'
       and reset_attempt_id is not distinct from r.reset_attempt_id;
    return 'blocked_unknown_outcome';
  end if;

  return 'invalid';
end;
$$;

-- Called after a timeout/transport failure/unknown Auth response. Matching attempt only.
create or replace function public.mark_trainee_password_reset_reconciliation_required(
  p_request_id uuid,
  p_attempt_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  marked_id uuid;
begin
  update public.trainee_password_recovery_requests
     set reset_reconciliation_required = true,
         reset_lease_until = null,
         updated_at = pg_catalog.now()
   where id = p_request_id
     and status = 'processing'
     and reset_attempt_id = p_attempt_id
     and reset_reconciliation_required = false
  returning id into marked_id;
  return marked_id is not null;
end;
$$;

-- A completion marker is allowed only while the exact attempt still owns an unexpired lease
-- and the row has not already been quarantined.
create or replace function public.finish_trainee_password_reset(
  p_request_id uuid,
  p_attempt_id uuid,
  p_expected_verifier text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  finished_id uuid;
begin
  update public.trainee_password_recovery_requests
     set status = 'completed',
         completed_at = pg_catalog.now(),
         token_hash = null,
         token_expires_at = null,
         code_envelope = null,
         reset_attempt_id = null,
         reset_lease_until = null,
         reset_started_at = null,
         reset_recovery_until = null,
         reset_reconciliation_required = false,
         updated_at = pg_catalog.now()
   where id = p_request_id
     and status = 'processing'
     and reset_attempt_id = p_attempt_id
     and reset_lease_until > pg_catalog.now()
     and reset_reconciliation_required = false
     and token_hash = p_expected_verifier
  returning id into finished_id;
  return finished_id is not null;
end;
$$;

-- Release is only for a provider response explicitly proven to have made no password change.
-- It restores the still-valid code to approved; callers must not use this for unknown outcomes.
create or replace function public.release_trainee_password_reset_lease(
  p_request_id uuid,
  p_attempt_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  released_id uuid;
begin
  update public.trainee_password_recovery_requests
     set status = case
           when token_expires_at > pg_catalog.now() and token_attempts < 5 then 'approved'
           else 'expired'
         end,
         token_hash = case
           when token_expires_at > pg_catalog.now() and token_attempts < 5 then token_hash
           else null
         end,
         token_expires_at = case
           when token_expires_at > pg_catalog.now() and token_attempts < 5 then token_expires_at
           else null
         end,
         code_envelope = case
           when token_expires_at > pg_catalog.now() and token_attempts < 5 then code_envelope
           else null
         end,
         reset_attempt_id = null,
         reset_lease_until = null,
         reset_started_at = null,
         reset_recovery_until = null,
         updated_at = pg_catalog.now()
   where id = p_request_id
     and status = 'processing'
     and reset_attempt_id = p_attempt_id
     and reset_lease_until > pg_catalog.now()
     and reset_reconciliation_required = false
  returning id into released_id;
  return released_id is not null;
end;
$$;

revoke all on function public.begin_or_resume_trainee_password_reset(uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.mark_trainee_password_reset_reconciliation_required(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_trainee_password_reset(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.release_trainee_password_reset_lease(uuid, uuid) from public, anon, authenticated;

grant execute on function public.begin_or_resume_trainee_password_reset(uuid, text, uuid, integer) to service_role;
grant execute on function public.mark_trainee_password_reset_reconciliation_required(uuid, uuid) to service_role;
grant execute on function public.finish_trainee_password_reset(uuid, uuid, text) to service_role;
grant execute on function public.release_trainee_password_reset_lease(uuid, uuid) to service_role;

commit;
