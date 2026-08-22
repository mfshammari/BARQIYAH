import { env } from '@/lib/env';
import { Logo } from '@/components/ui';

/**
 * تُعرض عندما تكون مفاتيح Supabase غير مضبوطة.
 * تكشف أي مفتاح ناقص بالاسم — دون كشف أي قيمة — ليعرف المسؤول أين المشكلة
 * بدل شاشة عامة لا تدل على شيء.
 */
export function SetupNotice() {
  const checks = [
    {
      name: 'NEXT_PUBLIC_SUPABASE_URL',
      ok: Boolean(env.supabaseUrl),
      note: 'رابط المشروع من Settings ← API',
      required: true,
    },
    {
      name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      ok: Boolean(env.supabaseAnonKey),
      note: 'مفتاح anon public',
      required: true,
    },
    {
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      ok: Boolean(env.supabaseServiceKey),
      note: 'مفتاح service_role — لازم لصفحات المدعو والباركود وحسابات المسح',
      required: true,
    },
    {
      name: 'APP_URL',
      ok: Boolean(process.env.APP_URL),
      note: 'رابط النشر — تُبنى عليه روابط الدعوة والباركود',
      required: false,
    },
  ];

  const missingRequired = checks.filter((c) => c.required && !c.ok);
  const allRequiredSet = missingRequired.length === 0;

  return (
    <main className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-lg card card-pad">
        <Logo size="lg" />
        <h1 className="page-title mt-4">المنصة بحاجة إلى إعداد</h1>
        <p className="page-sub">
          {allRequiredSet
            ? 'المفاتيح موجودة لكنها لم تصل إلى هذه النسخة — تحتاج إعادة نشر.'
            : 'بعض مفاتيح Supabase ناقصة. أضفها في إعدادات المشروع على Vercel (أو في ملف .env.local محلياً).'}
        </p>

        <ul className="mt-4 space-y-2">
          {checks.map((c) => (
            <li
              key={c.name}
              className={`rounded-xl border px-3.5 py-2.5 ${
                c.ok
                  ? 'border-ok/20 bg-ok-soft'
                  : c.required
                    ? 'border-danger/25 bg-danger-soft'
                    : 'border-warn/25 bg-warn-soft'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <code dir="ltr" className="text-[12px] font-semibold text-left">{c.name}</code>
                <span
                  className={`badge shrink-0 ${
                    c.ok
                      ? 'bg-ok text-white'
                      : c.required
                        ? 'bg-danger text-white'
                        : 'bg-warn text-white'
                  }`}
                >
                  {c.ok ? 'مضبوط' : c.required ? 'ناقص' : 'اختياري'}
                </span>
              </div>
              <p className="text-[11.5px] text-muted mt-1">{c.note}</p>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl bg-panel border border-line px-3.5 py-3">
          <p className="text-[12.5px] text-ink font-semibold mb-1">مهم بعد الإضافة</p>
          <p className="text-[12px] text-muted leading-6">
            متغيّرات <code dir="ltr">NEXT_PUBLIC_*</code> تُدمج وقت البناء لا وقت التشغيل،
            فإضافتها وحدها لا تكفي — لازم <b>إعادة نشر</b> من Vercel ← Deployments ← Redeploy.
          </p>
        </div>

        <p className="hint mt-3">
          خطوات الإعداد الكاملة (المخطط، الأدوار، مفاتيح Meta) في ملف README.
        </p>
      </div>
    </main>
  );
}
