// Shared orchestration for the no-SMS trainee password reset.
// Kept dependency-injected so CI can exercise the Auth/DB boundary with a barrier-controlled fake.
export type PasswordResetAttemptResult =
  | { kind: "lease_error" }
  | { kind: "busy" }
  | { kind: "blocked_unknown_outcome" }
  | { kind: "invalid" }
  | { kind: "auth_rejected"; leaseReleaseFailed: boolean }
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

// Only these explicit Auth validation responses are treated as proof that no password
// mutation occurred. Generic 4xx/5xx, missing codes, and transport failures stay ambiguous.
function isDefinitiveNoMutationAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: unknown; code?: unknown; name?: unknown };
  const status = Number(value.status);
  const code = typeof value.code === "string" ? value.code : "";
  return (status === 400 || status === 422) &&
    new Set(["weak_password", "same_password", "validation_failed"]).has(code);
}

async function releaseDefinitiveRejection(
  admin: AdminClient,
  requestId: string,
  attemptId: string,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("release_trainee_password_reset_lease", {
      p_request_id: requestId,
      p_attempt_id: attemptId,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

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
  let authError: unknown = null;
  let authThrew = false;
  try {
    const result = await admin.auth.admin.updateUserById(userId, { password });
    authError = result.error;
  } catch (error) {
    authThrew = true;
    authError = error;
  }

  if (authThrew || authError) {
    if (!authThrew && isDefinitiveNoMutationAuthError(authError)) {
      const released = await releaseDefinitiveRejection(admin, requestId, attemptId);
      if (released) return { kind: "auth_rejected", leaseReleaseFailed: false };
      // A proven provider rejection is safe, but a failed DB release leaves state uncertain.
      // Quarantine rather than allowing another attempt to inherit a stale processing row.
      const markerWriteFailed = await markUnknown(admin, requestId, attemptId);
      return { kind: "auth_rejected", leaseReleaseFailed: true };
    }
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
