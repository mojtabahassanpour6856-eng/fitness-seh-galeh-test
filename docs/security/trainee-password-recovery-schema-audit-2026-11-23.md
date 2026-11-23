# گزارش تطبیق بازیابی رمز با Schema واقعی Supabase TEST

تاریخ بررسی: 2026-11-23  
پروژه: `udptdznbvewkublvzmtm`  
تابع فعالِ خوانده‌شده: `trainee-password-recovery` نسخه 10، SHA-256: `f9bbda8b8d0f38d266fe009a0492ca5008f7f1fc4bd531bf60f70ec302331678`

> این سند فقط حاصل بررسی read-only است. هیچ SQL تغییردهنده، migration، deploy، تغییر secret یا ارسال پیامک انجام نشده است.

## 1. Schema تأییدشده

### `public.trainees`
- `id uuid` کلید اصلی
- `auth_user_id uuid nullable` اتصال حساب Auth شاگرد
- `coach_user_id uuid nullable` مالک/مربی
- `approval_status text` با مقادیر مجاز pending/active/rejected
- `phone_normalized text nullable`

نکته: هویت شاگرد در جریان جدید باید از JWT معتبر و تطبیق `trainees.auth_user_id = auth.uid()` استخراج شود؛ شماره تلفن ورودی نباید مرجع هویت یا مجوز تغییر رمز باشد.

### `public.profiles`
- `id uuid`
- `role text nullable`
- `full_name, phone, profile_image, created_at`

تابع فعلی نقش مربی را با `profiles.role = 'coach'` بررسی می‌کند. بررسی مالکیت شاگرد نیز باید جداگانه با `trainees.coach_user_id = auth.uid()` باقی بماند.

### `public.trainee_password_recovery_requests`
- `id uuid` کلید اصلی
- `trainee_id uuid NOT NULL` FK به trainees
- `phone_normalized text NOT NULL`
- `status text NOT NULL` مقادیر مجاز: pending/approved/processing/rejected/completed/expired
- `requested_at timestamptz NOT NULL`
- `reviewed_at timestamptz nullable`
- `reviewed_by uuid nullable` FK به auth.users
- `token_hash text nullable`
- `token_expires_at timestamptz nullable`
- `token_attempts smallint NOT NULL DEFAULT 0` قید فعلی: 0 تا 10
- `completed_at timestamptz nullable`
- `updated_at timestamptz NOT NULL`

RLS فعال است و تنها policy جدول درخواست بازیابی برای anon و authenticated، دسترسی کامل را با `false` مسدود می‌کند. بنابراین Edge Function فعلی با service-role به جدول دسترسی دارد؛ مسیر جدید نیز باید همه کنترل‌های هویت و مالکیت را صریحاً در سرور اعمال کند.

## 2. ناسازگاری‌های مهم با طرح جدید

1. قید فعلی `token_attempts <= 10` با سیاست حداکثر ۵ تلاش یکسان نیست؛ migration کاندید باید قید را به ۵ تغییر دهد، پس از بررسی کامل وابستگی‌ها.
2. ستون‌های فعلی برای verifier و expiry موجودند، اما فیلدی برای envelope رمز‌شده کد وجود ندارد. افزودن ستون envelope و نگهداری verifier HMAC به‌صورت جداگانه لازم است؛ نام و نوع نهایی پس از طراحی migration تعیین شود.
3. جدول فعلی `phone_normalized NOT NULL` دارد. این ستون را فعلاً حذف یا nullable نمی‌کنیم؛ در مسیر جدید فقط snapshot ثبت‌شده برای نمایش محدود/سازگاری است، نه ابزار احراز هویت.
4. وضعیت‌های موجود می‌توانند pending → approved → processing → completed را پوشش دهند؛ وضعیت expired/rejected نیز موجود است. صدور کد نباید باعث تمدید تاریخ انقضا هنگام refresh شود.
5. هیچ RPC بازیابی رمز در فهرست routines با نام recovery پیدا نشد؛ RPCهای اتمیک موردنیاز هنوز باید طراحی و به‌صورت candidate SQL ارائه شوند.

## 3. اشکالات تابع فعال نسخه 10

- `request` و `reset` با شماره تلفن و بدون احراز هویت JWT شاگرد اجرا می‌شوند.
- کد با modulo روی Uint32 تولید می‌شود و سوگیری دارد.
- verifier، SHA-256 ساده کد چهاررقمی است.
- اعتبار کد ۱۵ دقیقه است، نه ۲۴ ساعت.
- تلاش‌ها read-modify-write غیراتمیک‌اند و سقف claim در مسیر reset با ۱۰ کنترل می‌شود.
- پس از تأیید مربی، تابع به Mediana پیامک می‌فرستد.
- `verify_jwt=false` است؛ بررسی دستی Bearer فقط در مسیر مربی انجام می‌شود.
- عملیات Auth و ثبت completed در دو سامانه/مرحله جدا هستند؛ خطای مبهم بعد از تغییر رمز باید در طراحی جدید قابل بازیابی باشد.

## 4. معماری کاندید پیش از پیاده‌سازی

- احراز هویت تمام عملیات شاگرد با JWT و `auth.getUser()`.
- استخراج شاگرد صرفاً از `trainees.auth_user_id` و کنترل active بودن حساب.
- بررسی مربی با نقش coach و تطبیق `coach_user_id`.
- صدور کد چهاررقمی با CSPRNG و rejection sampling یکنواخت؛ حفظ صفر ابتدایی.
- ذخیره verifier به شکل HMAC با pepper سروری و envelope جداگانه AES-256-GCM با nonce تصادفی و AAD شامل request_id/trainee_id/expiry.
- نمایش/بازگشایی envelope فقط به همان شاگرد احراز هویت‌شده؛ refresh همان کد و همان expiry را برمی‌گرداند، نه کد جدید.
- انقضای دقیق ۲۴ ساعت از زمان صدور؛ حداکثر ۵ تلاش با عملیات اتمیک در دیتابیس.
- مصرف یک‌باره و کنترل race؛ عدم ثبت کد یا envelope در log.
- حذف کامل فراخوانی Mediana/SMS از پیاده‌سازی جدید.
- عدم استفاده از داده‌های واقعی شاگرد در تست؛ fixtures ساختگی و تست‌های مجوز/انقضا/هم‌زمانی/صفر ابتدایی/کلید اشتباه.

## 5. دروازه‌های قبل از هر انتشار

- [ ] migration کاندید با schema واقعی بازبینی شود.
- [ ] RPCهای اتمیک و RLS/GRANT بررسی شوند.
- [ ] تست‌های unit و integration با داده ساختگی اجرا شوند.
- [ ] تست‌های JWT شاگرد دیگر، مربی دیگر و درخواست متعلق به دیگری رد شوند.
- [ ] تست انقضای دقیق ۲۴ ساعت، تلاش پنجم، مصرف هم‌زمان و خطای مبهم Auth پاس شوند.
- [ ] مسیر SMS در build جدید وجود نداشته باشد.
- [ ] deploy فقط پس از تأیید صریح و جداگانه کاربر.

## وضعیت
این commit فقط گزارش تطبیق schema و طراحی کاندید است. تابع فعال Supabase TEST نسخه 10 و تمام داده‌ها/تنظیمات دست‌نخورده‌اند. این سند به‌تنهایی تأیید انتشار یا آماده‌بودن پیاده‌سازی نیست.
