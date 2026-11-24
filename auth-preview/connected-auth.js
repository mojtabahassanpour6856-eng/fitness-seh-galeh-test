(function(){
'use strict';
if(window.__sehAuthRedesignConnected)return;
const root=document.getElementById('authScreen'),card=root&&root.querySelector('.auth-card');
const coach=document.getElementById('coachLoginBox'),trainee=document.getElementById('traineeLoginBox'),error=document.getElementById('authError'),tabs=document.getElementById('authTabs');
if(!root||!card||!coach||!trainee||!error)return;
// Claim the auth shell only after every required host element is verified.
window.__sehAuthRedesignConnected=true;
const st=document.createElement('style');st.id='seh-auth-redesign-connected-style';
st.textContent='#authScreen{position:fixed!important;inset:0!important;z-index:99999!important;overflow-y:auto!important;background:radial-gradient(ellipse at 50% -15%,#1a2b3b 0,transparent 48%),#070b11!important;padding:0!important}#authScreen .auth-card{width:min(100%,480px)!important;min-height:100vh!important;margin:0 auto!important;padding:clamp(16px,4vw,26px)!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;display:flex!important;flex-direction:column!important}#authScreen .seh-top{display:flex;justify-content:space-between;align-items:center;color:#aeb9c5;font-size:11px;margin-bottom:25px}#authScreen .seh-tag{border:1px solid #66501b;color:#ffd46a;border-radius:30px;padding:6px 10px}#authScreen .seh-brand{text-align:center;margin:4px 0 28px}#authScreen .seh-mark{width:82px;height:82px;margin:0 auto 13px;border-radius:23px;display:grid;place-items:center;background:linear-gradient(145deg,#ffcf4d,#d99500);padding:7px;box-shadow:0 9px 30px #ffbd1626;overflow:hidden}#authScreen .seh-mark img{display:block;width:100%;height:100%;object-fit:contain;border-radius:17px}#authScreen .seh-choice{position:relative;overflow:hidden;min-height:116px;padding:14px 13px}#authScreen .seh-choice:after{content:"";position:absolute;width:120px;height:120px;left:-22px;bottom:-55px;border-radius:50%;background:radial-gradient(circle,#ffbd1622,transparent 68%);pointer-events:none}#authScreen .seh-art{width:88px;height:88px;flex:0 0 88px;display:grid;place-items:center;border-radius:16px;background:linear-gradient(145deg,#1d3041,#101a25);border:1px solid #34495a;overflow:hidden}#authScreen .seh-art svg{width:100%;height:100%;display:block}#authScreen .seh-art img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;border-radius:16px}#authScreen .seh-art{width:112px;height:112px;flex-basis:112px;border-radius:17px;box-shadow:0 9px 22px #0005}#authScreen .seh-art svg{filter:drop-shadow(0 5px 5px #0005)}#authScreen[data-seh-view=register] #sehRegisterMount .seh-reg-block{display:block!important}#authScreen .seh-choice.primary .seh-art{background:linear-gradient(145deg,#3a3016,#18202a);border-color:#9c771f}#authScreen .seh-choice .seh-ico{display:none}#authScreen .seh-copy{position:relative;z-index:1}#authScreen .seh-arrow{position:relative;z-index:1}#authScreen .seh-brand h2{font-size:23px!important;margin:0!important;color:#f7f8fa}#authScreen .seh-brand p{margin:8px 0 0!important;color:#aeb9c5;font-size:12px;line-height:1.8;text-align:center}#authScreen .seh-view{display:none}#authScreen[data-seh-view=home] #sehAuthHome,#authScreen[data-seh-view=trainee] #sehAuthTrainee,#authScreen[data-seh-view=coach] #sehAuthCoach,#authScreen[data-seh-view=register] #sehAuthRegister,#authScreen[data-seh-view=recovery] #sehAuthRecovery{display:block}#authScreen .seh-welcome{margin-bottom:19px}#authScreen .seh-eyebrow{color:#ffbd16;font-size:11px;font-weight:bold}#authScreen .seh-welcome h3,#authScreen .seh-heading h3{font-size:21px;margin:8px 0 7px;color:#f7f8fa}#authScreen .seh-welcome p,#authScreen .seh-heading p{font-size:12px;line-height:1.9;color:#aeb9c5;margin:0}#authScreen .seh-choices{display:grid;gap:12px}#authScreen .seh-choice{display:flex;align-items:center;gap:14px;width:100%;padding:17px 15px;text-align:right;background:linear-gradient(115deg,#152332,#101923);border:1px solid #2c4052;border-radius:17px;color:#f7f8fa;cursor:pointer}#authScreen .seh-choice.primary{border-color:#b88614;background:linear-gradient(115deg,#252313,#141b22)}#authScreen .seh-ico{width:48px;height:48px;flex:0 0 48px;border-radius:14px;display:grid;place-items:center;background:#ffbd161a;color:#ffbd16;font-size:23px}#authScreen .seh-choice.primary .seh-ico{background:#ffbd16;color:#17120a}#authScreen .seh-copy{flex:1}#authScreen .seh-copy b{display:block;font-size:15px;margin-bottom:6px}#authScreen .seh-copy small{display:block;color:#aeb9c5;font-size:11px;line-height:1.8}#authScreen .seh-arrow{font-size:22px;color:#c6a24a}#authScreen .seh-register{margin-top:22px;text-align:center;padding:14px 10px;border:1px dashed #35485a;border-radius:14px;background:#0c141e}#authScreen .seh-register p{margin:0 0 5px;color:#aeb9c5;font-size:11px}#authScreen .seh-link{border:0;background:none;color:#d7b34d;padding:8px;font-size:12px;cursor:pointer}#authScreen .seh-back{border:1px solid #2b3e50;border-radius:11px;background:#142130;color:#dce3e9;padding:9px 13px;font-size:12px;margin-bottom:20px;cursor:pointer}#authScreen .seh-form{padding:18px;border:1px solid #29394a;border-radius:18px;background:linear-gradient(145deg,#111d29,#0c141e);box-shadow:0 14px 35px #0004}#authScreen .seh-form label{display:block;font-size:12px;font-weight:bold;margin:0 0 8px;color:#e5e9ed}#authScreen .seh-form input,#authScreen .seh-form select{width:100%;border:1px solid #34495d;border-radius:11px;background:#0a131d;color:white;padding:13px;outline:none;font-size:14px;margin:0 0 15px;min-height:45px}#authScreen .seh-form button:not(.seh-back){width:100%;min-height:46px;border:0;border-radius:12px;background:linear-gradient(100deg,#ffd04b,#ffb900);color:#17120a;font-weight:900;cursor:pointer}#authScreen #coachLoginBox,#authScreen #traineeLoginBox{display:block!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important}#authScreen #authTabs{display:none!important}#authScreen #traineeLoginBox .seh-login-block,#authScreen #traineeLoginBox .seh-reg-block{padding:0!important;margin:0!important;border:0!important;background:transparent!important}#authScreen[data-seh-view=trainee] #traineeLoginBox .seh-reg-block,#authScreen[data-seh-view=register] #traineeLoginBox .seh-login-block{display:none!important}#authScreen[data-seh-view=trainee] #traineeLoginBox .seh-login-block,#authScreen[data-seh-view=register] #traineeLoginBox .seh-reg-block{display:block!important}#authScreen #sehRecoveryStudentPanel{display:none!important;margin-top:12px!important;padding:15px!important;border:1px solid #29394a!important;border-radius:15px!important;background:#101923!important}#authScreen[data-seh-view=recovery] #sehRecoveryStudentPanel{display:block!important}#authScreen #authError{margin-top:12px;white-space:pre-wrap;line-height:1.8}#authScreen .seh-foot{margin-top:auto;padding-top:26px;text-align:center;color:#718091;font-size:10px;line-height:2}';

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

document.head.appendChild(st);
const shell=document.createElement('div');
shell.innerHTML='<div class="seh-top"><span>FITNESS SEH GALEH</span><span class="seh-tag">ورود امن اعضا</span></div><div class="seh-brand"><div class="seh-mark"><img src="./icon.svg" alt="نشان فیتنس سه‌قلعه"></div><h2>باشگاه فیتنس سه‌قلعه</h2><p>مربی من | همراه شما در مسیر تناسب اندام</p></div>'+
'<section id="sehAuthHome" class="seh-view"><div class="seh-welcome"><span class="seh-eyebrow">به جمع فیتنس سه‌قلعه خوش آمدید</span><h3>برای ادامه، مسیر خود را انتخاب کنید</h3><p>ورود اعضای فعلی و درخواست عضویت جدید در مسیرهای جداگانه انجام می‌شود.</p></div><div class="seh-choices"><button type="button" class="seh-choice primary" onclick="window.sehAuthNavigate(\'trainee\')"><span class="seh-art seh-art-trainee" aria-hidden="true"><img src="./assets/auth/trainee-entry.png" alt="تصویر شاگرد ورزشکار" loading="eager"></span><span class="seh-copy"><b>ورود شاگردان</b><small>برای اعضایی که قبلاً ثبت‌نام کرده‌اند</small></span><span class="seh-arrow">‹</span></button><button type="button" class="seh-choice" onclick="window.sehAuthNavigate(\'coach\')"><span class="seh-art seh-art-coach" aria-hidden="true"><img src="./assets/auth/coach-entry.png" alt="تصویر مربی" loading="eager"></span><span class="seh-copy"><b>ورود مربیان</b><small>ورود به پنل مدیریت و برنامه‌ریزی</small></span><span class="seh-arrow">‹</span></button></div><div class="seh-register"><p>هنوز عضو باشگاه نیستید؟</p><button class="seh-link" type="button" onclick="window.sehAuthNavigate(\'register\')">درخواست عضویت شاگرد جدید ←</button></div></section>'+
'<section id="sehAuthTrainee" class="seh-view"><button class="seh-back" type="button" onclick="window.sehAuthNavigate(\'home\')">→ بازگشت</button><div class="seh-heading"><span class="seh-eyebrow">حساب اعضای فعلی</span><h3>ورود به حساب شاگرد</h3><p>شماره موبایل ثبت‌شده و رمز شخصی خود را وارد کنید.</p></div><div class="seh-form" id="sehTraineeMount"></div><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="seh-link" type="button" onclick="window.sehAuthNavigate(\'recovery\')">رمز عبور را فراموش کرده‌ام</button><button class="seh-link" type="button" onclick="window.sehAuthNavigate(\'register\')">عضویت جدید</button></div></section>'+
'<section id="sehAuthCoach" class="seh-view"><button class="seh-back" type="button" onclick="window.sehAuthNavigate(\'home\')">→ بازگشت</button><div class="seh-heading"><span class="seh-eyebrow">دسترسی مدیریت</span><h3>ورود مربیان</h3><p>برای ورود به پنل مربی، ایمیل و رمز عبور خود را وارد کنید.</p></div><div class="seh-form" id="sehCoachMount"></div></section>'+
'<section id="sehAuthRegister" class="seh-view"><button class="seh-back" type="button" onclick="window.sehAuthNavigate(\'home\')">→ بازگشت</button><div class="seh-heading"><span class="seh-eyebrow">شروع مسیر ورزشی</span><h3>درخواست عضویت جدید</h3><p>اطلاعات اولیه را وارد کنید تا درخواست برای بررسی مربی ارسال شود.</p></div><div class="seh-form" id="sehRegisterMount"></div></section>'+
'<section id="sehAuthRecovery" class="seh-view"><button class="seh-back" type="button" onclick="window.sehAuthNavigate(\'trainee\')">→ بازگشت به ورود شاگرد</button><div class="seh-heading"><span class="seh-eyebrow">بازیابی دسترسی</span><h3>بازیابی رمز عبور</h3><p>درخواست بازیابی با تأیید مربی انجام می‌شود.</p></div><div id="sehRecoveryMount"></div></section><div class="seh-foot">FITNESS SEH GALEH<br>همراه شما در مسیر تناسب اندام</div>';
card.replaceChildren(shell,coach,trainee,error);
if(tabs)tabs.remove();
coach.classList.remove('hide');trainee.classList.remove('hide');
const blocks=[...trainee.querySelectorAll('.trainee-auth-block')];
for(const b of blocks){const h=b.querySelector('h3')?.textContent||'';if(h.includes('ورود شاگرد'))b.classList.add('seh-login-block');if(h.includes('درخواست ثبت‌نام'))b.classList.add('seh-reg-block');}
document.getElementById('sehTraineeMount').appendChild(trainee);
document.getElementById('sehCoachMount').appendChild(coach);
const registration=trainee.querySelector('.seh-reg-block');if(registration){document.getElementById('sehRegisterMount').appendChild(registration);registration.style.display='block';}
function moveRecovery(){const p=document.getElementById('sehRecoveryStudentPanel'),m=document.getElementById('sehRecoveryMount');if(p&&m&&p.parentElement!==m)m.appendChild(p);}
window.sehAuthNavigate=function(v){root.dataset.sehView=v;if(v==='recovery'&&!document.getElementById('sehRecoveryStudentPanel')){root.dataset.sehView='trainee';error.textContent='بخش بازیابی رمز هنوز بارگذاری نشده است؛ چند لحظه بعد دوباره تلاش کنید.';error.style.display='block';}else{error.style.display='none';}moveRecovery();};
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
})();