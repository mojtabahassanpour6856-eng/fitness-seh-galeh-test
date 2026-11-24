import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const functionUrl = Deno.env.get("RECOVERY_FUNCTION_URL")!;
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
async function createAccount(label: string, role: "coach" | "trainee") {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const password = "Initial-Strong-Password-2026!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error("fixture account creation failed");
  const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, role });
  if (profileError) throw new Error("fixture profile creation failed");
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw new Error("fixture sign-in failed");
  return { id: data.user.id, email, password, accessToken: session.session.access_token };
}
async function call(token: string, payload: Record<string, unknown>) {
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Origin: "http://127.0.0.1:55321" },
    body: JSON.stringify(payload),
  });
  let body: any = {};
  try { body = await response.json(); } catch { /* sanitized status assertion below */ }
  return { status: response.status, body };
}
const created: string[] = [];
try {
  const coachA = await createAccount("coach-a", "coach"); created.push(coachA.id);
  const coachB = await createAccount("coach-b", "coach"); created.push(coachB.id);
  const traineeA = await createAccount("trainee-a", "trainee"); created.push(traineeA.id);
  const traineeB = await createAccount("trainee-b", "trainee"); created.push(traineeB.id);

  const traineeRows = [
    { full_name: "E2E Trainee A", auth_user_id: traineeA.id, coach_user_id: coachA.id, phone_normalized: "+989120000001", approval_status: "active" },
    { full_name: "E2E Trainee B", auth_user_id: traineeB.id, coach_user_id: coachB.id, phone_normalized: "+989120000002", approval_status: "active" },
  ];
  const { data: inserted, error: traineeInsertError } = await admin.from("trainees").insert(traineeRows).select("id,auth_user_id");
  if (traineeInsertError || !inserted || inserted.length !== 2) throw new Error("fixture trainee linking failed");

  const request = await call(traineeA.accessToken, { action: "request" });
  assert(request.status === 201 && request.body.status === "pending" && typeof request.body.request_id === "string", "trainee request was not created");
  const requestId = request.body.request_id;

  const coachBList = await call(coachB.accessToken, { action: "list" });
  assert(coachBList.status === 200 && Array.isArray(coachBList.body.requests) && coachBList.body.requests.length === 0, "coach B saw coach A's request");
  const crossCoachApprove = await call(coachB.accessToken, { action: "review", request_id: requestId, decision: "approve" });
  assert(crossCoachApprove.status === 403, "coach B could act on coach A's request");

  const coachAList = await call(coachA.accessToken, { action: "list" });
  assert(coachAList.status === 200 && coachAList.body.requests.some((r: any) => r.id === requestId), "coach A could not list its trainee request");
  const approval = await call(coachA.accessToken, { action: "review", request_id: requestId, decision: "approve" });
  assert(approval.status === 200 && approval.body.status === "approved" && !("code" in approval.body), "coach approval leaked code or failed");

  const crossTraineeCode = await call(traineeB.accessToken, { action: "code", request_id: requestId });
  assert(crossTraineeCode.status === 404, "another trainee retrieved the recovery code");
  const codeResult = await call(traineeA.accessToken, { action: "code", request_id: requestId });
  assert(codeResult.status === 200 && typeof codeResult.body.code === "string" && codeResult.body.code.length === 4 && [...codeResult.body.code].every((c: string) => c >= "0" && c <= "9"), "owner trainee could not retrieve approved code");

  const newPassword = "New-Strong-Password-2026!";
  const reset = await call(traineeA.accessToken, { action: "reset", request_id: requestId, code: codeResult.body.code, new_password: newPassword });
  assert(reset.status === 200 && reset.body.success === true, "password reset did not complete");
  const { data: completed, error: completedError } = await admin.from("trainee_password_recovery_requests")
    .select("status,token_hash,code_envelope").eq("id", requestId).single();
  assert(!completedError && completed.status === "completed" && completed.token_hash === null && completed.code_envelope === null, "completed request retained recovery material");

  const traineeClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const oldLogin = await traineeClient.auth.signInWithPassword({ email: traineeA.email, password: traineeA.password });
  assert(!!oldLogin.error, "old password still works after reset");
  const newLogin = await traineeClient.auth.signInWithPassword({ email: traineeA.email, password: newPassword });
  assert(!!newLogin.data.session && !newLogin.error, "new password did not authenticate");

  const replay = await call(traineeA.accessToken, { action: "reset", request_id: requestId, code: codeResult.body.code, new_password: "Another-Strong-Password-2026!" });
  assert(replay.status !== 200, "completed recovery request was replayable");

  console.log("PASS: trainee request, coach isolation/approval, trainee-only code retrieval, one-time reset, old/new password Auth verification.");
} finally {
  for (const id of created.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error("fixture Auth cleanup failed");
  }
}
