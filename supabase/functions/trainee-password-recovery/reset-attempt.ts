// Shared orchestration for the no-SMS trainee password reset.
// Kept dependency-injected so CI can exercise the Auth/DB boundary with a barrier-controlled fake.
export type PasswordResetAttemptResult =
  | { kind: "lease_error" }
  | { kind: "busy" }
  | { kind: "blocked_unknown_outcome" }
  | { kind: "invalid" }
  | { kind: "auth_unknown"; markerWriteFailed: boolean }
  | { kind: "completion_pending"; markerWriteFailed: boolean }
  | { kind: "completed" };

type AdminClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  auth: {
    admin: {
      updateUserById: (userId: string, attributes: { password: string }) =>
        Promise<{ data?: unknown; error: unknown }>;
    };
  };
};

async function markUnknown(admin: AdminClient, requestId: string, attemptId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("mark_trainee_password_reset_reconciliation_required", {
      p_request_id: requestId,
      p_attempt_id: attemptId,
    });
    return Boolean(error) || data !== true;
  } catch {
    // The row remains processing; after lease expiry, begin() must quarantine it fail-closed.
    return true;
  }
}

export async function runPasswordResetAttempt(input: {
  admin: AdminClient;
  userId: string;
  requestId: string;
  attemptId: string;
  expectedVerifier: string;
  password: string;
  leaseSeconds?: number;
}): Promise<PasswordResetAttemptResult> {
  const { admin, userId, requestId, attemptId, expectedVerifier, password } = input;

  let leaseState: unknown;
  try {
    const result = await admin.rpc("begin_or_resume_trainee_password_reset", {
      p_request_id: requestId,
      p_expected_verifier: expectedVerifier,
      p_attempt_id: attemptId,
      p_lease_seconds: input.leaseSeconds ?? 120,
    });
    if (result.error) return { kind: "lease_error" };
    leaseState = result.data;
  } catch {
    return { kind: "lease_error" };
  }

  if (leaseState === "busy") return { kind: "busy" };
  if (leaseState === "blocked_unknown_outcome") return { kind: "blocked_unknown_outcome" };
  if (leaseState !== "acquired") return { kind: "invalid" };

  // Any thrown transport exception or provider error is ambiguous. Never automatically retry.
  let authFailed = false;
  try {
    const result = await admin.auth.admin.updateUserById(userId, { password });
    authFailed = Boolean(result.error);
  } catch {
    authFailed = true;
  }

  if (authFailed) {
    const markerWriteFailed = await markUnknown(admin, requestId, attemptId);
    return { kind: "auth_unknown", markerWriteFailed };
  }

  let completionConfirmed = false;
  try {
    const result = await admin.rpc("finish_trainee_password_reset", {
      p_request_id: requestId,
      p_attempt_id: attemptId,
      p_expected_verifier: expectedVerifier,
    });
    completionConfirmed = !result.error && result.data === true;
  } catch {
    completionConfirmed = false;
  }

  if (!completionConfirmed) {
    const markerWriteFailed = await markUnknown(admin, requestId, attemptId);
    return { kind: "completion_pending", markerWriteFailed };
  }

  return { kind: "completed" };
}
