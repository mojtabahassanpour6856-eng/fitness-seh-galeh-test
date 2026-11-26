(function(){
'use strict';
if(window.__sehPasswordRecoveryPreviewInstalled)return;
window.__sehPasswordRecoveryPreviewInstalled=true;
const $=id=>document.getElementById(id);
function addStudentPreview(){
  const boxes=Array.from(document.querySelectorAll('[id="traineeLoginBox"]'));
  if(!boxes.length)return false;
  const visible=boxes.filter(b=>!b.classList.contains('hide')&&b.getClientRects().length>0);
  const box=visible[visible.length-1]||boxes[boxes.length-1];
  let panel=$('sehRecoveryStudentPanel');
  // Once mounted, leave ownership to connected-auth.js; never move it back and forth.
  if(panel)return true;
  panel=document.createElement('section');panel.id='sehRecoveryStudentPanel';
  panel.className='trainee-auth-block';
  panel.setAttribute('aria-labelledby','sehRecoveryTitle');
  panel.innerHTML=
    '<h3 id="sehRecoveryTitle">🔑 بازیابی رمز با تأیید مربی</h3>'+
    '<p class="muted">بازیابی رمز در دو مرحله انجام می‌شود. پیامک ارسال نمی‌شود؛ پس از تأیید مربی، کد یک‌بارمصرف فقط در همین مرورگری که درخواست را ثبت کرده‌اید قابل دریافت است.</p>'+
    '<div class="seh-recovery-preview-notice" role="status">نسخه آزمایشی رابط کاربری: در این مرحله هیچ درخواست واقعی ارسال نمی‌شود و هیچ رمزی تغییر نمی‌کند.</div>'+
    '<h4>مرحله ۱: ثبت درخواست بازیابی</h4><label for="sehRecoveryPhone">شماره موبایل ثبت‌شده</label><input id="sehRecoveryPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="09121234567">'+
    '<button type="button" id="sehRecoveryRequestBtn" disabled>📨 درخواست بازیابی رمز</button>'+
    '<div id="sehRecoveryRequestStatus" role="status">اتصال به سامانه پس از تکمیل آزمون‌های ایمنی فعال خواهد شد.</div>'+
    '<h4>مرحله ۲: دریافت کد پس از تأیید مربی</h4><button type="button" class="secondary" id="sehRecoveryFetchCodeBtn" disabled>🔎 دریافت کد بازیابی</button>'+
    '<div id="sehRecoveryCodeStatus" role="status">دریافت کد در این نسخه غیرفعال است.</div>'+
    '<hr><h3>🔐 تعیین رمز جدید</h3>'+
    '<label for="sehRecoveryCode">کد ۴ رقمی یک‌بارمصرف</label><input id="sehRecoveryCode" type="text" inputmode="numeric" pattern="[0-9]{4}" autocomplete="one-time-code" maxlength="4" placeholder="کد ۴ رقمی دریافت‌شده" disabled><p class="muted">کد فقط یک‌بار قابل استفاده است و ۲۴ ساعت اعتبار دارد. مربی به خود کد دسترسی ندارد.</p>'+
    '<label for="sehRecoveryNewPassword">رمز جدید (حداقل ۸ کاراکتر)</label><input id="sehRecoveryNewPassword" type="password" autocomplete="new-password" minlength="8" placeholder="رمز جدید" disabled>'+
    '<label for="sehRecoveryNewPassword2">تکرار رمز جدید</label><input id="sehRecoveryNewPassword2" type="password" autocomplete="new-password" minlength="8" placeholder="تکرار رمز جدید" disabled>'+
    '<button type="button" id="sehRecoveryResetBtn" disabled>🔒 ذخیره رمز جدید</button>'+
    '<div id="sehRecoveryResetStatus" role="status">تغییر رمز تا پایان آزمایش‌های امنیتی فعال نخواهد شد.</div>';
  if(panel.parentElement!==box)box.appendChild(panel);
  return true;
}
function addCoachPreview(){
  const base=$('registrationRequestsPanel');
  if(!base||$('sehCoachRecoveryPanel'))return;
  const panel=document.createElement('section');
  panel.id='sehCoachRecoveryPanel';panel.className='card';
  panel.style.marginTop='12px';
  panel.innerHTML='<div class="registration-requests-heading"><div><h2>🔑 درخواست‌های بازیابی رمز</h2><p class="muted">در نسخه نهایی فقط درخواست‌های شاگردان متصل به حساب همین مربی نمایش داده می‌شود.</p></div><button type="button" class="secondary" disabled>🔄 به‌روزرسانی</button></div><div class="seh-recovery-preview-notice" role="status">پیش‌نمایش مربی؛ مربی فقط درخواست را بررسی و تأیید می‌کند و کد بازیابی را مشاهده نمی‌کند. دریافت کد و تأیید هنوز به بک‌اند متصل نیست.</div>';
  base.insertAdjacentElement('afterend',panel);
}
function isCoach(){
  const text=($('authUserText')?.textContent||'').trim();
  return /\|\s*مربی\s*$/.test(text)||(window.authProfile&&window.authProfile.role==='coach');
}
function update(){
  addStudentPreview();
  const panel=$('sehCoachRecoveryPanel');
  if(isCoach())addCoachPreview();
  else if(panel)panel.style.display='none';
}
function start(){
  update();
  const observer=new MutationObserver(update);
  if(document.body)observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  if($('authUserText'))observer.observe($('authUserText'),{childList:true,subtree:true,characterData:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();