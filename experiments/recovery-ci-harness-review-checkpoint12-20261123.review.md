# Checkpoint 12 — CI harness reliability and coverage review (2026-11-23)

Static review of mirror PR #15 CI fixture, smoke tests, security assertions, concurrency script, and workflow. No CI run was initiated. No databases or Supabase projects were touched.

## Findings

### 1) Concurrency script can mask background process failures (high priority)
In `experiments/ci/recovery-postgres-concurrency-tests.sh`, three groups launch multiple `psql` processes and use bare `wait`:
- C01 request creation race
- C04 failed-attempt race
- C05 correct-code claim race

Bare `wait` waits for background jobs but does not reliably aggregate every child's exit code for fail-closed assertions. Collect each PID and explicitly `wait "$pid"` for every process; abort if any fails. Result-line counts catch many failures, but not all command failures or malformed outputs.

### 2) Reassignment race test relies on timing (medium)
C08 uses `pg_sleep(5)` in Session A and `sleep 1` in the shell before Session B. This is timing-based and may be flaky on slow CI. Prefer a deterministic barrier: signal readiness from Session A after acquiring the lock, then launch approval, and assert the lock/wait ordering before releasing Session A.

### 3) Existing fixture and workflow cover legacy RPCs, not the newer candidate migration trio (critical scope limitation)
The fixture/workflow compiles and tests the legacy compatibility RPC files. It does not apply:
- `20261122_recovery_atomic_rpc_candidate.sql`
- `20261122_recovery_outbox_worker_candidate.sql`
- `20261122_recovery_encrypted_delivery_payload_candidate.sql`

Therefore green CI cannot be used as evidence that the new atomic/Outbox/encrypted candidates compile or behave safely. Candidate-specific CI should be separate, isolated, and only added after the fixture faithfully provides required roles, extensions, tables, ownership, and schemas.

### 4) Security assertions validate only six legacy RPCs
The assertions cover six public legacy RPC names. They do not enumerate new candidate wrapper/private functions or Outbox table grants, trigger functions, encrypted payload-fetch wrapper, worker functions, or candidate schema exposure. A future candidate test must assert these separately.

### 5) Smoke/concurrency tests are synthetic, which is appropriate
The fixture uses synthetic UUIDs and Iranian-format test phones. No live trainee data is included. Keep this separation.

## Safe recommendations
- Add per-PID wait/exit aggregation to all three concurrency batches.
- Replace sleep-based C08 orchestration with deterministic synchronization.
- Keep legacy and candidate CI results clearly separated in labels and reports.
- Add candidate-specific catalog/ACL assertions before execution is treated as a release gate.
- Do not deploy or merge based on legacy CI alone.

## Verdict
Mirror CI harness review found reliability and coverage limitations. This is static analysis only; no CI result or runtime pass is claimed.
