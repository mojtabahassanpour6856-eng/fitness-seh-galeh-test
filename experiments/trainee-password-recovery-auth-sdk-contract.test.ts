import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";
import { runPasswordResetAttempt } from "../supabase/functions/trainee-password-recovery/reset-attempt.ts";

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

const userId = "10000000-0000-4000-8000-000000000001";
const requestId = "20000000-0000-4000-8000-000000000001";
const verifier = "v".repeat(43);

function makeAdmin(response: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const rpcCalls: string[] = [];
  const client = createClient("https://auth-contract.invalid", "service-role-test-key", {
    global: { fetch: response as typeof fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = {
    rpc: async (name: string) => {
      rpcCalls.push(name);
      if (name === "begin_or_resume_trainee_password_reset") return { data: "acquired", error: null };
      if (name === "release_trainee_password_reset_lease") return { data: true, error: null };
      if (name === "mark_trainee_password_reset_reconciliation_required") return { data: true, error: null };
      throw new Error("unexpected RPC " + name);
    },
    auth: client.auth,
  };
  return { admin, rpcCalls };
}

Deno.test("pinned Supabase SDK returns the exact weak-password error class used by the safe classifier", async () => {
  const { admin, rpcCalls } = makeAdmin(() => new Response(JSON.stringify({
    error_code: "weak_password",
    msg: "Password does not meet strength requirements",
    weak_password: { reasons: ["length"] },
  }), { status: 422, headers: { "Content-Type": "application/json" } }));

  const result = await runPasswordResetAttempt({
    admin, userId, requestId, attemptId: crypto.randomUUID(),
    expectedVerifier: verifier, password: "weak",
  });
  assert(result.kind === "auth_rejected" && !result.leaseReleaseFailed,
    "SDK weak_password response must release the matching lease");
  assert(rpcCalls.includes("release_trainee_password_reset_lease"),
    "SDK weak_password response must invoke release RPC");
  assert(!rpcCalls.includes("mark_trainee_password_reset_reconciliation_required"),
    "SDK weak_password response must not be quarantined");
});

Deno.test("pinned Supabase SDK returns AuthApiError for same_password and safely releases lease", async () => {
  const { admin, rpcCalls } = makeAdmin(() => new Response(JSON.stringify({
    error_code: "same_password",
    msg: "New password should be different from the old password",
  }), { status: 422, headers: { "Content-Type": "application/json" } }));

  const result = await runPasswordResetAttempt({
    admin, userId, requestId, attemptId: crypto.randomUUID(),
    expectedVerifier: verifier, password: "same-password",
  });
  assert(result.kind === "auth_rejected" && !result.leaseReleaseFailed,
    "SDK same_password response must release the matching lease");
  assert(rpcCalls.includes("release_trainee_password_reset_lease"),
    "SDK same_password response must invoke release RPC");
});

Deno.test("pinned Supabase SDK maps Auth 500 to retryable error and orchestration quarantines", async () => {
  const { admin, rpcCalls } = makeAdmin(() => new Response(JSON.stringify({
    error_code: "unexpected_failure",
    msg: "Auth service failure",
  }), { status: 500, headers: { "Content-Type": "application/json" } }));

  const result = await runPasswordResetAttempt({
    admin, userId, requestId, attemptId: crypto.randomUUID(),
    expectedVerifier: verifier, password: "candidate-password",
  });
  assert(result.kind === "auth_unknown", "SDK 500 response must remain ambiguous");
  assert(rpcCalls.includes("mark_trainee_password_reset_reconciliation_required"),
    "SDK 500 response must trigger quarantine");
  assert(!rpcCalls.includes("release_trainee_password_reset_lease"),
    "SDK 500 response must never release lease");
});

Deno.test("pinned Supabase SDK maps transport failure to retryable error and orchestration quarantines", async () => {
  const { admin, rpcCalls } = makeAdmin(async () => {
    throw new TypeError("synthetic network connection reset");
  });

  const result = await runPasswordResetAttempt({
    admin, userId, requestId, attemptId: crypto.randomUUID(),
    expectedVerifier: verifier, password: "candidate-password",
  });
  assert(result.kind === "auth_unknown", "SDK transport error must remain ambiguous");
  assert(rpcCalls.includes("mark_trainee_password_reset_reconciliation_required"),
    "SDK transport error must trigger quarantine");
  assert(!rpcCalls.includes("release_trainee_password_reset_lease"),
    "SDK transport error must never release lease");
});
