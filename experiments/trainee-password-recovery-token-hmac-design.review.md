# Recovery token HMAC design — review only

Date: 2026-11-22
Target: TEST Edge Function; proposal only.

## Problem

Current code uses a plain SHA-256 digest of a four-digit code. A four-digit value has only 10,000 candidates. If the recovery table or a backup is disclosed, an attacker can test all candidates offline. RLS and service-role-only access reduce exposure but do not make an unkeyed low-entropy digest safe after a data leak.

## Required design

- Introduce a dedicated secret such as `RECOVERY_TOKEN_PEPPER` in the TEST Edge Function environment.
- Generate a high-entropy random secret (at least 32 bytes) outside the code and store it only in the server-side secret manager.
- Never reuse `MEDIANA_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, JWT signing secrets, or any user password as the pepper.
- Use HMAC-SHA-256, not plain SHA-256, for recovery-code digests.
- Domain-separate the input and bind it to the recovery request ID. Once delivery attempt UUID exists, bind that too.
- Keep the existing `hash()` helper for the rate-limit key unchanged; introduce a separate `recoveryTokenDigest()` helper to avoid silently changing rate-limit behavior.
- Compare only fixed-length lowercase hex digests. Never log code, pepper, or digest.
- When the scheme is introduced, invalidate all outstanding tokens generated under the old unkeyed scheme. Do not support a fallback that accepts both schemes.

## TypeScript sketch (not deployed)

```ts
async function recoveryTokenDigest(
  requestId: string,
  code: string,
  attemptId: string,
) {
  const pepper = Deno.env.get("RECOVERY_TOKEN_PEPPER");
  if (!pepper) throw new Error("recovery token configuration unavailable");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = `fitness-seh-galeh:trainee-recovery:v1:${requestId}:${attemptId}:${code}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

The request ID and attempt UUID must be generated/known before the digest is created. Approval should atomically persist the attempt UUID and digest. Reset must load the current attempt UUID and recompute the digest with the same values.

## Secret provisioning and rotation

1. Provision a random pepper in TEST only; never print its value in logs or chat.
2. Deploy the matching function version only after schema and test work is complete.
3. Expire all outstanding old-format recovery codes before switching validation.
4. On pepper rotation, expire all active tokens and require a fresh coach-approved request, unless a carefully designed versioned keyring is explicitly approved.
5. Do not store the pepper in Postgres, GitHub, the client app, or a public build variable.

## Tests

- Missing pepper fails closed with a generic server error.
- Correct code + correct request ID + current attempt UUID matches.
- Same code with a different request ID does not match.
- Same code with a different attempt UUID does not match.
- Old SHA-256 token hashes are rejected after cutover.
- Logs and API responses contain no code, pepper, or token digest.
- Rate-limit key derivation remains unchanged.

## Status

Design only. No secret was provisioned or read; no code deployed; no database write; no SMS sent; no password changed.