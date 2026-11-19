import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const marker='<script id="SEH_AUTH_ENTRY_REDESIGN_V1">';
const markerStart=html.indexOf(marker);
assert.ok(markerStart>=0,'redesigned auth entry script must be present');
const scriptStart=html.indexOf('>',markerStart)+1;
const scriptEnd=html.indexOf('</script>',scriptStart);
assert.ok(scriptEnd>scriptStart,'auth entry script must close');
const authScript=html.slice(scriptStart,scriptEnd);

test('new auth entry exposes separate student, coach and new-member routes',()=>{
  assert.ok(authScript.includes('id="sehAuthHome"'));
  assert.ok(authScript.includes("sehAuthShow('student')"));
  assert.ok(authScript.includes("sehAuthShow('coach')"));
  assert.ok(authScript.includes("sehAuthShow('register')"));
});

test('existing student login route contains only phone and password fields',()=>{
  const start=authScript.indexOf('id="sehStudentLoginBlock"');
  const end=authScript.indexOf('</div>',start);
  const login=authScript.slice(start,end);
  assert.ok(start>=0 && end>start);
  assert.ok(login.includes('id="traineePhoneLogin"'));
  assert.ok(login.includes('id="traineeLoginPassword"'));
  assert.equal(/traineeReg(Name|Phone|Sessions|Days|Time|Password)/.test(login),false);
  assert.ok(login.includes('window.loginTraineePhone()'));
});

test('new registration validates and sends the personal password',()=>{
  for(const id of ['traineeRegName','traineeRegPhone','traineeRegSessions','traineeRegDays','traineeRegTime','traineeRegPassword','traineeRegPasswordConfirm']){
    assert.ok(authScript.includes('id="'+id+'"'),id+' must be present');
  }
  const start=html.indexOf('window.registerTraineePhone=async function(){');
  const end=html.indexOf('window.loginTraineePhone=async function(){',start);
  const handler=html.slice(start,end);
  assert.ok(handler.includes('passwordConfirm'));
  assert.ok(handler.includes('password!==passwordConfirm'));
  assert.ok(handler.includes('training_time, password'));
});

test('Supabase session persistence and restoration remain in place',()=>{
  assert.ok(html.includes('window.AUTH_SUPABASE=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY)'));
  assert.ok(html.includes('auth.getSession().then(({data})=>{if(data?.session)window.finishLogin(data.session.user);})'));
  assert.ok(html.includes('function restoreSavedSession()'));
});

test('auth entry navigation does not store passwords or sign out users',()=>{
  assert.equal(/localStorage|sessionStorage|signOut|history\.back\(/.test(authScript),false);
});

test('new auth entry JavaScript parses',()=>{
  assert.doesNotThrow(()=>new Function(authScript));
});
