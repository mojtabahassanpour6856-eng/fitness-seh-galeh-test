import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const coachFunctionUrl = Deno.env.get("RECOVERY_FUNCTION_URL")!;
const preauthFunctionUrl = Deno.env.get("RECOVERY_PREAUTH_FUNCTION_URL")!;
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const origin = Deno.env.get("RECOVERY_ALLOWED_ORIGIN") ?? "http://127.0.0.1:55321";
function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function randomClaim() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let raw = ""; for (const b of bytes) raw += String.fromCharCode(b);
  return { request_id: crypto.randomUUID(), claim_token: btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "") };
}
async function createAccount(label: string, role: "coach" | "trainee") {
  const email = label + "-" + crypto.randomUUID() + "@example.test";
  const password = "Initial-Strong-Password-2026!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error("fixture account creation failed: " + error?.message);
  const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, role });
  if (profileError) throw new Error("fixture profile creation failed");
  let accessToken = "";
  if (role === "coach") {
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError || !session.session) throw new Error("coach fixture sign-in failed");
    accessToken = session.session.access_token;
  }
  return { id: data.user.id, email, password, accessToken };
}
async function post(endpoint: string, payload: Record<string, unknown>, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Origin: origin };
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
  let body: any = {}; try { body = await response.json(); } catch { /* status checked below */ }
  return { status: response.status, body };
}
const created: string[] = [];
try {
  const coachA = await createAccount("preauth-coach-a", "coach"); created.push(coachA.id);
  const coachB = await createAccount("preauth-coach-b", "coach"); created.push(coachB.id);
  const traineeA = await createAccount("preauth-trainee-a", "trainee"); created.push(traineeA.id);
  const traineeB = await createAccount("preauth-trainee-b", "trainee"); created.push(traineeB.id);

  const { data: trainees, error: linkError } = await admin.from("trainees").insert([
    { full_name: "Preauth Trainee A", auth_user_id: traineeA.id, coach_user_id: coachA.id, phone_normalized: "+989120000011", approval_status: "active" },
    { full_name: "Preauth Trainee B", auth_user_id: traineeB.id, coach_user_id: coachB.id, phone_normalized: "+989120000012", approval_status: "active" },
  ]).select("id,auth_user_id");
  if (linkError || !trainees || trainees.length !== 2) throw new Error("trainee fixture linking failed");
  const traineeAId = trainees.find((x: any) => x.auth_user_id === traineeA.id)!.id;
  const traineeBId = trainees.find((x: any) => x.auth_user_id === traineeB.id)!.id;

  // Pre-auth request has no Authorization header. Unknown and known phones get the same public response.
  const claimA = randomClaim();
  const validRequest = await post(preauthFunctionUrl, { action: "request", phone: "+989120000011", ...claimA });
  const unknownClaim = randomClaim();
  const unknownRequest = await post(preauthFunctionUrl, { action: "request", phone: "+989120000099", ...unknownClaim });
  assert(validRequest.status === 202 && unknownRequest.status === 202 &&
    JSON.stringify(validRequest.body) === JSON.stringify(unknownRequest.body), "request response leaks account existence or requires JWT");

  const noJwtCoachList = await post(coachFunctionUrl, { action: "list" });
  assert(noJwtCoachList.status === 401, "coach endpoint accepted a request without JWT");

  const coachBList = await post(coachFunctionUrl, { action: "list" }, coachB.accessToken);
  assert(coachBList.status === 200 && (coachBList.body.requests ?? []).length === 0, "coach B saw coach A's request");
  const crossCoach = await post(coachFunctionUrl, { action: "review", request_id: claimA.request_id, decision: "approve" }, coachB.accessToken);
  assert(crossCoach.status === 403, "coach B acted on coach A's request");
  const coachAList = await post(coachFunctionUrl, { action: "list" }, coachA.accessToken);
  assert(coachAList.status === 200 && coachAList.body.requests.some((x: any) => x.id === claimA.request_id), "coach A cannot see own trainee request");
  const approvalA = await post(coachFunctionUrl, { action: "review", request_id: claimA.request_id, decision: "approve" }, coachA.accessToken);
  assert(approvalA.status === 200 && approvalA.body.status === "approved" && !("code" in approvalA.body) && !("recovery_code" in approvalA.body), "coach approval leaked recovery code");

  const wrongClaim = randomClaim();
  const stolenClaim = await post(preauthFunctionUrl, { action: "code", request_id: claimA.request_id, claim_token: wrongClaim.claim_token });
  assert(stolenClaim.status === 400, "unrelated browser claim retrieved the code");
  const codeA = await post(preauthFunctionUrl, { action: "code", ...claimA });
  assert(codeA.status === 200 && /^\d{4}$/.test(codeA.body.code), "original browser could not retrieve approved code without JWT");

  const newPassword = "New-Strong-Password-2026!";
  const resetA = await post(preauthFunctionUrl, { action: "reset", ...claimA, code: codeA.body.code, new_password: newPassword });
  assert(resetA.status === 200 && resetA.body.success === true, "pre-auth password reset did not complete");
  const { data: completed, error: completedError } = await admin.from("trainee_password_recovery_requests")
    .select("status,token_hash,code_envelope,claim_token_hash,claim_expires_at").eq("id", claimA.request_id).single();
  assert(!completedError && completed.status === "completed" && completed.token_hash === null &&
    completed.code_envelope === null && completed.claim_token_hash === null && completed.claim_expires_at === null,
    "completed request retained recovery material");
  const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const oldLogin = await authClient.auth.signInWithPassword({ email: traineeA.email, password: traineeA.password });
  assert(!!oldLogin.error, "old password still works");
  const newLogin = await authClient.auth.signInWithPassword({ email: traineeA.email, password: newPassword });
  assert(!!newLogin.data.session && !newLogin.error, "new password does not authenticate");
  const replay = await post(preauthFunctionUrl, { action: "reset", ...claimA, code: codeA.body.code, new_password: "Another-Strong-Password-2026!" });
  assert(replay.status !== 200, "completed claim was replayable");

  // Five bad codes atomically expire the second request and erase the verifier.
  const claimB = randomClaim();
  const requestB = await post(preauthFunctionUrl, { action: "request", phone: "+989120000012", ...claimB });
  assert(requestB.status === 202, "second pre-auth request failed");
  const approvalB = await post(coachFunctionUrl, { action: "review", request_id: claimB.request_id, decision: "approve" }, coachB.accessToken);
  assert(approvalB.status === 200, "coach B could not approve own trainee request");
  const issuedB = await post(preauthFunctionUrl, { action: "code", ...claimB });
  assert(issuedB.status === 200 && /^\d{4}$/.test(issuedB.body.code), "could not retrieve B code; HTTP " + issuedB.status + " body " + issuedB.body.error);
  const wrongCode = issuedB.body.code === "0000" ? "0001" : "0000";
  for (let i = 0; i < 5; i++) {
    const wrong = await post(preauthFunctionUrl, { action: "reset", ...claimB, code: wrongCode, new_password: "Another-Strong-Password-2026!" });
    assert(wrong.status === 400, "wrong code did not fail closed on attempt " + (i + 1));
  }
  const { data: locked, error: lockError } = await admin.from("trainee_password_recovery_requests")
    .select("status,token_hash,token_attempts").eq("id", claimB.request_id).single();
  assert(!lockError && locked.status === "expired" && locked.token_hash === null && Number(locked.token_attempts) === 5,
    "fifth wrong code did not expire and erase the verifier");

  // An expired browser claim cannot retrieve a code even if the request row is otherwise valid.
  const claimC = randomClaim();
  await post(preauthFunctionUrl, { action: "request", phone: "+989120000012", ...claimC });
  const approvalC = await post(coachFunctionUrl, { action: "review", request_id: claimC.request_id, decision: "approve" }, coachB.accessToken);
  assert(approvalC.status === 200, "third request approval failed");
  const { error: codeExpireError } = await admin.from("trainee_password_recovery_requests")
    .update({ token_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", claimC.request_id);
  assert(!codeExpireError, "could not prepare code-expiry fixture");
  const expiredCode = await post(preauthFunctionUrl, { action: "code", ...claimC });
  assert(expiredCode.status === 404, "expired 24-hour recovery code was returned");
  const { error: claimExpireError } = await admin.from("trainee_password_recovery_requests")
    .update({ claim_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", claimC.request_id);
  assert(!claimExpireError, "could not prepare claim-expiry fixture");
  const expiredClaim = await post(preauthFunctionUrl, { action: "code", ...claimC });
  assert(expiredClaim.status === 400, "expired browser claim was accepted");
  const claimD = randomClaim();
  const requestD = await post(preauthFunctionUrl, { action: "request", phone: "+989120000012", ...claimD });
  assert(requestD.status === 202, "fresh request after expiry was not accepted");
  const { data: freshRow, error: freshError } = await admin.from("trainee_password_recovery_requests")
    .select("status,claim_token_hash").eq("id", claimD.request_id).single();
  assert(!freshError && freshRow.status === "pending" && !!freshRow.claim_token_hash,
    "stale request was not expired and replaced");


  console.log("PASS: pre-auth no-JWT request/code/reset, account-enumeration response, browser claim isolation, coach JWT/ownership, code secrecy, real GoTrue reset, replay block, five-attempt lockout, and claim expiry.");
} finally {
  for (const id of created.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error("fixture Auth cleanup failed: " + error.message);
  }
}
