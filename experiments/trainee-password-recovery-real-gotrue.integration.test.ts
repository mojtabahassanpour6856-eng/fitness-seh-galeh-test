import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
if (!url || !serviceKey || !anonKey) {
  throw new Error("Missing local-only Supabase Auth integration environment");
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.test("real local GoTrue: admin password update invalidates old password and accepts new password", async () => {
  const suffix = crypto.randomUUID();
  const email = `recovery-auth-${suffix}@example.test`;
  const oldPassword = `Old!Aa9-${suffix}`;
  const newPassword = `New!Bb8-${crypto.randomUUID()}`;
  let userId: string | undefined;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password: oldPassword,
      email_confirm: true,
      user_metadata: { test_fixture: "no-sms-recovery-auth-ci" },
    });
    assert(!created.error && created.data.user, "GoTrue must create the disposable fixture user");
    userId = created.data.user.id;

    const oldLoginBefore = await publicClient.auth.signInWithPassword({
      email,
      password: oldPassword,
    });
    assert(!oldLoginBefore.error && oldLoginBefore.data.user?.id === userId,
      "original disposable password must authenticate before reset");

    const changed = await admin.auth.admin.updateUserById(userId, { password: newPassword });
    assert(!changed.error && changed.data.user?.id === userId,
      "real GoTrue admin.updateUserById must accept the new password");

    const oldLoginAfter = await publicClient.auth.signInWithPassword({
      email,
      password: oldPassword,
    });
    assert(Boolean(oldLoginAfter.error) && !oldLoginAfter.data.user,
      "old password must no longer authenticate after reset");

    const newLogin = await publicClient.auth.signInWithPassword({
      email,
      password: newPassword,
    });
    assert(!newLogin.error && newLogin.data.user?.id === userId,
      "new password must authenticate after reset");
    await publicClient.auth.signOut();
  } finally {
    if (userId) {
      const removed = await admin.auth.admin.deleteUser(userId);
      assert(!removed.error, "disposable GoTrue fixture user must be deleted");
    }
  }
});
