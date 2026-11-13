import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const migration = fs.readFileSync("supabase/migrations/202611130001_atomic_trainee_progress_rpc.sql", "utf8");

assert.match(html, /id="progressEntryPanel" style="display:none"/);
assert.match(html, /traineeCanEnter=activeProfile\?\.role==='trainee'/);
assert.match(html, /entryPanel\.style\.display=traineeCanEnter\?'block':'none'/);
assert.match(html, /authProfile\?\.role!=='trainee'/);
assert.match(html, /sbWrite\('\/rpc\/record_trainee_progress','POST'/);
assert.match(html, /async function saveProgress\(\)\{ return window\.saveProgress\(\); \}/);
assert.match(html, /const manualRows=list\.filter\(isProgressEntry\)/);
assert.match(html, /MANUAL_PROGRESS_ENTRY/);
assert.match(html, /sbGet\('\/weight_logs\?trainee_id=eq\./);
assert.match(html, /const coachRows=list\.filter\(x=>!isProgressEntry\(x\)\)/);
assert.match(html, /const weighted=manualRows\.filter/);
assert.match(html, /ثبت دستی شاگرد/);
assert.match(migration, /security invoker/i);
assert.match(migration, /private\.is_coach\(\)/);
assert.match(migration, /auth_user_id = auth\.uid\(\)[\s\S]*?approval_status = 'active'/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /MANUAL_PROGRESS_ENTRY: ثبت دستی و تأییدشده توسط شاگرد/);
assert.match(migration, /insert into public\.weight_logs[\s\S]*?insert into public\.body_analyses/i);
assert.match(html, /https:\/\/udptdznbvewkublvzmtm\.supabase\.co/);
assert.doesNotMatch(html, /qfakyudgidsumeuoqoot/);
console.log("Trainee progress preview regression checks passed.");
