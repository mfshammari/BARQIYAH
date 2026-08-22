# نشر برقية

## ١) Supabase

1. أنشئ مشروعاً على [supabase.com](https://supabase.com).
2. من **SQL Editor** الصق محتوى `supabase/setup.sql` كاملاً واضغط Run
   (ملف واحد يحتوي المخطط + RLS + الدوال، وآمن لإعادة التشغيل).
3. من **Settings → API** انسخ: `Project URL`, `anon key`, `service_role key`.
4. من **Authentication → Add user** أنشئ حسابك (فعّل Auto Confirm)، ثم اجعله أدمن:
   ```sql
   update public.profiles p set role = 'admin'
   from auth.users u where u.id = p.id and u.email = 'بريدك@هنا';
   ```
5. (اختياري) للبيانات التجريبية: `node scripts/seed-users.mjs` ثم `supabase/seed.sql`.

## ٢) Vercel

1. من [vercel.com/new](https://vercel.com/new) استورد المستودع — يتعرّف على Next.js تلقائياً.

   > المستودع يحتوي `vercel.json` يثبّت `framework: nextjs`. هذا مقصود:
   > المشروع أُنشئ سابقاً على إعداد Vite، وكان Vercel يبحث عن مجلد `dist`
   > فيفشل النشر برسالة `No Output Directory named "dist" found`.
   > الملف يتجاوز إعداد اللوحة، فلا حاجة لتغيير Framework Preset يدوياً.
2. أضف متغيّرات البيئة:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_URL=https://your-domain.vercel.app
META_PHONE_NUMBER_ID=          # اتركها فارغة لوضع المحاكاة
META_WABA_ID=
META_ACCESS_TOKEN=
META_WEBHOOK_VERIFY_TOKEN=
```

3. اضغط **Deploy**. المشروع يبني ويعمل بوضع المحاكاة حتى لو كانت مفاتيح Meta فارغة.
4. بعد أول نشر: حدّث `APP_URL` بالنطاق الفعلي وأعد النشر — يُستخدم في روابط الدعوة والباركود.

## ٣) واتساب (Meta Cloud API)

1. من [developers.facebook.com](https://developers.facebook.com) أنشئ تطبيقاً من نوع Business
   وأضف منتج WhatsApp.
2. أكمل توثيق النشاط التجاري واعتماد الاسم المعروض للرقم.
3. أنشئ **System User** بتوكن دائم بصلاحية `whatsapp_business_messaging`.
4. في **Configuration → Webhooks** ضع:
   - Callback URL: `https://your-domain.vercel.app/api/whatsapp/webhook`
   - Verify Token: نفس قيمة `META_WEBHOOK_VERIFY_TOKEN`
   - اشترك في حقل `messages`
5. أنشئ قوالب الدعوة واعتمدها، ثم اربط اسم كل قالب من `/admin/templates`.

## ٤) بعد النشر

- سجّل دخول الأدمن، وأضف الباقات وقوالب المكتبة من `/admin`.
- أنشئ حساب صاحب مناسبة (Supabase Auth) ودوره `owner`.
- فعّل مناسبته من `/admin/events` ليبدأ الإرسال.

## محلياً

```bash
npm install
cp .env.example .env.local
npm run dev
```

- المنصة: `/`
- صفحة الهبوط التسويقية: `/landing.html`
- النموذج التفاعلي الأصلي (مرجع تصميمي): مجلد `prototype/`
