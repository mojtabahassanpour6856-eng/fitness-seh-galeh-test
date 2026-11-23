// Review-only tests for AES-GCM envelope binding. Run with Deno: deno test.
import { assertEquals, assertRejects } from "https://deno.land/std/assert/mod.ts";
import { encryptCode, decryptCode } from "./trainee-password-recovery-code-envelope.review.ts";

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const requestId = "11111111-1111-4111-8111-111111111111";
const traineeId = "22222222-2222-4222-8222-222222222222";
const expiry = "2026-11-24T12:00:00.000Z";

Deno.test("encrypted envelope round-trips four-digit code including leading zeroes", async () => {
  const envelope = await encryptCode("0042", key, requestId, traineeId, expiry);
  assertEquals(await decryptCode(envelope, key, requestId, traineeId, expiry), "0042");
});
Deno.test("AAD binds envelope to request, trainee, and expiry", async () => {
  const envelope = await encryptCode("1234", key, requestId, traineeId, expiry);
  await assertRejects(() => decryptCode(envelope, key, requestId, "33333333-3333-4333-8333-333333333333", expiry));
  await assertRejects(() => decryptCode(envelope, key, requestId, traineeId, "2026-11-25T12:00:00.000Z"));
});
Deno.test("wrong encryption key cannot decrypt", async () => {
  const envelope = await encryptCode("9999", key, requestId, traineeId, expiry);
  const otherKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(8))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  await assertRejects(() => decryptCode(envelope, otherKey, requestId, traineeId, expiry));
});
Deno.test("invalid code and malformed envelope are rejected", async () => {
  await assertRejects(() => encryptCode("42", key, requestId, traineeId, expiry));
  const envelope = await encryptCode("5678", key, requestId, traineeId, expiry);
  await assertRejects(() => decryptCode({ ...envelope, nonce: "x" }, key, requestId, traineeId, expiry));
});
