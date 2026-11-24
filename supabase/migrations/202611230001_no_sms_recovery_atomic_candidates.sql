-- CANDIDATE ONLY — DO NOT APPLY TO ANY DATABASE YET.
-- Reviewed against Supabase TEST schema on 2026-11-23.
-- Adds encrypted display envelope and atomic attempt/claim RPCs.
-- Edge Function must call these using service_role only after its own JWT checks.

begin;

alter table public.trainee_password_recovery_requests
  add column if not exists code_envelope text;

alter table public.trainee_password_recovery_requests
  add column if not exists reset_attempt_id uuid,
  add column if not exists reset_lease_until timestamptz,
  add column if not exists reset_started_at timestamptz,
  add column if not exists reset_recovery_until timestamptz;

alter table public.trainee_password_recovery_requests
  drop constraint if exists trainee_password_recovery_requests_token_attempts_check;

alter table public.trainee_password_recovery_requests
  add constraint trainee_password_recovery_requests_token_attempts_check
  check (token_attempts >= 0 and token_attempts <= 5);

-- A request in processing must continue to block a second open request for this trainee.
drop index if exists public.trainee_password_recovery_one_open_request_per_trainee;
create unique index trainee_password_recovery_one_open_request_per_trainee
  on public.trainee_password_recovery_requests (trainee_id)
  where status in ('pending', 'approved', 'processing');

comment on column public.trainee_password_recovery_requests.code_envelope is
  'AES-256-GCM envelope for displaying the approved recovery code only to its authenticated trainee; never expose to coach or client logs.';

-- Incorrect verifier: one atomic increment. Fifth failed attempt expires and destroys verifier/envelope.
create or replace function public.record_trainee_recovery_failed_attempt_no_sms(
  p_request_id uuid,
  p_expected_verifier text
) returns table(attempts smallint, new_status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.trainee_password_recovery_requests r
     set token_attempts = least(r.token_attempts + 1, 5)::smallint,
         status = case when r.token_attempts + 1 >= 5 then 'expired' else r.status end,
         token_hash = case when r.token_attempts + 1 >= 5 then null else r.token_hash end,
         token_expires_at = case when r.token_attempts + 1 >= 5 then null else r.token_expires_at end,
         code_envelope = case when r.token_attempts + 1 >= 5 then null else r.code_envelope end,
         updated_at = pg_catalog.now()
   where r.id = p_request_id
     and r.status = 'approved'
     and r.token_hash = p_expected_verifier
     and r.token_expires_at > pg_catalog.now()
     and r.token_attempts < 5
  returning r.token_attempts, r.status;
end;
$$;

-- Correct verifier: atomic single-use claim. Only one concurrent caller can transition approved -> processing.
create or replace function public.claim_trainee_recovery_code_no_sms(
  p_request_id uuid,
  p_expected_verifier text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  update public.trainee_password_recovery_requests r
     set status = 'processing',
         updated_at = pg_catalog.now()
   where r.id = p_request_id
     and r.status = 'approved'
     and r.token_hash = p_expected_verifier
     and r.token_expires_at > pg_catalog.now()
     and r.token_attempts < 5
  returning r.id into claimed_id;
  return claimed_id is not null;
end;
$$;

-- Keep privileged RPCs unavailable to browser roles.
revoke all on function public.record_trainee_recovery_failed_attempt_no_sms(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_trainee_recovery_code_no_sms(uuid, text) from public, anon, authenticated;
grant execute on function public.record_trainee_recovery_failed_attempt_no_sms(uuid, text) to service_role;
grant execute on function public.claim_trainee_recovery_code_no_sms(uuid, text) to service_role;


-- Acquire or resume a reset lease. No password material is ever stored.
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

  if r.status <> 'processing'
     or r.reset_recovery_until is null
     or r.reset_recovery_until <= pg_catalog.now() then
    return 'expired';
  end if;

  if r.reset_lease_until is not null and r.reset_lease_until > pg_catalog.now() then
    return 'busy';
  end if;

  update public.trainee_password_recovery_requests
     set reset_attempt_id = p_attempt_id,
         reset_lease_until = pg_catalog.now() + make_interval(secs => p_lease_seconds),
         updated_at = pg_catalog.now()
   where id = p_request_id;
  return 'acquired';
end;
$$;

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
         updated_at = pg_catalog.now()
   where id = p_request_id
     and status = 'processing'
     and reset_attempt_id = p_attempt_id
     and reset_lease_until > pg_catalog.now()
     and token_hash = p_expected_verifier
  returning id into finished_id;
  return finished_id is not null;
end;
$$;

-- Release only after a definitive Auth rejection, never after a timeout/unknown result.
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
     set reset_attempt_id = null,
         reset_lease_until = null,
         updated_at = pg_catalog.now()
   where id = p_request_id
     and status = 'processing'
     and reset_attempt_id = p_attempt_id
     and reset_lease_until > pg_catalog.now()
     and reset_recovery_until > pg_catalog.now()
  returning id into released_id;
  return released_id is not null;
end;
$$;

revoke all on function public.begin_or_resume_trainee_password_reset(uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_trainee_password_reset(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.release_trainee_password_reset_lease(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_or_resume_trainee_password_reset(uuid, text, uuid, integer) to service_role;
grant execute on function public.finish_trainee_password_reset(uuid, uuid, text) to service_role;
grant execute on function public.release_trainee_password_reset_lease(uuid, uuid) to service_role;


commit;
