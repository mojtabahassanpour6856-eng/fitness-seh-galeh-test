import { runPasswordResetAttempt } from "../supabase/functions/trainee-password-recovery/reset-attempt.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

Deno.test("delayed Auth request beyond lease expiry cannot be followed by a second password update", async () => {
  let now = 0;
  let state: "approved" | "processing" | "completed" = "approved";
  let leaseUntil = 0;
  let attemptOwner = "";
  let quarantined = false;
  let authCalls = 0;
  let authPassword = "old-password";
  const authStarted = deferred<void>();
  const releaseAuth = deferred<{ error: null }>();

  const admin = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "begin_or_resume_trainee_password_reset") {
        if (quarantined) return { data: "blocked_unknown_outcome", error: null };
        if (state === "approved") {
          state = "processing";
          attemptOwner = String(args.p_attempt_id);
          leaseUntil = now + Number(args.p_lease_seconds) * 1000;
          return { data: "acquired", error: null };
        }
        if (state === "processing" && leaseUntil > now) return { data: "busy", error: null };
        if (state === "processing") {
          quarantined = true;
          leaseUntil = 0;
          return { data: "blocked_unknown_outcome", error: null };
        }
        return { data: "invalid", error: null };
      }
      if (name === "mark_trainee_password_reset_reconciliation_required") {
        if (state === "processing" && attemptOwner === args.p_attempt_id) {
          quarantined = true;
          leaseUntil = 0;
          return { data: true, error: null };
        }
        return { data: false, error: null };
      }
      if (name === "finish_trainee_password_reset") {
        if (state === "processing" && !quarantined &&
            attemptOwner === args.p_attempt_id && leaseUntil > now) {
          state = "completed";
          return { data: true, error: null };
        }
        return { data: false, error: null };
      }
      throw new Error("unexpected RPC: " + name);
    },
    auth: {
      admin: {
        async updateUserById(_userId: string, attributes: { password: string }) {
          authCalls++;
          authStarted.resolve();
          const result = await releaseAuth.promise;
          // Simulate Auth applying the password only when its delayed request completes.
          authPassword = attributes.password;
          return result;
        },
      },
    },
  };

  const first = runPasswordResetAttempt({
    admin, userId: "trainee-auth-id", requestId: "request-1",
    attemptId: "attempt-A", expectedVerifier: "verifier", password: "password-P1",
  });

  await authStarted.promise;
  now = 121_000; // Advance beyond the 120-second DB lease while Auth remains unresolved.

  const second = await runPasswordResetAttempt({
    admin, userId: "trainee-auth-id", requestId: "request-1",
    attemptId: "attempt-B", expectedVerifier: "verifier", password: "password-P2",
  });

  assert(second.kind === "blocked_unknown_outcome", "second attempt must be durably blocked");
  assert(authCalls === 1, "second attempt must not dispatch a second Auth request");

  releaseAuth.resolve({ error: null });
  const firstResult = await first;

  assert(firstResult.kind === "completion_pending", "late first attempt must not clear quarantine");
  assert(authPassword === "password-P1", "only the delayed first password may have reached Auth");
  assert(authCalls === 1, "Auth call count must remain exactly one after late completion");
  assert(Boolean(quarantined), "request must remain quarantined after late completion");
});

Deno.test("a thrown transport error after Auth dispatch quarantines and blocks all later attempts", async () => {
  let authCalls = 0;
  let quarantined = false;
  let state: "approved" | "processing" = "approved";
  let attemptOwner = "";

  const admin = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "begin_or_resume_trainee_password_reset") {
        if (quarantined) return { data: "blocked_unknown_outcome", error: null };
        if (state === "approved") {
          state = "processing";
          attemptOwner = String(args.p_attempt_id);
          return { data: "acquired", error: null };
        }
        return { data: "busy", error: null };
      }
      if (name === "mark_trainee_password_reset_reconciliation_required") {
        if (attemptOwner === args.p_attempt_id) quarantined = true;
        return { data: quarantined, error: null };
      }
      throw new Error("unexpected RPC: " + name);
    },
    auth: {
      admin: {
        async updateUserById() {
          authCalls++;
          throw new Error("synthetic connection reset after dispatch");
        },
      },
    },
  };

  const first = await runPasswordResetAttempt({
    admin, userId: "trainee-auth-id", requestId: "request-2",
    attemptId: "attempt-C", expectedVerifier: "verifier", password: "password-P1",
  });
  const second = await runPasswordResetAttempt({
    admin, userId: "trainee-auth-id", requestId: "request-2",
    attemptId: "attempt-D", expectedVerifier: "verifier", password: "password-P2",
  });

  assert(first.kind === "auth_unknown", "transport exception must be classified as ambiguous");
  assert(second.kind === "blocked_unknown_outcome", "later attempt must be blocked");
  assert(authCalls === 1, "no second Auth request may be dispatched");
  assert(quarantined, "ambiguous outcome must persist quarantine");
});

