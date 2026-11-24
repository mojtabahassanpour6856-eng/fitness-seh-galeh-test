import { runPasswordResetAttempt } from "../supabase/functions/trainee-password-recovery/reset-attempt.ts";

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

Deno.test("explicit weak_password Auth validation response safely releases lease", async () => {
  const calls: string[] = [];
  const admin = {
    async rpc(name: string) {
      calls.push(name);
      if (name === "begin_or_resume_trainee_password_reset") return { data: "acquired", error: null };
      if (name === "release_trainee_password_reset_lease") return { data: true, error: null };
      throw new Error("unexpected RPC " + name);
    },
    auth: { admin: { async updateUserById() {
      return { error: Object.assign(new Error("weak password"), { status: 422, code: "weak_password" }) };
    } } },
  };
  const result = await runPasswordResetAttempt({
    admin, userId: "auth-user", requestId: "request", attemptId: "attempt",
    expectedVerifier: "verifier", password: "weak",
  });
  assert(result.kind === "auth_rejected" && !result.leaseReleaseFailed, "known validation rejection should release");
  assert(calls.includes("release_trainee_password_reset_lease"), "release RPC must run");
  assert(!calls.includes("mark_trainee_password_reset_reconciliation_required"), "known rejection is not ambiguous");
});

Deno.test("generic Auth 400 remains ambiguous and is quarantined", async () => {
  const calls: string[] = [];
  const admin = {
    async rpc(name: string) {
      calls.push(name);
      if (name === "begin_or_resume_trainee_password_reset") return { data: "acquired", error: null };
      if (name === "mark_trainee_password_reset_reconciliation_required") return { data: true, error: null };
      throw new Error("unexpected RPC " + name);
    },
    auth: { admin: { async updateUserById() {
      return { error: Object.assign(new Error("bad request"), { status: 400, code: "other" }) };
    } } },
  };
  const result = await runPasswordResetAttempt({
    admin, userId: "auth-user", requestId: "request", attemptId: "attempt",
    expectedVerifier: "verifier", password: "candidate-password",
  });
  assert(result.kind === "auth_unknown", "unrecognized Auth response must be ambiguous");
  assert(calls.includes("mark_trainee_password_reset_reconciliation_required"), "quarantine must be written");
  assert(!calls.includes("release_trainee_password_reset_lease"), "generic 400 must not release");
});

Deno.test("failed DB release after definitive Auth rejection falls back to quarantine", async () => {
  const calls: string[] = [];
  const admin = {
    async rpc(name: string) {
      calls.push(name);
      if (name === "begin_or_resume_trainee_password_reset") return { data: "acquired", error: null };
      if (name === "release_trainee_password_reset_lease") return { data: false, error: null };
      if (name === "mark_trainee_password_reset_reconciliation_required") return { data: true, error: null };
      throw new Error("unexpected RPC " + name);
    },
    auth: { admin: { async updateUserById() {
      return { error: Object.assign(new Error("weak password"), { status: 422, code: "weak_password" }) };
    } } },
  };
  const result = await runPasswordResetAttempt({
    admin, userId: "auth-user", requestId: "request", attemptId: "attempt",
    expectedVerifier: "verifier", password: "weak",
  });
  assert(result.kind === "auth_rejected" && result.leaseReleaseFailed, "failed release must be explicit");
  assert(calls.includes("mark_trainee_password_reset_reconciliation_required"), "failed release must quarantine");
});
