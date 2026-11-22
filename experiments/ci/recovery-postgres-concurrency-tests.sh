#!/usr/bin/env bash
set -euo pipefail

# Independent psql processes deliberately create real database concurrency.
# Runs only against the ephemeral PostgreSQL service created by GitHub Actions.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
parallelism=20
hash="$(printf 'b%.0s' {1..64})"
coach="00000000-0000-4000-8000-000000000001"

psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000004'),
 ('00000000-0000-4000-8000-000000000005'),
 ('00000000-0000-4000-8000-000000000006')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.trainees(id,approval_status,auth_user_id,phone_normalized,coach_user_id) VALUES
 ('10000000-0000-4000-8000-000000000003','active','00000000-0000-4000-8000-000000000004','+989121234569','00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000004','active','00000000-0000-4000-8000-000000000005','+989121234570','00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000005','active','00000000-0000-4000-8000-000000000006','+989121234571','00000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
SQL

# C01: 20 independent concurrent request creations -> exactly one open request.
for i in $(seq 1 "$parallelism"); do
  psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT outcome FROM public.create_trainee_recovery_request('10000000-0000-4000-8000-000000000003','+989121234569')" > "$tmp/create.$i" &
done
wait
created="$(grep -hxc 'created' "$tmp"/create.* || true)"
already="$(grep -hxc 'already_open' "$tmp"/create.* || true)"
if [[ "$created" -ne 1 || "$already" -ne $((parallelism-1)) ]]; then
  echo "C01 failed: created=$created already_open=$already"
  exit 1
fi
open_count="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.trainee_password_recovery_requests WHERE trainee_id='10000000-0000-4000-8000-000000000003' AND status IN ('pending','approved','processing')")"
[[ "$open_count" -eq 1 ]] || { echo "C01 failed: open rows=$open_count"; exit 1; }
echo "C01 PASS: 1 created, $already concurrent duplicates safely rejected"

# Prepare the failed-attempt test request.
wrong_request="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT id FROM public.trainee_password_recovery_requests WHERE trainee_id='10000000-0000-4000-8000-000000000004' LIMIT 1")"
if [[ -z "$wrong_request" ]]; then
  psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT outcome FROM public.create_trainee_recovery_request('10000000-0000-4000-8000-000000000004','+989121234570')" | grep -qx created
  wrong_request="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT id FROM public.trainee_password_recovery_requests WHERE trainee_id='10000000-0000-4000-8000-000000000004' LIMIT 1")"
fi
wrong_attempt="20000000-0000-4000-8000-000000000003"
psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT outcome FROM public.approve_and_queue_trainee_recovery('$wrong_request','$coach','$hash',clock_timestamp()+interval '10 minutes','$wrong_attempt')" | grep -qx queued
psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT updated::text FROM public.record_trainee_recovery_delivery_result('$wrong_request','$wrong_attempt','sent')" | grep -qx true

# C04: 20 simultaneous wrong-code increments -> exactly 5 accepted, never >5.
for i in $(seq 1 "$parallelism"); do
  psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT accepted::text FROM public.record_trainee_recovery_failed_attempt('$wrong_request','$hash')" > "$tmp/wrong.$i" &
done
wait
accepted="$(grep -hxc 'true' "$tmp"/wrong.* || true)"
rejected="$(grep -hxc 'false' "$tmp"/wrong.* || true)"
if [[ "$accepted" -ne 5 || "$rejected" -ne $((parallelism-5)) ]]; then
  echo "C04 failed: accepted=$accepted rejected=$rejected"
  exit 1
fi
wrong_state="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT status || ':' || token_attempts::text || ':' || (token_hash IS NULL)::text || ':' || (token_expires_at IS NULL)::text FROM public.trainee_password_recovery_requests WHERE id='$wrong_request'")"
[[ "$wrong_state" == "expired:5:true:true" ]] || { echo "C04 failed: final state=$wrong_state"; exit 1; }
echo "C04 PASS: exactly five atomic increments; token expired and cleared"

# Prepare a separate request for the one-time correct-code claim race.
claim_request="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT id FROM public.trainee_password_recovery_requests WHERE trainee_id='10000000-0000-4000-8000-000000000005' LIMIT 1")"
if [[ -z "$claim_request" ]]; then
  psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT outcome FROM public.create_trainee_recovery_request('10000000-0000-4000-8000-000000000005','+989121234571')" | grep -qx created
  claim_request="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT id FROM public.trainee_password_recovery_requests WHERE trainee_id='10000000-0000-4000-8000-000000000005' LIMIT 1")"
fi
claim_attempt="20000000-0000-4000-8000-000000000004"
psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT outcome FROM public.approve_and_queue_trainee_recovery('$claim_request','$coach','$hash',clock_timestamp()+interval '10 minutes','$claim_attempt')" | grep -qx queued
psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT updated::text FROM public.record_trainee_recovery_delivery_result('$claim_request','$claim_attempt','sent')" | grep -qx true

# C05: 20 independent correct-code claims -> exactly one wins.
for i in $(seq 1 "$parallelism"); do
  psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT COALESCE((SELECT claimed::text FROM public.claim_trainee_recovery_code('$claim_request','$hash')), 'false')" > "$tmp/claim.$i" &
done
wait
winners="$(grep -hxc 'true' "$tmp"/claim.* || true)"
losers="$(grep -hxc 'false' "$tmp"/claim.* || true)"
if [[ "$winners" -ne 1 || "$losers" -ne $((parallelism-1)) ]]; then
  echo "C05 failed: winners=$winners losers=$losers"
  exit 1
fi
claim_state="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT status FROM public.trainee_password_recovery_requests WHERE id='$claim_request'")"
[[ "$claim_state" == "processing" ]] || { echo "C05 failed: final state=$claim_state"; exit 1; }
echo "C05 PASS: exactly one of $parallelism concurrent claims won"