Deno.test("a non-error RPC response that fails to confirm quarantine is reported as marker failure", async () => {
  let authCalls = 0;
  const admin = {
    async rpc(name: string) {
      if (name === "begin_or_resume_trainee_password_reset") return { data: "acquired", error: null };
      if (name === "mark_trainee_password_reset_reconciliation_required") return { data: false, error: null };
      throw new Error("unexpected RPC: " + name);
    },
    auth: {
      admin: {
        async updateUserById() {
          authCalls++;
          return { error: new Error("ambiguous provider result") };
        },
      },
    },
  };
  const result = await runPasswordResetAttempt({
    admin, userId: "trainee-auth-id", requestId: "request-3",
    attemptId: "attempt-E", expectedVerifier: "verifier", password: "password-P1",
  });
  assert(result.kind === "auth_unknown", "Auth outcome must remain ambiguous");
  assert(result.markerWriteFailed, "false marker result must be reported as a failed quarantine write");
  assert(authCalls === 1, "exactly one Auth dispatch is permitted");
});


Deno.test("fresh Edge invocation after ambiguous outcome reads durable quarantine and never redispatches Auth", async () => {
  const persisted = { state: "approved" as "approved" | "processing", owner: "", quarantined: false };
  let authCalls = 0;
  const makeAdmin = (throwAfterDispatch: boolean) => ({
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "begin_or_resume_trainee_password_reset") {
        if (persisted.quarantined) return { data: "blocked_unknown_outcome", error: null };
        if (persisted.state === "approved") {
          persisted.state = "processing";
          persisted.owner = String(args.p_attempt_id);
          return { data: "acquired", error: null };
        }
        return { data: "busy", error: null };
      }
      if (name === "mark_trainee_password_reset_reconciliation_required") {
        if (persisted.state === "processing" && persisted.owner === args.p_attempt_id) {
          persisted.quarantined = true;
          return { data: true, error: null };
        }
        return { data: false, error: null };
      }
      throw new Error("unexpected RPC " + name);
    },
    auth: { admin: { async updateUserById() {
      authCalls++;
      if (throwAfterDispatch) throw new Error("synthetic response lost after dispatch");
      return { error: null };
    } } },
  });

  const firstInvocation = await runPasswordResetAttempt({
    admin: makeAdmin(true), userId: "auth-user", requestId: "request-restart",
    attemptId: "attempt-first", expectedVerifier: "verifier", password: "candidate-1",
  });
  assert(firstInvocation.kind === "auth_unknown", "first invocation must quarantine unknown outcome");

  // Simulate a new Edge isolate/client with no in-memory state, backed by the same DB row.
  const restartedInvocation = await runPasswordResetAttempt({
    admin: makeAdmin(false), userId: "auth-user", requestId: "request-restart",
    attemptId: "attempt-after-restart", expectedVerifier: "verifier", password: "candidate-2",
  });
  assert(restartedInvocation.kind === "blocked_unknown_outcome", "new isolate must observe DB quarantine");
  assert(authCalls === 1, "new isolate must not dispatch a second Auth request");
});

Deno.test("two concurrent reset invocations dispatch at most one Auth update", async () => {
  let state: "approved" | "processing" | "completed" = "approved";
  let owner = "";
  let authCalls = 0;
  const admin = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "begin_or_resume_trainee_password_reset") {
        if (state === "approved") {
          state = "processing";
          owner = String(args.p_attempt_id);
          return { data: "acquired", error: null };
        }
        if (state === "processing") return { data: "busy", error: null };
        return { data: "invalid", error: null };
      }
      if (name === "finish_trainee_password_reset") {
        if (state === "processing" && owner === args.p_attempt_id) {
          state = "completed";
          return { data: true, error: null };
        }
        return { data: false, error: null };
      }
      throw new Error("unexpected RPC " + name);
    },
    auth: { admin: { async updateUserById() {
      authCalls++;
      return { error: null };
    } } },
  };
  const [one, two] = await Promise.all([
    runPasswordResetAttempt({
      admin, userId: "auth-user", requestId: "request-race",
      attemptId: "attempt-race-1", expectedVerifier: "verifier", password: "password-1",
    }),
    runPasswordResetAttempt({
      admin, userId: "auth-user", requestId: "request-race",
      attemptId: "attempt-race-2", expectedVerifier: "verifier", password: "password-2",
    }),
  ]);
  assert([one.kind, two.kind].filter(kind => kind === "completed").length === 1,
    "exactly one concurrent invocation should complete");
  assert([one.kind, two.kind].filter(kind => kind === "busy").length === 1,
    "the competing invocation must be rejected as busy");
  assert(authCalls === 1, "only the lease owner may dispatch Auth");
});
