import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('supabase/functions/trainee-password-recovery-preauth/index.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20261126180000_atomic_pre_auth_recovery_request.sql', 'utf8');

test('pre-auth request creation delegates to the atomic database RPC', () => {
  assert.match(source, /admin\.rpc\(["']create_trainee_password_recovery_request_no_sms["']/);
  assert.match(source, /p_claim_token_hash:\s*claimHash/);
  assert.match(source, /p_claim_expires_at:\s*claimExpires/);
  assert.doesNotMatch(source, /from\(["']trainee_password_recovery_requests["']\)\s*\n\s*\.select\(["']id,status,claim_token_hash,claim_expires_at/);
  assert.doesNotMatch(source, /\.update\(\{\s*status:\s*["']expired["']/);
  assert.doesNotMatch(source, /\.insert\(\{\s*\n\s*id:\s*requestId/);
});

test('atomic RPC serializes per trainee and never replaces a live claim', () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /for update/i);
  assert.match(migration, /current_request\.status = 'processing'[\s\S]*?return 'processing'/);
  assert.match(migration, /claim_expires_at is null[\s\S]*?return 'open'/);
  assert.match(migration, /claim_expires_at > pg_catalog\.now\(\)[\s\S]*?return 'open'/);
  assert.match(migration, /status in \('pending', 'approved'\)/);
  assert.match(migration, /status = 'expired'[\s\S]*?token_hash = null[\s\S]*?code_envelope = null[\s\S]*?claim_token_hash = null/);
  assert.match(migration, /insert into public\.trainee_password_recovery_requests/);
  assert.match(migration, /when unique_violation then[\s\S]*?return 'open'/);
});

test('RPC validates normalized phone, hashes, expiry, and service-role-only access', () => {
  assert.match(migration, /p_claim_token_hash is null/);
  const expectedPhoneCheck = "p_phone_normalized !~ '^" + "\\" + "+989[0-9]{9}$'";
  assert.ok(migration.includes(expectedPhoneCheck), 'SQL phone regex must escape plus exactly once');
  assert.match(migration, /p_claim_expires_at > pg_catalog\.now\(\) \+ interval '24 hours 5 minutes'/);
  assert.match(migration, /revoke all on function[\s\S]*?from public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]*?to service_role/);
});
