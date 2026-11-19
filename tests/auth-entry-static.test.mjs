import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const match=html.match(/<script id="SEH_AUTH_ENTRY_REDESIGN_V1">([\\s\\S]*?)<\\/script>/);
assert.ok(match,'redesigned auth entry script must be present');
const authScript=match[1];

test('new auth entry exposes separate student, coach and new-member routes',()=>{
  assert.match(authScript,/id="sehAuthHome"/);
  assert.match(authScript,/sehAuthShow\\('student'\\)/);
  assert.match(authScript,/sehAuthShow\\('coach'\\)/);
  assert.match(authScript,/sehAuthShow\\('register'\\)/);
});

test('existing student login route contains only phone and password fields',()=>{
  const start=authScript.indexOf('id="sehStudentLoginBlock"');
  const end=authScript.indexOf('</div>',start);
  const login=authScript.slice(start,end);
  assert.ok(start>=0 && end>start);
  assert.match(login,/id="traineePhoneLogin"/);
  assert.match(login,/id="traineeLoginPassword"/);
  assert.doesNotMatch(login,/traineeReg(Name|Phone|Sessions|Days|Time|Password)/);
  assert.match(login,/window\\.loginTraineePhone\\(\\)/);
});

test('new registration retains the existing approved-request fields and validates a personal password',()=>{
  for(const id of ['traineeRegName','traineeRegPhone','traineeRegSessions','traineeRegDays','traineeRegTime','traineeRegPassword','traineeRegPasswordConfirm']){
    assert.ok(authScript.includes('id="'+id+'"'),id+' must be present');
  }
  const start=html.indexOf('window.registerTraineePhone=async function(){');
  const end=html.indexOf('window.loginTraineePhone=async function(){',start);
  const handler=html.slice(start,end);
  assert.match(handler,/passwordConfirm/);
  assert.match(handler,/password!==passwordConfirm/);
  assert.match(handler,/training_time, password/);
});

test('Supabase session persistence and restoration remain in place',()=>{
  assert.match(html,/window\\.AUTH_SUPABASE=window\\.supabase\\.createClient\\(SUPABASE_URL,SUPABASE_KEY\\)/);
  assert.match(html,/auth\\.getSession\\(\\)\\.then\\(\\(\\{data\\}\\)=>\\{if\\(data\\?\\.session\\)window\\.finishLogin\\(data\\.session\\.user\\);\\}\\)/);
  assert.match(html,/function restoreSavedSession\\(\\)/);
});

test('auth entry UI does not store a password or sign out on screen navigation',()=>{
  assert.doesNotMatch(authScript,/localStorage|sessionStorage|signOut/);
  assert.doesNotMatch(authScript,/password.{0,40}(setItem|storage)/i);
  assert.doesNotMatch(authScript,/history\\.back\\(/);
});

test('new auth entry JavaScript parses',()=>{
  assert.doesNotThrow(()=>new Function(authScript));
});
