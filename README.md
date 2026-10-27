# بات اعلان گروه تلگرام روی Cloudflare Workers

این نسخه از وبهوک تلگرام استفاده می‌کند و برای اجرای دائمی روی Worker طراحی شده است. دادهٔ یوزرنیم‌ها در D1 می‌ماند؛ توکن بات فقط باید به‌صورت Secret در تنظیمات Worker قرار بگیرد.

## قابلیت‌ها

- /setusers فهرست یوزرنیم‌های دستی را برای همان گروه ذخیره می‌کند.
- /announce افراد را در پیام‌های پنج‌تایی منشن می‌کند.
- اجرای دستور در تاپیک، پیام‌ها را در همان تاپیک می‌فرستد.
- اگر /announce را در پاسخ به یک پیام بفرستی، هر دستهٔ منشن به همان پیام ریپلای می‌شود.
- فقط مدیران گروه می‌توانند فهرست را تنظیم یا اعلان بفرستند.
- تکرارهای وبهوک با update id ثبت‌شده مدیریت می‌شوند تا ارسال‌های تکراری کمتر شوند.

## پیش‌نیازها

- حساب Cloudflare فعال
- Node.js و npm
- توکن بات تلگرام

## راه‌اندازی با Wrangler

از همین پوشه اجرا کن:

1. نصب وابستگی و ورود به Cloudflare:

   npm install
   npx wrangler login

2. ساخت دیتابیس D1:

   npm run db:create

   شناسه‌ای که دستور برمی‌گرداند را در wrangler.jsonc به‌جای REPLACE_WITH_D1_DATABASE_ID بگذار.

3. ساخت جدول‌ها:

   npm run db:migrate

4. ثبت Secretها؛ هر دستور مقدار را به‌شکل امن در ترمینال می‌پرسد:

   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put WEBHOOK_SECRET
   npx wrangler secret put REGISTER_SECRET

   برای WEBHOOK_SECRET و REGISTER_SECRET رشته‌های تصادفیِ طولانی بساز. توکن را در فایل یا چت قرار نده.

5. انتشار Worker:

   npm run deploy

   آدرس Worker را یادداشت کن، مثل https://group-announcer.<subdomain>.workers.dev.

6. وبهوک تلگرام را با درخواست زیر ثبت کن. مقدار REGISTER_SECRET باید همان Secret تنظیم‌شده در مرحلهٔ ۴ باشد:

   curl -X POST "$WORKER_URL/register-webhook" \
     -H "Authorization: Bearer $REGISTER_SECRET"

   این مسیر فقط با REGISTER_SECRET قابل استفاده است. Worker مقدار WEBHOOK_SECRET را در setWebhook ثبت می‌کند و درخواست‌های تلگرام را با همان هدر بررسی می‌کند.

## فعال‌کردن در گروه

بات را به گروه اضافه و ادمین کن. چون دیتابیس Railway قابل انتقال مستقیم به این Worker نیست، فهرست را یک‌بار دیگر داخل همان گروه ثبت کن:

   /setusers @user1 @user2 @user3

برای اعلان عادی:

   /announce

برای ریپلای به یک خبر: روی پیام خبر Reply بزن و /announce را بفرست. متن دلخواه هم می‌تواند همراه دستور باشد:

   /announce لطفاً این خبر مهم را بررسی کنید

## بررسی محلی

   npm test

تست دود فقط مسیر سلامت و رد درخواست‌های بدون Secret را بررسی می‌کند؛ برای بررسی ارسال واقعی باید ابتدا وبهوک و توکن معتبر تنظیم شوند.

## اتصال مستقیم GitHub به Cloudflare

Cloudflare Workers Builds می‌تواند مخزن GitHub را به Worker وصل کند و با هر push به شاخهٔ اصلی، Worker را خودکار منتشر کند.

1. مخزن را به Cloudflare وصل کن: Workers & Pages → Create application → GitHub.
2. در تنظیمات Build، ریشهٔ پروژه را `/` و دستور انتشار را `npm run deploy` بگذار.
3. تنظیم D1 در `wrangler.jsonc` از قابلیت ساخت خودکار منابع استفاده می‌کند؛ اولین deploy، دیتابیس `group-announcer-db` را ایجاد می‌کند. شناسهٔ ساخته‌شده را در داشبورد D1 می‌توان دید.
4. پس از اولین deploy، فایل `migrations/0001_initial.sql` را یک‌بار در کنسول دیتابیس D1 اجرا کن تا جدول‌ها ساخته شوند.
5. در Worker → Settings → Variables and Secrets این سه مقدار را از نوع Secret اضافه کن: `TELEGRAM_BOT_TOKEN`، `WEBHOOK_SECRET` و `REGISTER_SECRET`.
6. بعد از تنظیم Secretها، یک push دیگر انجام بده یا از داشبورد Deploy را اجرا کن؛ تغییرهای بعدی روی شاخهٔ اصلی خودکار منتشر می‌شوند.

مقادیر Secret را داخل GitHub commit نکن. برای فعال‌کردن وبهوک تلگرام نیز بعد از deploy یک‌بار مسیر `/register-webhook` را با `REGISTER_SECRET` فراخوانی کن.
