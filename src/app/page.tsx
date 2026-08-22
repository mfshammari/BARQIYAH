import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser, homePathForRole } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/env';
import { Logo } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STEPS = [
  { n: '١', t: 'ارفع قائمة المدعوين', d: 'واحداً واحداً أو عبر ملف Excel، مع عدد المقاعد لكل دعوة.' },
  { n: '٢', t: 'أرسل الدعوة عبر واتساب', d: 'قالب معتمد بصورة وزرَّي تأكيد واعتذار — رسالة واحدة لكل مدعو.' },
  { n: '٣', t: 'استقبل التأكيدات', d: 'المدعو يحدّد عدد الحاضرين فعلياً، والرصيد يتحدّث لحظياً.' },
  { n: '٤', t: 'باركود ودخول منظّم', d: 'رمز أحادي لكل مؤكِّد، يُمسح عند الباب بعدد مقاعده.' },
];

export default async function HomePage() {
  if (supabaseConfigured) {
    const user = await getSessionUser();
    if (user) redirect(homePathForRole(user.profile.role));
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 h-16 flex items-center justify-between">
          <Logo />
          <Link href="/login" className="btn-primary btn-sm">تسجيل الدخول</Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:py-20 text-center">
        <p className="badge bg-gold-soft/40 text-gold border border-gold-line">دعوات المناسبات عبر واتساب</p>
        <h1 className="font-cerem text-brand text-3xl sm:text-5xl leading-[1.5] mt-5">
          دعوتك تصل، وتُؤكَّد، وتُسجَّل عند الباب
        </h1>
        <p className="text-muted mt-4 max-w-xl mx-auto text-[15px]">
          برقية تدير رحلة الدعوة كاملة: من قائمة المدعوين إلى تأكيد الحضور بأزرار واتساب،
          ثم باركود أحادي لكل مؤكِّد يُمسح عند البوابة.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-8">
          <Link href="/login" className="btn-primary">ابدأ الآن</Link>
          <a href="/landing.html" className="btn-ghost">تعرّف على المنصة</a>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="card card-pad">
              <div className="font-display font-extrabold text-3xl text-gold-soft leading-none">{s.n}</div>
              <h3 className="font-display font-bold text-brand mt-3">{s.t}</h3>
              <p className="text-[13px] text-muted mt-1.5">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line py-6 text-center text-[12.5px] text-muted">
        برقية — منصة إدارة دعوات المناسبات
      </footer>
    </main>
  );
}
