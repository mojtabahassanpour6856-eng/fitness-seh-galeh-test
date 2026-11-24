-- Disposable local-Supabase-only fixture for the no-SMS recovery E2E.
-- This migration is copied into a temporary project in CI; never deploy it remotely.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('coach','trainee'))
);

create table public.trainees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  approval_status text not null,
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  phone_normalized text not null,
  coach_user_id uuid not null references auth.users(id)
);

create table public.trainee_password_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  phone_normalized text not null check (phone_normalized ~ '^\\+989[0-9]{9}$'),
  status text not null check (status in ('pending','approved','processing','rejected','completed','expired')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  token_hash text,
  token_expires_at timestamptz,
  token_attempts smallint not null default 0 check (token_attempts between 0 and 10),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (status in ('pending','rejected') and token_hash is null and token_expires_at is null)
    or (status in ('approved','processing') and token_hash is not null and token_expires_at is not null)
    or status in ('completed','expired')
  )
);

create table public.registration_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);

create or replace function public.consume_registration_rate_limit(
  p_key_hash text, p_window_seconds integer, p_max_requests integer
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare allowed_count integer;
begin
  insert into public.registration_rate_limits(key_hash, window_started_at, request_count)
  values (p_key_hash, pg_catalog.now(), 1)
  on conflict (key_hash) do update
    set window_started_at = case
          when registration_rate_limits.window_started_at + pg_catalog.make_interval(secs => p_window_seconds) <= pg_catalog.now()
          then pg_catalog.now() else registration_rate_limits.window_started_at end,
        request_count = case
          when registration_rate_limits.window_started_at + pg_catalog.make_interval(secs => p_window_seconds) <= pg_catalog.now()
          then 1 else registration_rate_limits.request_count + 1 end
  returning request_count into allowed_count;
  return allowed_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_registration_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_registration_rate_limit(text, integer, integer) to service_role;

commit;
