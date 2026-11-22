import {
  equalRecoveryMac,
  generateRecoveryCode,
  isCanonicalUuid,
  recoveryTokenHmac,
} from "./trainee-password-recovery-v11-security-primitives.review.ts";

Deno.test("recovery IDs require canonical UUIDs", () => {
  if (!isCanonicalUuid("00000000-0000-4000-8000-000000000001")) {
    throw new Error("valid UUID rejected");
  }
  for (const invalid of ["", "00000000-0000-0000-0000-000000000000", "abc", "00000000000040008000000000000001"]) {
    if (isCanonicalUuid(invalid)) throw new Error(`invalid UUID accepted: ${invalid}`);
  }
});

Deno.test("four-digit code generator preserves leading zeroes and range", () => {
  for (let i = 0; i < 20_000; i++) {
    const code = generateRecoveryCode();
    if (!/^\d{4}$/.test(code)) throw new Error(`invalid code shape: ${code}`);
    const value = Number(code);
    if (value < 0 || value > 9999) throw new Error(`out of range: ${code}`);
  }
});

Deno.test("HMAC is deterministic, request-bound, attempt-bound and code-bound", async () => {
  const pepper = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
  const requestId = "00000000-0000-4000-8000-000000000001";
  const attemptId = "00000000-0000-4000-8000-000000000002";
  const mac = await recoveryTokenHmac(pepper, requestId, attemptId, "0042");
  const expected = "963c30bcfdfb23360f78449ae12854371bf23c640ecebd2afecc7172ef292bea";
  if (mac !== expected) throw new Error("HMAC test vector mismatch");
  if (!equalRecoveryMac(mac, expected)) throw new Error("equal MAC rejected");
  if (equalRecoveryMac(mac, mac.slice(0, -1) + (mac.endsWith("0") ? "1" : "0"))) {
    throw new Error("different MAC accepted");
  }
  const otherRequest = await recoveryTokenHmac(
    pepper, "00000000-0000-4000-8000-000000000003", attemptId, "0042",
  );
  const otherAttempt = await recoveryTokenHmac(
    pepper, requestId, "00000000-0000-4000-8000-000000000004", "0042",
  );
  const otherCode = await recoveryTokenHmac(pepper, requestId, attemptId, "0043");
  if (mac === otherRequest || mac === otherAttempt || mac === otherCode) {
    throw new Error("HMAC is not bound to all recovery inputs");
  }
});

Deno.test("weak or malformed pepper is rejected", async () => {
  let rejected = false;
  try {
    await recoveryTokenHmac("AQ", "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002", "1234");
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("short pepper accepted");
});
