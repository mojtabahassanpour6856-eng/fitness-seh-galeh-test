# TEST function ownership and privilege audit — password recovery

Read-only catalog inspection: 2026-11-22  
Project: `udptdznbvewkublvzmtm` only.

No application rows were selected. No function, grant, table, or policy was changed.

## Recovery table

- Owner: `postgres`.
- Explicit ACL:
  - `postgres`: full table privileges.
  - `service_role`: full table privileges.
- This matches the Edge Function's service-role access pattern. Keep browser roles denied by RLS; do not add anon/authenticated grants.

## Existing rate-limit RPC

Function: `public.consume_registration_rate_limit(text, integer, integer)`  
Return: boolean  
Owner: `postgres`  
SECURITY DEFINER: yes  
Volatility: volatile  
search_path: empty string (fixed/empty)  
Execute ACL: `postgres` and `service_role`; no anon/authenticated execute grant was present.

Observed implementation:
- Validates SHA-256 hex key (64 lowercase hex chars).
- Bounds window to 60..86400 seconds.
- Bounds maximum requests to 1..100.
- Atomically inserts/updates `private.registration_rate_limits` using `INSERT ... ON CONFLICT DO UPDATE`.
- Returns whether the updated count is within the configured maximum.

## Security assessment

1. The rate-limit function uses a safe empty search_path and schema-qualified objects; preserve that pattern.
2. It is SECURITY DEFINER, so ownership and execute ACL are security-critical. Do not grant execute to browser roles.
3. Its atomic upsert is a sound concurrency pattern for rate limiting.
4. The function writes to a private schema table. Its current behavior was inspected from the function definition only; no private table rows were read.
5. The table ACL grants service_role direct full access, consistent with the current Edge Function design. This does not justify granting access to authenticated or anon.

## Implications for the proposed failed-attempt RPC

- Prefer a narrowly scoped SECURITY DEFINER function owned by postgres, with an empty or tightly fixed search_path and fully schema-qualified table references.
- Revoke execute from PUBLIC, anon, authenticated; grant only to service_role.
- Include all guards in one conditional UPDATE: request id, approved status, expected token hash, non-expired token, and attempts below 5.
- Return only a boolean/attempt count/expired indicator; never return the submitted code, stored hash, or phone.
- Do not let the RPC accept arbitrary trainee IDs or phone numbers.
- Before implementation, verify the RPC owner and ACL after creation, then test concurrency only in a disposable TEST clone.

## Outstanding checks

- Inspect private rate-limit table owner, RLS, and ACL (metadata only).
- Inspect the full Edge Function's exact RPC call arguments and error handling against this signature.
- Confirm the Mediana provider contract before implementing delivery-state transitions.
- No browser test has been claimed or performed.

## Safety

No SQL mutation or migration; no Edge Function edit/deploy; no SMS; no password reset; no production access or changes.
