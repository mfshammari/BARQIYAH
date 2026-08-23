import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser, homePathForRole } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { InvitePreview, GoldRule } from '@/components/landing/InvitePreview';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { Package } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STEPS = [
  { n: '١', t: 'أنشئ مناسبتك', d: 'النوع والموعد والمكان، واختر الباقة التي تناسب عدد ضيوفك.' },
  { n: '٢', t: 'أضف المدعوين', d: 'واحداً واحداً، أو من دفتر عناوينك، أو برفع ملف Excel.' },
  { n: '٣', t: 'أرسل عبر واتساب', d: 'دعوة بصورتك وزرَّي تأكيد واعتذار — رسالة واحدة لكل مدعو.' },
  { n: '٤', t: 'استقبلهم بالباركود', d: 'رمز أحادي لكل مؤكِّد، يُمسح عند الباب بعدد مقاعده.' },
];

const FEATURES = [
  { t: 'رصيد بالمقاعد لا بالدعوات', d: 'تعرف كم شخصاً سيحضر فعلاً، لا كم رسالة أرسلت.' },
  { t: 'دعاة بحصص مستقلة', d: 'كل داعٍ له حصته ونصّه وصورته، ولا يرى مدعوّي غيره.' },
  { t: 'تأكيد بعدد فعلي', d: 'المدعو يحدّد كم شخصاً سيحضر، فيعود الفائض لرصيدك فوراً.' },
  { t: 'باركود لا يُستخدم مرتين', d: 'يُمسح بعدد المقاعد المؤكّدة فقط، ثم يُغلق تلقائياً.' },
  { t: 'دفتر عناوين دائم', d: 'جهاتك محفوظة لمناسباتك القادمة، بمجموعات وسجل استجابة.' },
  { t: 'متابعة لحظية يوم الحفل', d: 'من حضر ومن تبقّى، أمامك مباشرة على جوالك.' },
];

const OCCASIONS = ['حفل زواج', 'عقد قران', 'حفل خطوبة', 'حفل تخرّج', 'مولود جديد', 'مناسبة رسمية'];

const FAQ = [
  { q: 'هل أحتاج رقم واتساب خاص؟', a: 'لا. الإرسال يتم من رقم المنصة المعتمد لدى واتساب، فلا تحتاج إعداد أي شيء.' },
  { q: 'كيف يؤكّد المدعو حضوره؟', a: 'تصله الدعوة بزرَّي تأكيد واعتذار. عند التأكيد يختار عدد الحاضرين معه، فيصله الباركود مباشرة.' },
  { q: 'ماذا لو اعتذر بعض المدعوين؟', a: 'مقاعدهم تعود لرصيدك فوراً، فتدعو غيرهم دون شراء إضافي.' },
  { q: 'هل الرصيد بعدد الدعوات أم الأشخاص؟', a: 'بالأشخاص (المقاعد). دعوة واحدة لسبعة أشخاص تستهلك سبعة مقاعد ورسالة واحدة.' },
  { q: 'هل أستطيع إشراك أهلي في الدعوة؟', a: 'نعم. تضيفهم كدعاة وتخصّص لكل واحد حصته من المقاعد، ويكتب دعوته بنفسه.' },
  { q: 'ماذا يحدث لأرقام مدعويّ؟', a: 'تُستخدم لإيصال الدعوة فقط. لا تُصدَّر ولا تُستخدم للتسويق، التزاماً بنظام حماية البيانات السعودي.' },
];

