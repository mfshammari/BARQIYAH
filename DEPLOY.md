# نشر برقية على Vercel

## الطريقة الأسرع (سحب وإفلات)
1. افتح https://vercel.com/new
2. اسحب مجلد المشروع كامل (بعد فك الضغط) إلى الصفحة، أو اضغط Import.
3. Vercel يتعرّف تلقائياً على Vite. اضغط Deploy.
4. خلال دقيقة يعطيك رابطاً حياً.

- النموذج التفاعلي: الصفحة الرئيسية "/"
- صفحة الهبوط: "/landing.html"

## عبر GitHub (نشر تلقائي مع كل تعديل)
1. أنشئ مستودعاً جديداً على GitHub.
2. داخل مجلد المشروع:
   git init && git add . && git commit -m "برقية" && git branch -M main
   git remote add origin https://github.com/<USER>/<REPO>.git && git push -u origin main
3. من vercel.com/new اختر المستودع → Deploy.

## محلياً للتجربة
   npm install && npm run dev
