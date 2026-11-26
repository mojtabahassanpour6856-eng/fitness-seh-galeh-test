(function(){
'use strict';
if(window.__sehRecoveryConnectedModuleInstalled)return;
window.__sehRecoveryConnectedModuleInstalled=true;

// Explicit release gate: absent/false by default. Never enable from this module.
const ENABLED = window.SEH_RECOVERY_CONNECTED_ENABLED === true;
const PROJECT_URL = (typeof SUPABASE_URL === 'string') ? SUPABASE_URL : '';
const PUBLIC_KEY = (typeof SUPABASE_KEY === 'string') ? SUPABASE_KEY : '';
const PREAUTH_URL = PROJECT_URL.replace(/\/$/,'') + '/functions/v1/trainee-password-recovery-preauth';
const COACH_URL = PROJECT_URL.replace(/\/$/,'') + '/functions/v1/trainee-password-recovery';
const STORE_KEY = 'seh.recovery.claim.v1';
const $ = id => document.getElementById(id);
const text = (id, value) => { const el=$(id); if(el) el.textContent=value; };
const normalizeDigits = value => String(value||'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
function normalizePhone(value){
 let p=normalizeDigits(value).trim().replace(/[\s()-]/g,'');
 if(p.startsWith('0098'))p='+'+p.slice(2);
 else if(p.startsWith('98'))p='+'+p;
 else if(/^09\d{9}$/.test(p))p='+98'+p.slice(1);
 return /^\+989\d{9}$/.test(p)?p:null;
}
function randomToken(){
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 let binary=''; for(const b of bytes)binary+=String.fromCharCode(b);
 return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
function loadClaim(){
 try{const value=JSON.parse(sessionStorage.getItem(STORE_KEY)||'null');
  if(value&&typeof value.request_id==='string'&&typeof value.claim_token==='string'&&value.expires_at>Date.now())return value;
 }catch(_){}
 return null;
}
function saveClaim(value){sessionStorage.setItem(STORE_KEY,JSON.stringify(value));}
function clearClaim(){try{sessionStorage.removeItem(STORE_KEY);}catch(_){}}
async function post(url,payload,accessToken){
 if(!PROJECT_URL||!PUBLIC_KEY)throw new Error('تنظیمات اتصال نسخه آزمایشی آماده نیست.');
 const headers={'Content-Type':'application/json','apikey':PUBLIC_KEY};
 if(accessToken)headers.Authorization='Bearer '+accessToken;
 const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(payload),credentials:'omit',cache:'no-store'});
 let body={};try{body=await response.json();}catch(_){}
 if(!response.ok)throw new Error(body.error||'ارتباط با سامانه بازیابی ناموفق بود.');
 return body;
}
function setBusy(button,busy,label){
 if(!button)return;button.disabled=busy;if(busy)button.dataset.oldLabel=button.textContent;
 else if(button.dataset.oldLabel){button.textContent=button.dataset.oldLabel;delete button.dataset.oldLabel;}
 if(busy&&label)button.textContent=label;
}
function ensureCoachControls(){
 const panel=$('sehCoachRecoveryPanel');if(!panel)return;
 const heading=panel.querySelector('.registration-requests-heading');
 if(!heading)return;
 let button=heading.querySelector('#sehCoachRecoveryRefreshBtn');
 if(!button){button=heading.querySelector('button');if(button){button.id='sehCoachRecoveryRefreshBtn';button.disabled=!ENABLED;button.textContent='🔄 به‌روزرسانی';}}
 let notice=panel.querySelector('.seh-recovery-preview-notice');if(notice&&ENABLED)notice.textContent='درخواست‌های بازیابی شاگردان متصل به حساب شما؛ کد بازیابی برای مربی نمایش داده نمی‌شود.';
 let list=$('sehCoachRecoveryList');
 if(!list){list=document.createElement('div');list.id='sehCoachRecoveryList';list.setAttribute('aria-live','polite');panel.appendChild(list);}
 if(button)button.disabled=!ENABLED;
}
function syncControls(){
 const panel=$('sehRecoveryStudentPanel');
 if(panel){
  ['sehRecoveryRequestBtn','sehRecoveryFetchCodeBtn','sehRecoveryCode','sehRecoveryNewPassword','sehRecoveryNewPassword2','sehRecoveryResetBtn'].forEach(id=>{const el=$(id);if(el)el.disabled=!ENABLED;});
  const notice=panel.querySelector('.seh-recovery-preview-notice');
  if(notice&&ENABLED)notice.textContent='بازیابی به‌صورت آزمایشی و بدون پیامک انجام می‌شود. کد فقط در همین مرورگر قابل دریافت است.';
 }
 ensureCoachControls();
}
function coachRole(){
 const profile=window.authProfile;
 return Boolean(profile&&profile.role==='coach')||/\|\s*مربی\s*$/.test(($('authUserText')?.textContent||'').trim());
}
async function studentRequest(){
 const phone=normalizePhone($('sehRecoveryPhone')?.value);
 if(!phone){text('sehRecoveryRequestStatus','شماره موبایل معتبر وارد کنید.');return;}
 const button=$('sehRecoveryRequestBtn');setBusy(button,true,'در حال ارسال درخواست…');
 try{
  let claim=loadClaim();
  if(!claim||claim.phone!==phone){
   claim={request_id:crypto.randomUUID(),claim_token:randomToken(),phone,expires_at:Date.now()+24*60*60*1000};
  }
  await post(PREAUTH_URL,{action:'request',phone,request_id:claim.request_id,claim_token:claim.claim_token});
  saveClaim(claim);
  text('sehRecoveryRequestStatus','درخواست شما برای بررسی مربی ارسال شد. پس از تأیید، از همین مرورگر کد را دریافت کنید.');
  const fetchButton=$('sehRecoveryFetchCodeBtn');if(fetchButton)fetchButton.disabled=false;
 }catch(error){text('sehRecoveryRequestStatus',error.message||'ارسال درخواست انجام نشد.');}
 finally{setBusy(button,false);}
}
async function studentFetchCode(){
 const claim=loadClaim();if(!claim){text('sehRecoveryCodeStatus','درخواست فعالی در این مرورگر پیدا نشد؛ دوباره درخواست ثبت کنید.');return;}
 const button=$('sehRecoveryFetchCodeBtn');setBusy(button,true,'در حال بررسی…');
 try{
  const result=await post(PREAUTH_URL,{action:'code',request_id:claim.request_id,claim_token:claim.claim_token});
  if(!result.success||!/^\d{4}$/.test(String(result.code||'')))throw new Error('کد هنوز صادر نشده یا معتبر نیست.');
  const code=$('sehRecoveryCode');if(code)code.value=result.code;
  ['sehRecoveryCode','sehRecoveryNewPassword','sehRecoveryNewPassword2','sehRecoveryResetBtn'].forEach(id=>{const el=$(id);if(el)el.disabled=false;});
  text('sehRecoveryCodeStatus','کد دریافت شد و تا زمان انقضای اعلام‌شده قابل استفاده است.');
 }catch(error){text('sehRecoveryCodeStatus',error.message||'دریافت کد انجام نشد.');}
 finally{setBusy(button,false);}
}
async function studentReset(){
 const claim=loadClaim();if(!claim){text('sehRecoveryResetStatus','درخواست بازیابی در این مرورگر پیدا نشد.');return;}
 const code=normalizeDigits($('sehRecoveryCode')?.value).trim();
 const password=$('sehRecoveryNewPassword')?.value||'';
 const repeat=$('sehRecoveryNewPassword2')?.value||'';
 if(!/^\d{4}$/.test(code)){text('sehRecoveryResetStatus','کد ۴ رقمی را وارد کنید.');return;}
 if(password.length<8||password.length>128){text('sehRecoveryResetStatus','رمز جدید باید حداقل ۸ و حداکثر ۱۲۸ کاراکتر باشد.');return;}
 if(password!==repeat){text('sehRecoveryResetStatus','تکرار رمز با رمز جدید یکسان نیست.');return;}
 const button=$('sehRecoveryResetBtn');setBusy(button,true,'در حال ثبت رمز جدید…');
 try{
  const result=await post(PREAUTH_URL,{action:'reset',request_id:claim.request_id,claim_token:claim.claim_token,code,new_password:password});
  if(!result.success)throw new Error('ثبت رمز جدید تأیید نشد.');
  clearClaim();
  ['sehRecoveryCode','sehRecoveryNewPassword','sehRecoveryNewPassword2'].forEach(id=>{const el=$(id);if(el)el.value='';});
  text('sehRecoveryResetStatus',result.message||'رمز جدید با موفقیت ثبت شد. اکنون با رمز جدید وارد شوید.');
 }catch(error){text('sehRecoveryResetStatus',error.message||'تغییر رمز انجام نشد.');}
 finally{setBusy(button,false);}
}
async function coachRefresh(){
 const client=window.AUTH_SUPABASE;
 if(!client?.auth){text('sehCoachRecoveryList','نشست مربی در دسترس نیست.');return;}
 const button=$('sehCoachRecoveryRefreshBtn');setBusy(button,true,'در حال دریافت…');
 try{
  const sessionResult=await client.auth.getSession();
  const token=sessionResult?.data?.session?.access_token;
  if(!token)throw new Error('ابتدا وارد حساب مربی شوید.');
  const result=await post(COACH_URL,{action:'list'},token);
  const list=$('sehCoachRecoveryList');if(!list)return;list.replaceChildren();
  const rows=Array.isArray(result.requests)?result.requests:[];
  if(!rows.length){list.textContent='درخواست در انتظار بررسی وجود ندارد.';return;}
  rows.forEach(row=>{
   const trainee=Array.isArray(row.trainees)?row.trainees[0]:row.trainees;
   const card=document.createElement('div');card.style.cssText='padding:12px;margin:9px 0;border:1px solid #d8c58f;border-radius:12px;background:#fffaf0;color:#42351b';
   const title=document.createElement('strong');title.textContent=trainee?.full_name||'شاگرد';card.appendChild(title);
   const detail=document.createElement('p');detail.textContent='درخواست بازیابی رمز · '+String(row.requested_at||'').slice(0,16).replace('T',' ');card.appendChild(detail);
   const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
   for(const [decision,label] of [['approve','تأیید درخواست'],['reject','رد درخواست']]){
    const action=document.createElement('button');action.type='button';action.textContent=label;action.dataset.requestId=row.id;action.dataset.decision=decision;action.className='secondary';actions.appendChild(action);
   }
   card.appendChild(actions);list.appendChild(card);
  });
 }catch(error){text('sehCoachRecoveryList',error.message||'دریافت درخواست‌ها انجام نشد.');}
 finally{setBusy(button,false);}
}
async function coachReview(button){
 const client=window.AUTH_SUPABASE;
 const sessionResult=await client.auth.getSession();
 const token=sessionResult?.data?.session?.access_token;
 if(!token)throw new Error('نشست مربی معتبر نیست.');
 setBusy(button,true,'در حال ثبت…');
 try{
  const result=await post(COACH_URL,{action:'review',request_id:button.dataset.requestId,decision:button.dataset.decision},token);
  if(!result.success)throw new Error('بررسی درخواست انجام نشد.');
  await coachRefresh();
 }finally{setBusy(button,false);}
}
document.addEventListener('click',async event=>{
 const button=event.target?.closest?.('button');if(!button)return;
 if(button.id==='sehRecoveryRequestBtn'){event.preventDefault();if(ENABLED)await studentRequest();}
 if(button.id==='sehRecoveryFetchCodeBtn'){event.preventDefault();if(ENABLED)await studentFetchCode();}
 if(button.id==='sehRecoveryResetBtn'){event.preventDefault();if(ENABLED)await studentReset();}
 if(button.id==='sehCoachRecoveryRefreshBtn'){event.preventDefault();if(ENABLED&&coachRole())await coachRefresh();}
 if(button.dataset.requestId&&button.dataset.decision){event.preventDefault();if(ENABLED&&coachRole()){try{await coachReview(button);}catch(error){text('sehCoachRecoveryList',error.message||'بررسی درخواست انجام نشد.');}}}
},true);
function start(){
 syncControls();
 const observer=new MutationObserver(syncControls);
 if(document.body)observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
