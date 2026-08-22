import { Logo } from '@/components/ui';

/** تُعرض عندما تكون مفاتيح Supabase غير مضبوطة — بدل انهيار التطبيق. */
export function SetupNotice() {
  return (
    <main className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-lg card card-pad">
        <Logo size="lg" />
        <h1 className="page-title mt-4">المنصة بحاجة إلى إعداد</h1>
        <p className="page-sub">
          لم يتم ضبط مفاتيح Supabase بعد. أضف المتغيّرات التالية في ملف
          <code className="mx-1 rounded bg-panel px-1.5 py-0.5 text-[12px]" dir="ltr">.env.local</code>
          أو في إعدادات المشروع على Vercel، ثم أعد التشغيل.
        </p>
        <pre
          dir="ltr"
          className="mt-4 rounded-xl bg-brand text-white/90 p-4 text-[12px] leading-6 overflow-x-auto text-left"
        >{`NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...`}</pre>
        <p className="hint mt-3">
          خطوات الإعداد الكاملة (المخطط، الأدوار، مفاتيح Meta) موجودة في ملف README.
        </p>
      </div>
    </main>
  );
}
