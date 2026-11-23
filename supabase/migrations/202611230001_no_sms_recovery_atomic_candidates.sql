-- CANDIDATE ONLY — DO NOT APPLY TO ANY DATABASE YET.
-- Reviewed against Supabase TEST schema on 2026-11-23.
-- Adds encrypted display envelope and atomic attempt/claim RPCs.
-- Edge Function must call these using service_role only after its own JWT checks.

begin;

alter table public.trainee_password_recovery_requests
  add column if not exists code_envelope text;

alter table public.trainee_password_recovery_requests
  drop constraint if exists trainee_password_recovery_requests_token_attempts_check;

alter table public.trainee_password_recovery_requests
  add constraint trainee_password_recovery_requests_token_attempts_check
  check (token_attempts >= 0 and token_attempts <= 5);

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

commit;
