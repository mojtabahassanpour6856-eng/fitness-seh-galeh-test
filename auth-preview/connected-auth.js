(function(){
'use strict';
if(window.__sehAuthRedesignConnected||window.__sehAuthRedesignConnecting)return;
const root=document.getElementById('authScreen'),card=root&&root.querySelector('.auth-card');
const coach=document.getElementById('coachLoginBox'),trainee=document.getElementById('traineeLoginBox'),error=document.getElementById('authError'),tabs=document.getElementById('authTabs');
if(!root||!card||!coach||!trainee||!error)return;
// Mark initialization as in progress; success is recorded only after the complete DOM mount.
window.__sehAuthRedesignConnecting=true;
const st=document.createElement('style');st.id='seh-auth-redesign-connected-style';
st.textContent='#authScreen{position:fixed!important;inset:0!important;z-index:99999!important;overflow-y:auto!important;background:radial-gradient(ellipse at 50% -15%,#1a2b3b 0,transparent 48%),#070b11!important;padding:0!important}#authScreen .auth-card{width:min(100%,480px)!important;min-height:100vh!important;margin:0 auto!important;padding:clamp(16px,4vw,26px)!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;display:flex!important;flex-direction:column!important}#authScreen .seh-top{display:flex;justify-content:space-between;align-items:center;color:#aeb9c5;font-size:11px;margin-bottom:25px}#authScreen .seh-tag{border:1px solid #66501b;color:#ffd46a;border-radius:30px;padding:6px 10px}#authScreen .seh-brand{text-align:center;margin:4px 0 28px}#authScreen .seh-mark{width:82px;height:82px;margin:0 auto 13px;border-radius:23px;display:grid;place-items:center;background:linear-gradient(145deg,#ffcf4d,#d99500);padding:7px;box-shadow:0 9px 30px #ffbd1626;overflow:hidden}#authScreen .seh-mark img{display:block;width:100%;height:100%;object-fit:contain;border-radius:17px}#authScreen .seh-choice{position:relative;overflow:hidden;min-height:116px;padding:14px 13px}#authScreen .seh-choice:after{content:"";position:absolute;width:120px;height:120px;left:-22px;bottom:-55px;border-radius:50%;background:radial-gradient(circle,#ffbd1622,transparent 68%);pointer-events:none}#authScreen .seh-art{width:88px;height:88px;flex:0 0 88px;display:grid;place-items:center;border-radius:16px;background:linear-gradient(145deg,#1d3041,#101a25);border:1px solid #34495a;overflow:hidden}#authScreen .seh-art svg{width:100%;height:100%;display:block}#authScreen .seh-art img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;border-radius:16px}#authScreen .seh-art{width:112px;height:112px;flex-basis:112px;border-radius:17px;box-shadow:0 9px 22px #0005}#authScreen .seh-art svg{filter:drop-shadow(0 5px 5px #0005)}#authScreen[data-seh-view=register] #sehRegisterMount .seh-reg-block{display:block!important}#authScreen .seh-choice.primary .seh-art{background:linear-gradient(145deg,#3a3016,#18202a);border-color:#9c771f}#authScreen .seh-choice .seh-ico{display:none}#authScreen .seh-copy{position:relative;z-index:1}#authScreen .seh-arrow{position:relative;z-index:1}#authScreen .seh-brand h2{font-size:23px!important;margin:0!important;color:#f7f8fa}#authScreen .seh-brand p{margin:8px 0 0!important;color:#aeb9c5;font-size:12px;line-height:1.8;text-align:center}#authScreen .seh-view{display:none}#authScreen[data-seh-view=home] #sehAuthHome,#authScreen[data-seh-view=trainee] #sehAuthTrainee,#authScreen[data-seh-view=coach] #sehAuthCoach,#authScreen[data-seh-view=register] #sehAuthRegister,#authScreen[data-seh-view=recovery] #sehAuthRecovery{display:block}#authScreen .seh-welcome{margin-bottom:19px}#authScreen .seh-eyebrow{color:#ffbd16;font-size:11px;font-weight:bold}#authScreen .seh-welcome h3,#authScreen .seh-heading h3{font-size:21px;margin:8px 0 7px;color:#f7f8fa}#authScreen .seh-welcome p,#authScreen .seh-heading p{font-size:12px;line-height:1.9;color:#aeb9c5;margin:0}#authScreen .seh-choices{display:grid;gap:12px}#authScreen .seh-choice{display:flex;align-items:center;gap:14px;width:100%;padding:17px 15px;text-align:right;background:linear-gradient(115deg,#152332,#101923);border:1px solid #2c4052;border-radius:17px;color:#f7f8fa;cursor:pointer}#authScreen .seh-choice.primary{border-color:#b88614;background:linear-gradient(115deg,#252313,#141b22)}#authScreen .seh-ico{width:48px;height:48px;flex:0 0 48px;border-radius:14px;display:grid;place-items:center;background:#ffbd161a;color:#ffbd16;font-size:23px}#authScreen .seh-choice.primary .seh-ico{background:#ffbd16;color:#17120a}#authScreen .seh-copy{flex:1}#authScreen .seh-copy b{display:block;font-size:15px;margin-bottom:6px}#authScreen .seh-copy small{display:block;color:#aeb9c5;font-size:11px;line-height:1.8}#authScreen .seh-arrow{font-size:22px;color:#c6a24a}#authScreen .seh-register{margin-top:22px;text-align:center;padding:14px 10px;border:1px dashed #35485a;border-radius:14px;background:#0c141e}#authScreen .seh-register p{margin:0 0 5px;color:#aeb9c5;font-size:11px}#authScreen .seh-link{border:0;background:none;color:#d7b34d;padding:8px;font-size:12px;cursor:pointer}#authScreen .seh-back{border:1px solid #2b3e50;border-radius:11px;background:#142130;color:#dce3e9;padding:9px 13px;font-size:12px;margin-bottom:20px;cursor:pointer}#authScreen .seh-form{padding:18px;border:1px solid #29394a;border-radius:18px;background:linear-gradient(145deg,#111d29,#0c141e);box-shadow:0 14px 35px #0004}#authScreen .seh-form label{display:block;font-size:12px;font-weight:bold;margin:0 0 8px;color:#e5e9ed}#authScreen .seh-form input,#authScreen .seh-form select{width:100%;border:1px solid #34495d;border-radius:11px;background:#0a131d;color:white;padding:13px;outline:none;font-size:14px;margin:0 0 15px;min-height:45px}#authScreen .seh-form button:not(.seh-back){width:100%;min-height:46px;border:0;border-radius:12px;background:linear-gradient(100deg,#ffd04b,#ffb900);color:#17120a;font-weight:900;cursor:pointer}#authScreen #coachLoginBox,#authScreen #traineeLoginBox{display:block!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important}#authScreen #authTabs{display:none!important}#authScreen #traineeLoginBox .seh-login-block,#authScreen #traineeLoginBox .seh-reg-block{padding:0!important;margin:0!important;border:0!important;background:transparent!important}#authScreen[data-seh-view=trainee] #traineeLoginBox .seh-reg-block,#authScreen[data-seh-view=register] #traineeLoginBox .seh-login-block{display:none!important}#authScreen[data-seh-view=trainee] #traineeLoginBox .seh-login-block,#authScreen[data-seh-view=register] #traineeLoginBox .seh-reg-block{display:block!important}#authScreen[data-seh-view=register] #sehRegisterMount>.seh-reg-block{display:block!important;visibility:visible!important;opacity:1!important}#authScreen[data-seh-view=register] #sehRegisterMount>.seh-reg-block label,#authScreen[data-seh-view=register] #sehRegisterMount>.seh-reg-block input,#authScreen[data-seh-view=register] #sehRegisterMount>.seh-reg-block select,#authScreen[data-seh-view=register] #sehRegisterMount>.seh-reg-block button{display:block!important;visibility:visible!important;opacity:1!important}#authScreen #sehRecoveryStudentPanel{display:none!important;margin-top:12px!important;padding:15px!important;border:1px solid #29394a!important;border-radius:15px!important;background:#101923!important}#authScreen[data-seh-view=recovery] #sehRecoveryStudentPanel{display:block!important}#authScreen #authError{margin-top:12px;white-space:pre-wrap;line-height:1.8}#authScreen .seh-foot{margin-top:auto;padding-top:26px;text-align:center;color:#718091;font-size:10px;line-height:2}';

/* Restore native page scrolling so Android browser pull-to-refresh can work. */
st.textContent += `
#authScreen{
  position:relative!important;
  inset:auto!important;
  width:100%!important;
  height:auto!important;
  min-height:100vh!important;
  overflow:visible!important;
  overscroll-behavior-y:auto!important;
}
#authScreen .auth-card{
  height:auto!important;
  min-height:100vh!important;
  overflow:visible!important;
}
#authScreen[data-seh-view=home]{overflow:visible!important}
#authScreen[data-seh-view=home] .auth-card{
  height:auto!important;
  min-height:100vh!important;
  flex:initial!important;
}
#authScreen[data-seh-view=home] .auth-card>div:first-child{
  flex:initial!important;
  min-height:0!important;
}
html:has(#authScreen:not([style*="display: none"])){min-height:100%!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:auto!important}\nbody.locked{min-height:100%!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:auto!important}
`;


/* Keep the landing/home choice screen fully inside one viewport.
   Other auth views retain natural scrolling for small screens and forms. */
st.textContent += `
@supports (height: 100dvh) {
  #authScreen[data-seh-view=home] {
    position:fixed!important;inset:0!important;width:100%!important;
    height:100dvh!important;min-height:0!important;max-height:100dvh!important;
    overflow:hidden!important;overscroll-behavior:none!important;
  }
  #authScreen[data-seh-view=home] .auth-card {
    box-sizing:border-box!important;height:100dvh!important;min-height:0!important;
    max-height:100dvh!important;overflow:hidden!important;
    padding:clamp(8px,1.7dvh,16px) clamp(12px,4vw,22px)!important;
  }
}
#authScreen[data-seh-view=home] .auth-card {
  display:flex!important;flex-direction:column!important;
}
#authScreen[data-seh-view=home] .auth-card>div:first-child {
  display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
  justify-content:flex-start!important;min-height:0!important;
}
#authScreen[data-seh-view=home] .seh-top {
  flex:0 0 auto!important;margin-bottom:clamp(5px,1.2vh,12px)!important;
  font-size:10px!important;
}
#authScreen[data-seh-view=home] .seh-brand {
  flex:0 0 auto!important;margin:0 0 clamp(7px,1.5vh,14px)!important;
}
#authScreen[data-seh-view=home] .seh-mark {
  width:clamp(48px,8vh,68px)!important;height:clamp(48px,8vh,68px)!important;
  margin-bottom:6px!important;border-radius:16px!important;
}
#authScreen[data-seh-view=home] .seh-brand h2 {font-size:clamp(17px,2.8vh,21px)!important}
#authScreen[data-seh-view=home] .seh-brand p {margin-top:3px!important;font-size:11px!important}
#authScreen[data-seh-view=home] #sehAuthHome {
  display:flex!important;flex:1 1 auto!important;flex-direction:column!important;
  justify-content:center!important;min-height:0!important;
}
#authScreen[data-seh-view=home] .seh-welcome {margin-bottom:clamp(7px,1.5vh,14px)!important}
#authScreen[data-seh-view=home] .seh-welcome h3 {
  font-size:clamp(16px,2.7vh,20px)!important;margin:4px 0!important;
}
#authScreen[data-seh-view=home] .seh-welcome p {font-size:11px!important;line-height:1.55!important}
#authScreen[data-seh-view=home] .seh-choices {gap:clamp(7px,1.4vh,11px)!important}
#authScreen[data-seh-view=home] .seh-choice {
  min-height:0!important;padding:clamp(7px,1.4vh,11px)!important;
  gap:10px!important;border-radius:14px!important;
}
#authScreen[data-seh-view=home] .seh-art {
  width:clamp(64px,10vh,84px)!important;height:clamp(64px,10vh,84px)!important;
  flex-basis:clamp(64px,10vh,84px)!important;border-radius:13px!important;
}
#authScreen[data-seh-view=home] .seh-copy b {font-size:14px!important;margin-bottom:3px!important}
#authScreen[data-seh-view=home] .seh-copy small {font-size:10px!important;line-height:1.5!important}
#authScreen[data-seh-view=home] .seh-register {
  flex:0 0 auto!important;margin-top:clamp(7px,1.5vh,13px)!important;
  padding:7px!important;border-radius:11px!important;
}
#authScreen[data-seh-view=home] .seh-register p {font-size:10px!important;margin-bottom:2px!important}
#authScreen[data-seh-view=home] .seh-link {padding:5px!important;font-size:11px!important}
#authScreen[data-seh-view=home] .seh-foot {
  flex:0 0 auto!important;margin-top:clamp(5px,1vh,9px)!important;
  padding-top:0!important;font-size:9px!important;line-height:1.4!important;
}
@media (max-height:620px) {
  #authScreen[data-seh-view=home] .seh-top {margin-bottom:4px!important}
  #authScreen[data-seh-view=home] .seh-brand {margin-bottom:5px!important}
  #authScreen[data-seh-view=home] .seh-mark {width:46px!important;height:46px!important}
  #authScreen[data-seh-view=home] .seh-welcome {margin-bottom:6px!important}
  #authScreen[data-seh-view=home] .seh-welcome p {display:none!important}
  #authScreen[data-seh-view=home] .seh-art {
    width:58px!important;height:58px!important;flex-basis:58px!important
  }
  #authScreen[data-seh-view=home] .seh-register {margin-top:6px!important;padding:5px!important}
  #authScreen[data-seh-view=home] .seh-foot {display:none!important}
}
`;

/* New recovery view: visually match the connected sign-in redesign. */
st.textContent += `
#authScreen #sehRecoveryMount{margin-top:16px}
#authScreen #sehRecoveryStudentPanel{
  display:block!important;visibility:visible!important;width:100%!important;
  box-sizing:border-box!important;margin:0!important;padding:18px!important;
  border:1px solid #34495d!important;border-radius:18px!important;
  background:linear-gradient(145deg,#111d29,#0c141e)!important;
  color:#e8edf2!important;box-shadow:0 14px 35px #0004!important;
}
#authScreen #sehRecoveryStudentPanel h3{
  color:#f4c64e!important;font-size:15px!important;line-height:1.8!important;
  margin:4px 0 12px!important;
}
#authScreen #sehRecoveryStudentPanel p,
#authScreen #sehRecoveryStudentPanel .muted{
  color:#aeb9c5!important;font-size:12px!important;line-height:1.9!important;
}
#authScreen #sehRecoveryStudentPanel label{
  display:block!important;color:#e5e9ed!important;font-size:12px!important;
  font-weight:700!important;margin:12px 0 7px!important;
}
#authScreen #sehRecoveryStudentPanel input{
  display:block!important;width:100%!important;box-sizing:border-box!important;
  min-height:46px!important;padding:12px!important;margin:0 0 12px!important;
  border:1px solid #34495d!important;border-radius:11px!important;
  background:#0a131d!important;color:#fff!important;font-size:14px!important;
}
#authScreen #sehRecoveryStudentPanel button{
  display:block!important;width:100%!important;min-height:45px!important;
  margin:9px 0!important;padding:11px 13px!important;border:0!important;
  border-radius:11px!important;background:linear-gradient(100deg,#ffd04b,#ffb900)!important;
  color:#17120a!important;font-weight:900!important;cursor:pointer!important;
}
#authScreen #sehRecoveryStudentPanel button.secondary{
  border:1px solid #80631f!important;background:#252313!important;color:#f4d77d!important;
}
#authScreen #sehRecoveryStudentPanel button:disabled{opacity:.6!important;cursor:wait!important}
#authScreen #sehRecoveryStudentPanel hr{border-color:#34495d!important;margin:18px 0!important}
#authScreen #sehRecoveryStudentPanel [role=status]{
  display:block;white-space:pre-wrap;line-height:1.9;margin-top:9px;
  color:#dce5ec;font-size:12px;
}
#authScreen .seh-recovery-pending{
  padding:15px;border:1px dashed #80631f;border-radius:13px;
  color:#e8d49b;background:#171b20;font-size:12px;line-height:1.9;
}
`;
document.head.appendChild(st);
const shell=document.createElement('div');
shell.innerHTML='<div class="seh-top"><span>FITNESS SEH GALEH</span><span class="seh-tag">ورود امن اعضا</span></div><div class="seh-brand"><div class="seh-mark"><img src="./icon.webp" alt="نشان فیتنس سه‌قلعه"></div><h2>باشگاه فیتنس سه‌قلعه</h2><p>مربی من | همراه شما در مسیر تناسب اندام</p></div>'+
'<section id="sehAuthHome" class="seh-view"><div class="seh-welcome"><span class="seh-eyebrow">به جمع فیتنس سه‌قلعه خوش آمدید</span><h3>برای ادامه، مسیر خود را انتخاب کنید</h3><p>ورود اعضای فعلی و درخواست عضویت جدید در مسیرهای جداگانه انجام می‌شود.</p></div><div class="seh-choices"><button type="button" class="seh-choice primary" onclick="window.sehAuthNavigate(\'trainee\')"><span class="seh-art seh-art-trainee" aria-hidden="true"><img src="./assets/auth/trainee-entry.webp" alt="تصویر شاگرد ورزشکار" loading="eager"></span><span class="seh-copy"><b>ورود شاگردان</b><small>برای اعضایی که قبلاً ثبت‌نام کرده‌اند</small></span><span class="seh-arrow">‹</span></button><button type="button" class="seh-choice" onclick="window.sehAuthNavigate(\'coach\')"><span class="seh-art seh-art-coach" aria-hidden="true"><img src="./assets/auth/coach-entry.webp" alt="تصویر مربی" loading="eager"></span><span class="seh-copy"><b>ورود مربیان</b><small>ورود به پنل مدیریت و برنامه‌ریزی</small></span><span class="seh-arrow">‹</span></button></div><div class="seh-register"><p>هنوز عضو باشگاه نیستید؟</p><button class="seh-link" type="button" onclick="window.sehAuthNavigate(\'register\')">درخواست عضویت شاگرد جدید ←</button></div></section>'+
'<section id="sehAuthTrainee" class="seh-view"><button class="seh-back" type="button" onclick="window.sehAuthNavigate(\'home\')">→ بازگشت</button><div class="seh-heading"><span class="seh-eyebrow">حساب اعضای فعلی</span><h3>ورود به حساب شاگرد</h3><p>شماره موبایل ثبت‌شده و رمز شخصی خود را وارد کنید.</p></div><div class="seh-form" id="sehTraineeMount"></div><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="seh-link" type="button" onclick="window.sehAuthNavigate(\'recovery\')">رمز عبور را فراموش کرده‌ام</button><button class="seh-link" type="button" onclick="window.sehAuthNavigate(\'register\')">عضویت جدید</button></div></section>'+
'<section id="sehAuthCoach" class="seh-view"><button class="seh-back" type="button" onclick="window.sehAuthNavigate(\'home\')">→ بازگشت</button><div class="seh-heading"><span class="seh-eyebrow">دسترسی مدیریت</span><h3>ورود مربیان</h3><p>برای ورود به پنل مربی، ایمیل و رمز عبور خود را وارد کنید.</p></div><div class="seh-form" id="sehCoachMount"></div></section>'+
'<section id="sehAuthRegister" class="seh-view"><button class="seh-back" type="button" onclick="window.sehAuthNavigate(\'home\')">→ بازگشت</button><div class="seh-heading"><span class="seh-eyebrow">شروع مسیر ورزشی</span><h3>درخواست عضویت جدید</h3><p>اطلاعات اولیه را وارد کنید تا درخواست برای بررسی مربی ارسال شود.</p></div><div class="seh-form" id="sehRegisterMount"></div></section>'+
'<section id="sehAuthRecovery" class="seh-view"><button class="seh-back" type="button" onclick="window.sehAuthNavigate(\'trainee\')">→ بازگشت به ورود شاگرد</button><div class="seh-heading"><span class="seh-eyebrow">بازیابی دسترسی</span><h3>بازیابی رمز عبور</h3><p>درخواست بازیابی با تأیید مربی انجام می‌شود.</p></div><div id="sehRecoveryMount"></div></section><div class="seh-foot">FITNESS SEH GALEH<br>همراه شما در مسیر تناسب اندام</div>';
card.replaceChildren(shell,coach,trainee,error);
if(tabs)tabs.remove();
coach.classList.remove('hide');trainee.classList.remove('hide');
const registrationBlock=trainee.querySelector('#traineeRegName')?.closest('.trainee-auth-block');
const loginBlock=trainee.querySelector('#traineePhoneLogin')?.closest('.trainee-auth-block');
if(registrationBlock)registrationBlock.classList.add('seh-reg-block');
if(loginBlock)loginBlock.classList.add('seh-login-block');
document.getElementById('sehTraineeMount').appendChild(trainee);
document.getElementById('sehCoachMount').appendChild(coach);
const registration=trainee.querySelector('.seh-reg-block');const registerMount=document.getElementById('sehRegisterMount');if(registration&&registerMount){registerMount.appendChild(registration);registration.classList.remove('hide');registration.hidden=false;registration.removeAttribute('aria-hidden');registration.style.setProperty('display','block','important');registration.style.setProperty('visibility','visible','important');registration.querySelectorAll('label,input,select,button,p,h3').forEach(el=>{el.hidden=false;el.removeAttribute('aria-hidden');el.style.removeProperty('display');el.style.setProperty('visibility','visible','important');});}
function moveRecovery(){
  const m=document.getElementById('sehRecoveryMount');
  const p=document.querySelector('[id="sehRecoveryStudentPanel"]');
  if(!m)return false;
  if(p){
    if(p.parentElement!==m)m.appendChild(p);
    m.querySelector('.seh-recovery-pending')?.remove();
    return true;
  }
  if(root.dataset.sehView==='recovery'&&!m.querySelector('.seh-recovery-pending')){
    const note=document.createElement('p');
    note.className='seh-recovery-pending';
    note.setAttribute('role','status');
    note.textContent='در حال آماده‌سازی فرم امن بازیابی رمز…';
    m.appendChild(note);
  }
  return false;
}
window.sehAuthNavigate=function(v){
  root.dataset.sehView=v;
  error.style.display='none';
  if(v==='recovery'){
    moveRecovery();
    // The recovery module initializes near the end of the app bundle; keep the new view
    // active while its panel is mounted asynchronously instead of falling back to legacy UI.
    let attempts=0;
    const retry=setInterval(()=>{
      attempts++;
      if(moveRecovery()||attempts>=40)clearInterval(retry);
    },250);
  }else moveRecovery();
};
root.dataset.sehView='home';

/* Pull-to-refresh with a lightweight gold arc indicator; keeps the existing reload trigger. */
(function(){
  let startY=0,startX=0,armed=false,drag=0;
  const threshold=105;
  const scrollTop=()=>Math.max(window.scrollY||0,document.documentElement.scrollTop||0,document.body.scrollTop||0,root.scrollTop||0);
  const indicator=document.createElement('div');
  indicator.id='sehPullRefreshIndicator';
  indicator.setAttribute('aria-hidden','true');
  indicator.innerHTML='<svg viewBox="0 0 36 36"><circle class="seh-pull-track" cx="18" cy="18" r="14"></circle><circle class="seh-pull-arc" cx="18" cy="18" r="14"></circle></svg>';
  const style=document.createElement('style');
  style.textContent='#sehPullRefreshIndicator{position:fixed;z-index:2147483647;top:calc(env(safe-area-inset-top,0px) + 14px);left:50%;width:38px;height:38px;margin-left:-19px;display:grid;place-items:center;border:1px solid #80631f66;border-radius:50%;background:#111923ed;box-shadow:0 4px 16px #0005;opacity:0;transform:translateY(-52px) scale(.82);pointer-events:none;transition:opacity .16s,transform .16s}#sehPullRefreshIndicator svg{width:27px;height:27px;transform:rotate(-90deg)}#sehPullRefreshIndicator circle{fill:none;stroke-width:3}#sehPullRefreshIndicator .seh-pull-track{stroke:#bda45c33}#sehPullRefreshIndicator .seh-pull-arc{stroke:#f4c64e;stroke-linecap:round;stroke-dasharray:88;stroke-dashoffset:88}#sehPullRefreshIndicator.seh-pull-visible{opacity:1;transform:translateY(0) scale(1)}#sehPullRefreshIndicator.seh-pull-ready{background:#302713;border-color:#e4b63d}#sehPullRefreshIndicator.seh-pull-spin svg{animation:sehPullSpin .7s linear infinite}#sehPullRefreshIndicator.seh-pull-spin .seh-pull-arc{stroke-dashoffset:24}@keyframes sehPullSpin{to{transform:rotate(270deg)}}';
  document.head.appendChild(style);root.appendChild(indicator);
  const arc=indicator.querySelector('.seh-pull-arc');
  function reset(){drag=0;indicator.classList.remove('seh-pull-visible','seh-pull-ready','seh-pull-spin');arc.style.strokeDashoffset='88';}
  document.addEventListener('touchstart',function(e){
    if(!e.touches||e.touches.length!==1){armed=false;reset();return;}
    const target=e.target;
    if(target&&target.closest&&target.closest('input,textarea,select,button,[contenteditable="true"]')){armed=false;reset();return;}
    startY=e.touches[0].clientY;startX=e.touches[0].clientX;
    armed=scrollTop()<=2;
  },{passive:true});
  document.addEventListener('touchmove',function(e){
    if(!armed||!e.touches||e.touches.length!==1)return;
    const dy=e.touches[0].clientY-startY,dx=Math.abs(e.touches[0].clientX-startX);
    if(dy<=0||dx>70){reset();return;}
    drag=Math.min(1,dy/threshold);
    indicator.classList.add('seh-pull-visible');
    indicator.classList.toggle('seh-pull-ready',drag>=1);
    arc.style.strokeDashoffset=String(88-(88*drag));
  },{passive:true});
  document.addEventListener('touchend',function(e){
    if(!armed||!e.changedTouches||!e.changedTouches.length){armed=false;reset();return;}
    const dy=e.changedTouches[0].clientY-startY;
    const dx=Math.abs(e.changedTouches[0].clientX-startX);
    armed=false;
    if(dy>=threshold&&dx<70&&scrollTop()<=2){
      indicator.classList.add('seh-pull-visible','seh-pull-ready','seh-pull-spin');
      setTimeout(()=>window.location.reload(),220);
    }else reset();
  },{passive:true});
  document.addEventListener('touchcancel',function(){armed=false;reset();},{passive:true});
})();

// Recovery is injected asynchronously into the original trainee form; watch the document, not the moved form.
new MutationObserver(moveRecovery).observe(document.body,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',moveRecovery,{once:true});setTimeout(moveRecovery,900);
window.__sehAuthRedesignConnected=true;
window.__sehAuthRedesignConnecting=false;
})();

/* Temporary, read-only auth-screen diagnostics. Does not change authentication or data. */
(function(){
  'use strict';
  function start(){
    if(window.__sehAuthDiagStarted)return;
    window.__sehAuthDiagStarted=true;
    var root=document.getElementById('authScreen');
    if(!root)return;
    var panel=document.createElement('aside');
    panel.id='sehAuthDiagnosticPanel';
    panel.setAttribute('role','status');
    panel.style.cssText='position:fixed;z-index:2147483646;left:8px;right:8px;bottom:8px;max-height:28vh;overflow:auto;background:#111e;color:#fff;border:1px solid #c6a24a;border-radius:10px;padding:8px;font:11px/1.7 monospace;direction:ltr;text-align:left;pointer-events:none;white-space:pre-wrap';
    panel.textContent='AUTH DIAGNOSTICS: initializing…';
    document.body.appendChild(panel);
    var errors=[];
    function report(){
      var imgs=Array.from(root.querySelectorAll('img')).map(function(im){
        return {src:im.currentSrc||im.src,complete:im.complete,naturalWidth:im.naturalWidth,naturalHeight:im.naturalHeight,display:getComputedStyle(im).display,visibility:getComputedStyle(im).visibility,pointerEvents:getComputedStyle(im).pointerEvents};
      });
      var cs=getComputedStyle(root),card=root.querySelector('.auth-card');
      var info={
        readyState:document.readyState,
        authInitConnected:!!window.__sehAuthRedesignConnected,
        authInitConnecting:!!window.__sehAuthRedesignConnecting,
        view:root.dataset.sehView||null,
        bodyLocked:document.body.classList.contains('locked'),
        htmlOverflow:getComputedStyle(document.documentElement).overflow,
        bodyOverflow:getComputedStyle(document.body).overflow,
        authRect:(function(){var r=root.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,scrollHeight:root.scrollHeight,clientHeight:root.clientHeight,scrollTop:root.scrollTop};})(),
        authOverflowY:cs.overflowY,authPointerEvents:cs.pointerEvents,
        cardPresent:!!card,cardScrollHeight:card?card.scrollHeight:null,
        images:imgs,errors:errors.slice(-4)
      };
      panel.textContent='AUTH DIAGNOSTICS (read-only)\n'+JSON.stringify(info,null,2);
    }
    window.addEventListener('error',function(e){errors.push('error: '+(e.message||'unknown')+' @ '+(e.filename||'')+':'+(e.lineno||''));report();});
    window.addEventListener('unhandledrejection',function(e){errors.push('promise: '+String(e.reason&&e.reason.message||e.reason));report();});
    root.addEventListener('click',function(e){errors.push('click received: '+(e.target&&e.target.tagName)+'#'+(e.target&&e.target.id||''));report();},true);
    root.addEventListener('touchstart',function(){errors.push('touchstart received');report();},{passive:true,once:true});
    root.addEventListener('scroll',function(){errors.push('scroll received, top='+root.scrollTop);report();},{passive:true});
    root.querySelectorAll('img').forEach(function(im){im.addEventListener('load',report);im.addEventListener('error',function(){errors.push('image load failed: '+im.src);report();});});
    report();
    setInterval(report,3000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