export default async function LandingPage() {
  if (supabaseConfigured) {
    const user = await getSessionUser();
    if (user) redirect(homePathForRole(user.profile.role));
  }

  let packages: Package[] = [];
  if (supabaseConfigured) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.from('packages').select('*').eq('active', true)
        .order('seats', { ascending: true }).returns<Package[]>();
      packages = data ?? [];
    } catch { /* الهبوط يعمل بلا قاعدة */ }
  }

  return (
    <main className="bg-ivory">
      <header className="sticky top-0 z-40 border-b border-gold-line/60 bg-ivory/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <span className="font-cerem text-[30px] font-bold text-brand">
            برقية<span className="text-gold">.</span>
          </span>
          <nav className="hidden items-center gap-7 text-[14px] text-muted md:flex">
            <a href="#how" className="hover:text-gold">كيف تعمل</a>
            <a href="#features" className="hover:text-gold">المميزات</a>
            <a href="#pricing" className="hover:text-gold">الباقات</a>
            <a href="#faq" className="hover:text-gold">الأسئلة</a>
          </nav>
          <Link href="/login" className="btn-primary !rounded-[2px]">تسجيل الدخول</Link>
        </div>
      </header>

      {/* ————— هيرو ————— */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-16 md:grid-cols-2 md:py-24">
        <div className="text-center md:text-right">
          <p className="text-[13px] font-semibold tracking-[4px] text-gold">دعوات المناسبات عبر واتساب</p>
          <h1 className="mt-5 font-display text-[clamp(34px,5vw,54px)] font-bold leading-[1.35] text-brand">
            دعوتك تصل، وتُؤكَّد،
            <br />
            وتُسجَّل <em className="not-italic text-gold">عند الباب</em>
          </h1>
          <p className="mt-5 text-[15.5px] leading-8 text-muted">
            برقية تدير رحلة الدعوة كاملة: من قائمة المدعوين إلى تأكيد الحضور بأزرار واتساب،
            ثم باركود أحادي لكل مؤكِّد يُمسح عند البوابة.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
            <Link href="/signup" className="btn-primary !rounded-[2px]">ابدأ مناسبتك</Link>
            <a href="#how" className="btn-ghost !rounded-[2px]">كيف تعمل؟</a>
          </div>
        </div>
        <InvitePreview />
      </section>

      {/* ————— شريط الثقة ————— */}
      <section className="bg-brand py-9 text-center text-white">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 px-5 md:grid-cols-4">
          {[
            ['رسالة واحدة', 'لكل مدعو مهما كان عدد مقاعده'],
            ['رقم معتمد', 'من واتساب — لا تحتاج رقمك'],
            ['باركود أحادي', 'لا يُستخدم بعد اكتمال مقاعده'],
            ['بياناتك أمانة', 'لا تُصدَّر ولا تُستخدم للتسويق'],
          ].map(([b, s]) => (
            <div key={b}>
              <b className="block font-display text-[20px] font-bold text-gold-soft">{b}</b>
              <span className="mt-1 block text-[12.5px] leading-6 text-white/70">{s}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ————— كيف تعمل ————— */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-20">
        <p className="eyebrow">أربع خطوات</p>
        <h2 className="sec-title font-display text-brand">كيف تعمل برقية</h2>
        <GoldRule />
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="border-t border-gold-line pt-5">
              <div className="font-display text-[40px] font-bold leading-none text-gold-soft num">{s.n}</div>
              <h3 className="mt-4 font-display text-[20px] font-bold text-brand">{s.t}</h3>
              <p className="mt-2 text-[13.5px] leading-7 text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ————— المميزات ————— */}
      <section id="features" className="bg-paper py-20">
        <div className="mx-auto max-w-6xl px-5">
          <p className="eyebrow">لماذا برقية</p>
          <h2 className="sec-title font-display text-brand">مبنيّة لتفاصيل المناسبة السعودية</h2>
          <GoldRule />
          <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.t}>
                <div className="mb-3 h-px w-10 bg-gold" />
                <h4 className="font-display text-[19px] font-bold text-brand">{f.t}</h4>
                <p className="mt-1.5 text-[13.5px] leading-7 text-muted">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ————— أنواع الاحتفالات ————— */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className="eyebrow">تناسب كل مناسبة</p>
        <h2 className="sec-title font-display text-brand">أنواع الاحتفالات</h2>
        <GoldRule />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OCCASIONS.map((o) => (
            <div key={o} className="border border-gold-line bg-white px-6 py-7 text-center">
              <span className="font-display text-[21px] font-bold text-brand">{o}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ————— الباقات ————— */}
      <section id="pricing" className="bg-paper py-20">
        <div className="mx-auto max-w-5xl px-5">
          <p className="eyebrow">ادفع لمناسبتك فقط</p>
          <h2 className="sec-title font-display text-brand">الباقات</h2>
          <GoldRule />
          <p className="mx-auto max-w-lg text-center text-[14px] leading-7 text-muted">
            لا اشتراك متكرر — تشتري باقة لكل مناسبة، والرصيد بالمقاعد لا بعدد الدعوات.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {(packages.length ? packages.slice(0, 3) : FALLBACK_PACKAGES).map((p, i) => {
              const featured = i === 1;
              return (
                <div
                  key={p.id ?? p.name}
                  className={`border bg-white px-7 py-9 text-center ${
                    featured ? 'border-gold shadow-pop md:-my-3 md:py-12' : 'border-gold-line'
                  }`}
                >
                  {featured ? (
                    <span className="mb-3 inline-block bg-gold px-3 py-1 text-[11px] font-semibold tracking-wider text-white">
                      الأكثر اختياراً
                    </span>
                  ) : null}
                  <h3 className="font-display text-[24px] font-bold text-brand">{p.name}</h3>
                  <div className="mt-4 font-display text-[44px] font-bold leading-none text-brand num">
                    {formatNumber(p.seats)}
                  </div>
                  <p className="mt-1 text-[13px] text-muted">مقعداً</p>
                  <p className="mt-5 border-t border-gold-line pt-5 text-[17px] font-semibold text-gold num">
                    {formatCurrency(p.price)}
                  </p>
                  <Link href="/signup" className="btn-primary mt-6 w-full !rounded-[2px]">اختر الباقة</Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ————— الأسئلة الشائعة ————— */}
      <section id="faq" className="mx-auto max-w-3xl px-5 py-20">
        <p className="eyebrow">قبل أن تبدأ</p>
        <h2 className="sec-title font-display text-brand">الأسئلة الشائعة</h2>
        <GoldRule />
        <div className="mt-8 divide-y divide-gold-line border-y border-gold-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-display text-[17px] font-bold text-brand marker:content-['']">
                {f.q}
                <span className="text-gold transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-[14px] leading-8 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ————— دعوة ختامية ————— */}
      <section className="bg-brand py-20 text-center text-white">
        <div className="mx-auto max-w-2xl px-5">
          <h2 className="font-display text-[clamp(28px,4vw,42px)] font-bold leading-snug">
            مناسبتك تستحق دعوة منظّمة
          </h2>
          <p className="mt-4 text-[15px] leading-8 text-white/75">
            ابدأ الآن، وجهّز قائمتك قبل الحفل بوقت كافٍ.
          </p>
          <Link href="/signup" className="btn-gold mt-8 !rounded-[2px]">أنشئ حسابك</Link>
        </div>
      </section>

      <footer className="border-t border-gold-line py-8 text-center">
        <span className="font-cerem text-[24px] text-brand">برقية<span className="text-gold">.</span></span>
        <p className="mt-2 text-[12.5px] text-muted">منصة إدارة دعوات المناسبات</p>
      </footer>
    </main>
  );
}

// تُعرض حين لا تتوفر باقات في القاعدة بعد
const FALLBACK_PACKAGES = [
  { id: '', name: 'باقة ١٠٠', seats: 100, price: 499 },
  { id: '', name: 'باقة ٣٠٠', seats: 300, price: 1299 },
  { id: '', name: 'باقة ٥٠٠', seats: 500, price: 1999 },
] as unknown as Package[];
