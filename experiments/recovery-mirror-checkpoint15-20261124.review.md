# Recovery mirror checkpoint 15 — 2026-11-24

Scope: fresh GitHub review of mirror PR #15 and its current CI. Evidence-only checkpoint; no deployment authorization.

## PR snapshot

- Repository: `mojtabahassanpour6856-eng/fitness-seh-galeh-test`
- PR: #15 — `[TEST] اصلاح رابط بازیابی رمز شاگرد`
- State: open, Draft, unmerged; GitHub reports mergeable=true.
- Base: `integration/full-app-mirror-20261115`; current base tip `705692f6684cf18c5a4424247249f90b4051ef96`.
- Head: `fix/trainee-password-recovery-ui-20261122` at `5d433f03bd1741dc7e0d59f7a565adebceb81762`.
- PR comparison: 85 commits ahead, 2 commits behind; 51 changed files, 3,409 additions, 21 deletions.
- Since checkpoint head `0f540a7`, two commits added documentation only: checkpoint 14 and `docs/security/no-sms-trainee-password-recovery-spec.md`. No candidate Edge Function or candidate Outbox migration was added by those commits.

## Fresh CI evidence

- Workflow run #95, ID `45187209255`, associated with the current head: SUCCESS.
- `unit-test-recovery-crypto`: SUCCESS; runs isolated Deno tests for v11 crypto primitives.
- `compile-recovery-sql`: SUCCESS; initializes disposable PostgreSQL, applies the existing delivery-metadata draft, compiles the legacy core/attempt/delivery RPC drafts, checks service-role grants and function owner/search_path/ACL, then runs lifecycle smoke and 20-contender concurrency scripts.
- Scope limitation: this workflow does not execute the encrypted-Outbox candidate migration trio or a representative mirror-data preservation test. It is not a Supabase mirror run, Edge deployment, fake-provider E2E, or browser test.
- The concurrency harness still uses bare `wait` after parallel C01/C04/C05 batches, so individual child exit codes are not reliably aggregated. C08 still relies on `pg_sleep(5)` and shell `sleep 1`, rather than a deterministic barrier.

## New contract conflict

The newly added `no-sms-trainee-password-recovery-spec.md` explicitly excludes SMS providers and external delivery and says the approved code appears only on the authenticated trainee recovery page. The PR description/UI copy still promises a post-approval SMS code, while the requested acceptance gate expects a fake-provider queue and code receipt. These are not yet one canonical product/API contract. Resolve this before finalizing Edge v11 and E2E; do not silently choose one.

## Six gates

| Gate | Status | Evidence / blocker |
|---|---|---|
| 1. Full schema/data/constraints/indexes/RLS/grants preflight | Partial — not passed | Prior read-only schema notes exist, but RPC catalog/ownership/effective grants were inconclusive and no fresh live Supabase preflight was available in this run. Delivery/outbox columns are not present in the observed mirror schema. No recovery row contents were inspected. |
| 2. Ordered safe migrations + rollback | Partial — not passed | Existing metadata/core/attempt/delivery SQL files remain review-only drafts. The encrypted Outbox candidate trio is not ported as an ordered mirror migration set. |
| 3. Candidate migrations tested on disposable PostgreSQL | Partial — not passed | Run #95 passes legacy RPC/crypto tests, but does not execute the candidate trio, full preservation assertions, or corrected deterministic concurrency harness. |
| 4. Edge Function v11 on final RPC contract | Not passed | No v11 handler implementation in this PR; PR description still says active TEST Edge is v10. RPC/provider contract conflict remains. |
| 5. Synthetic request → coach approval → fake provider → code → test Auth reset | Not passed | No evidenced full HTTP/JWT + fake-provider + synthetic Auth lifecycle. New no-SMS spec conflicts with the fake-provider acceptance gate. |
| 6. Controlled mirror deployment + browser E2E | Not passed | No migration/Edge deploy and no final web-app browser E2E. |

**Confirmed completed gates: 0/6.** CI is green but does not close gate 3 or imply release readiness.

## Next safe work

1. Resolve and document the single canonical recovery delivery contract (fake provider in tests vs no external delivery).
2. Complete a read-only mirror schema/RPC/owner/effective-grant audit without reading historical recovery row contents.
3. Port and order the candidate migration trio against the mirror schema, preserving legacy rows; keep all SQL review-only.
4. Add a dedicated disposable-PostgreSQL job for that exact trio, full data-preservation and wrapper/outbox/payload ACL assertions; fix child PID aggregation and replace timing sleeps with deterministic synchronization.
5. Implement Edge v11 only after the RPC/actor-binding/delivery contract is frozen; then run synthetic fake-provider/Auth E2E before any mirror deployment.

## Safety

No Supabase SQL/DDL/DML, migration execution, Edge deployment, secret access/change, Mediana call, real SMS, real password reset, trainee-data reset/delete, merge, or main-branch change occurred. PR #15 remains Draft. All migrations remain review-only.
