-- CANDIDATE ONLY — LOCAL TESTS FIRST. DO NOT APPLY TO REMOTE DATABASES.
-- Adds browser-bound claim metadata for password recovery initiated before trainee sign-in.
-- Existing rows remain valid; all new fields are nullable and additive.

begin;

alter table public.trainee_password_recovery_requests
  add column if not exists claim_token_hash text,
  add column if not exists claim_expires_at timestamptz,
  add column if not exists request_ip_hash text,
  add column if not exists request_phone_hash text;

alter table public.trainee_password_recovery_requests
  drop constraint if exists trainee_password_recovery_claim_hash_format,
  add constraint trainee_password_recovery_claim_hash_format
    check (claim_token_hash is null or claim_token_hash ~ '^[A-Za-z0-9_-]{43,128}$'),
  drop constraint if exists trainee_password_recovery_ip_hash_format,
  add constraint trainee_password_recovery_ip_hash_format
    check (request_ip_hash is null or request_ip_hash ~ '^[0-9a-f]{64}$'),
  drop constraint if exists trainee_password_recovery_phone_hash_format,
  add constraint trainee_password_recovery_phone_hash_format
    check (request_phone_hash is null or request_phone_hash ~ '^[0-9a-f]{64}$');

create index if not exists trainee_password_recovery_claim_expiry_idx
  on public.trainee_password_recovery_requests (claim_expires_at)
  where claim_token_hash is not null;

comment on column public.trainee_password_recovery_requests.claim_token_hash is
  'Hash of a high-entropy browser-held claim secret; never store or return the raw secret.';
comment on column public.trainee_password_recovery_requests.claim_expires_at is
  'Expiry of the browser claim capability; independent of the short-lived numeric recovery code.';
comment on column public.trainee_password_recovery_requests.request_ip_hash is
  'Keyed digest used for pre-auth request throttling; must not contain raw IP data.';
comment on column public.trainee_password_recovery_requests.request_phone_hash is
  'Keyed digest used for pre-auth request throttling; must not contain raw phone data.';

commit;
