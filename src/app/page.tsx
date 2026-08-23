import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser, homePathForRole } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { InvitePreview, GoldRule } from '@/components/landing/InvitePreview';
import {
  ShowcaseRow, BalanceVisual, GuestsVisual, SeatsVisual, ScanVisual,
} from '@/components/landing/Showcase';
import { formatNumber } from '@/lib/format';
import type { Package } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STEPS = [
  { n: '٠١', t: 'أنشئ مناسبتك', d: 'اختر نوع المناسبة وتاريخها، والباقة المناسبة بعدد المقاعد.' },
  { n: '٠٢', t: 'جهّز دعوتك', d: 'اختر قالباً معتمداً لنوع مناسبتك، وأضف صورة الدعوة الخاصة بك.' },
  { n: '٠٣', t: 'أرسلها عبر واتساب', d: 'أرسل لمدعوٍّ واحد، أو احفظ القائمة كاملةً كمسودة وأطلقها دفعةً واحدة.' },
  { n: '٠٤', t: 'استقبل ضيوفك', d: 'يُمسح باركود كل مدعوٍّ عند الباب، وتتابع الحضور من لوحتك.' },
];

const FEATURES = [
  { t: 'باركود لكل مدعو', d: 'بطاقة دخول فريدة بعدد مقاعدها، تمنع تكرار الدخول.' },
  { t: 'تأكيد فوري', d: 'يؤكّد المدعو حضوره وعدد مرافقيه بضغطةٍ من الواتساب.' },
  { t: 'إدارة الدعاة', d: 'أضف دعاةً يوزّعون قوائمهم، ويظهر لكل مدعوٍّ اسم داعيه.' },
  { t: 'رصيد بالمقاعد', d: 'تابع المتاح والمحجوز والمؤكّد، مع استرداد المقاعد الملغاة.' },
  { t: 'قوالب لكل مناسبة', d: 'مكتبة قوالب مصنّفة، أو اطلب تصميماً خاصاً باسمك.' },
  { t: 'تقارير الحضور', d: 'من قبِل، ومن اعتذر، ومن حضر — أرقامٌ واضحة لحظياً.' },
];

const OCCASIONS = [
  { t: 'حفل زفاف', d: 'قوالب فخمة تليق بليلة العمر.', tag: 'الأكثر استخداماً' },
  { t: 'خطوبة وملكة', d: 'دعواتٌ راقية لبداية الفرح.', tag: 'قوائم متوسطة' },
  { t: 'عقد قران', d: 'مناسبةٌ خاصة بحضورٍ منتقى.', tag: 'قوائم مختصرة' },
  { t: 'حفل تخرّج', d: 'احتفِ بالإنجاز مع من تحب.', tag: 'موسم الصيف' },
  { t: 'مولودٌ جديد', d: 'شارك بشرى الفرح الصغير.', tag: 'دعواتٌ مصغّرة' },
  { t: 'مناسبات رسمية', d: 'حفلاتٌ ومؤتمرات بتنظيمٍ دقيق.', tag: 'قوائم كبيرة' },
];

const PLANS = [
  {
    name: 'أساسية', desc: 'مثالية للمناسبات العائلية والقوائم الصغيرة.',
    price: 299, seats: 100, cta: 'اختر الأساسية', featured: false,
    features: ['قوالب دعوات معتمدة', 'إرسال عبر واتساب', 'باركود لكل مدعو', '٥ رسائل تجريبية مجانية'],
  },
  {
    name: 'قياسية', desc: 'الخيار الأنسب لأغلب حفلات الزفاف.',
    price: 699, seats: 300, cta: 'اختر القياسية', featured: true,
    features: ['كل مزايا الباقة الأساسية', 'إدارة الدعاة وتوزيع القوائم', 'حسابات مسح متعددة للأبواب', 'تقارير حضورٍ لحظية', 'طلب قالبٍ خاص بك'],
  },
  {
    name: 'مميزة', desc: 'للحفلات الكبيرة والقوائم الطويلة.',
    price: 1199, seats: 600, cta: 'اختر المميزة', featured: false,
    features: ['كل مزايا الباقة القياسية', 'أولوية في اعتماد القوالب', 'حدٌّ أعلى للدعاة والماسحين', 'دعمٌ مخصّص طوال المناسبة'],
  },
];

const FAQ = [
  { q: 'هل يحتاج المدعو تطبيقاً أو حساباً؟', a: 'لا. تصله الدعوة على واتساب، ويؤكّد بضغطة زر — بلا تحميل ولا تسجيل.' },
  { q: 'هل بيانات مدعوّيّ محفوظة؟', a: 'أرقام ضيوفك تُستخدم لإرسال دعوتك فقط — لا تُشارك ولا تُستخدم لأي تسويق.' },
  { q: 'هل أستطيع تخصيص تصميم الدعوة؟', a: 'اختر من مكتبة القوالب المعتمدة، أو اطلب قالباً خاصاً باسمك ونعتمده لك.' },
  { q: 'هل الاشتراك متكرر؟', a: 'لا. تدفع لكل مناسبة مرةً واحدة، والباقة مستقلة بمقاعدها.' },
  { q: 'كم شخصاً يمكنه المسح على الباب؟', a: 'أنشئ حسابات مسح متعددة — لكل بوابة حسابها، والحضور يظهر لحظياً.' },
  { q: 'ماذا لو لم يردّ المدعو؟', a: 'مقاعده تبقى محجوزة وتظهر في لوحتك بوضوح، وتقدر تحرّرها متى شئت.' },
];

export default async function LandingPage() {
  if (supabaseConfigured) {
    const user = await getSessionUser();
    if (user) redirect(homePathForRole(user.profile.role));
  }

  // الباقات من القاعدة إن وُجدت، وإلا باقات التصميم
  let dbPackages: Package[] = [];
  if (supabaseConfigured) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.from('packages').select('*').eq('active', true)
        .order('seats', { ascending: true }).returns<Package[]>();
      dbPackages = data ?? [];
    } catch { /* الهبوط يعمل بلا قاعدة */ }
  }

  const plans = dbPackages.length >= 3
    ? dbPackages.slice(0, 3).map((p, i) => ({
        ...PLANS[i], name: p.name, price: Number(p.price), seats: p.seats,
      }))
    : PLANS;

  return (
    <main className="bg-ivory">
      {/* ————— الهيدر ————— */}
      <header className="sticky top-0 z-40 border-b border-gold-line/60 bg-ivory/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <span className="font-cerem text-[30px] font-bold text-brand">
            برقية<span className="text-gold">.</span>
          </span>
          <nav className="hidden items-center gap-7 text-[14px] text-muted md:flex">
            <a href="#how" className="hover:text-gold">كيف تعمل</a>
            <a href="#features" className="hover:text-gold">المميزات</a>
            <a href="#platform" className="hover:text-gold">داخل المنصة</a>
            <a href="#pricing" className="hover:text-gold">الباقات</a>
            <a href="#faq" className="hover:text-gold">الأسئلة</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost btn-sm !rounded-[2px] hidden sm:inline-flex">دخول</Link>
            <Link href="/signup" className="btn-primary btn-sm !rounded-[2px]">أنشئ مناسبتك</Link>
          </div>
        </div>
      </header>

      {/* ————— الهيرو ————— */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-16 md:grid-cols-2 md:py-24">
        <div className="text-center md:text-right">
          <p className="text-[13px] font-semibold tracking-[4px] text-gold">منصة الدعوات الرقمية</p>
          <h1 className="mt-5 font-display text-[clamp(34px,5vw,54px)] font-bold leading-[1.35] text-brand">
            ادعُ ضيوفك <em className="not-italic text-gold">ببرقية</em>
            <br />
            وتابع حضورهم حتى الباب
          </h1>
          <p className="mt-5 text-[15.5px] leading-8 text-muted">
            أنشئ مناسبتك، اختر قالب دعوتك، وأرسلها عبر واتساب. لكل مدعوٍّ بطاقة دخول بباركود
            تُمسح عند الوصول — وأنت تتابع من أكّد ومن حضر لحظةً بلحظة.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
            <Link href="/signup" className="btn-primary !rounded-[2px]">أنشئ مناسبتك</Link>
            <a href="#how" className="btn-ghost !rounded-[2px]">شاهد كيف تعمل</a>
          </div>
          <p className="mt-4 text-[12.5px] text-muted">
            <b className="text-gold">جرّبها مجاناً</b> — خمس دعوات تجريبية قبل أن تدفع، بلا بطاقة ولا التزام.
          </p>

          <div className="mt-9 grid grid-cols-3 gap-5 border-t border-gold-line pt-6">
            {[
              ['واتساب', 'وصولٌ مباشر لكل مدعو'],
              ['باركود', 'بطاقة دخول لكل ضيف'],
              ['لحظياً', 'تقارير حضورٍ فورية'],
            ].map(([b, s]) => (
              <div key={b}>
                <b className="block font-display text-[20px] font-bold text-brand">{b}</b>
                <span className="mt-1 block text-[11.5px] leading-6 text-muted">{s}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-3 text-center text-[11.5px] tracking-[2px] text-gold">دعوة بباركود</p>
          <InvitePreview />
        </div>
      </section>

      {/* ————— كيف تعمل ————— */}
      <section id="how" className="bg-paper py-20">
        <div className="mx-auto max-w-6xl px-5">
          <p className="eyebrow">تجربة الاستخدام</p>
          <h2 className="sec-title font-display text-brand">من الدعوة إلى باب الحفل</h2>
          <GoldRule />
          <p className="mx-auto max-w-xl text-center text-[14.5px] leading-8 text-muted">
            أربع خطواتٍ تفصلك عن مناسبةٍ منظّمة، بلا جداول ولا مكالمات تأكيد.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="border-t border-gold-line pt-5">
                <div className="font-display text-[40px] font-bold leading-none text-gold-soft num">{s.n}</div>
                <h3 className="mt-4 font-display text-[20px] font-bold text-brand">{s.t}</h3>
                <p className="mt-2 text-[13.5px] leading-7 text-muted">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ————— المميزات ————— */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-20">
        <p className="eyebrow">المميزات</p>
        <h2 className="sec-title font-display text-brand">كل ما تحتاجه لإدارة الحضور</h2>
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
      </section>

      {/* ————— داخل المنصة ————— */}
      <section id="platform" className="bg-paper py-20">
        <div className="mx-auto max-w-6xl px-5">
          <p className="eyebrow">داخل المنصة</p>
          <h2 className="sec-title font-display text-brand">لوحةٌ تُريك كل شيء</h2>
          <GoldRule />
          <p className="mx-auto max-w-xl text-center text-[14.5px] leading-8 text-muted">
            لا جداول إكسل ولا مكالمات تأكيد — كل مدعوٍّ وحالته أمامك في شاشةٍ واحدة.
          </p>

          <div className="mt-14 space-y-16">
            <ShowcaseRow block={{
              eyebrow: 'لوحة المتابعة',
              title: 'رصيدك بثلاث حالات، لحظةً بلحظة',
              body: 'تعرف كم مقعداً بقي لك، وكم محجوزٌ بانتظار ردّ المدعو، وكم تأكّد فعلياً. وتحتها من أكّد ومن اعتذر ومن حضر — بأرقامٍ تتحدّث نفسها.',
              points: ['تنبيهٌ قبل نفاد المقاعد', 'المقاعد الملغاة تعود لرصيدك', 'تقرير حضورٍ كامل بعد الحفل'],
              visual: <BalanceVisual />,
            }} />

            <ShowcaseRow block={{
              eyebrow: 'إدارة المدعوين',
              title: 'جهّز قائمتك كاملة، ثم أطلقها بضغطة',
              body: 'أضِف مدعوّيك واحداً واحداً أو ارفعهم من ملف إكسل، واحفظهم جميعاً كمسودة. راجع الأسماء والمقاعد على مهلك، وحين تجهز أرسل الدعوات كلها دفعةً واحدة.',
              points: ['حفظ الجميع كمسودة والإرسال في وقتٍ واحد', 'رفع قائمة من ملف إكسل', 'إعادة إرسال لمن لم تصله الدعوة'],
              visual: <GuestsVisual />,
              flip: true,
            }} />

            <ShowcaseRow block={{
              eyebrow: 'رصيدٌ ذكي',
              title: 'لا تدفع مقابل مقاعد لم تُشغَل',
              body: 'ترسل الدعوة بحدٍّ أقصى للمقاعد، فتُحجز احتياطاً حتى يرد المدعو. وحين يختار عدداً أقل، يعود الفارق إلى رصيدك في اللحظة نفسها — فتدعو به غيره.',
              points: ['الحجز يحميك من تجاوز سعة القاعة', 'الفارق يعود فوراً بلا تدخّل منك', 'الاعتذار يُرجع المقاعد كاملة'],
              visual: <SeatsVisual />,
            }} />

            <ShowcaseRow block={{
              eyebrow: 'المسح عند الباب',
              title: 'ماسحٌ لكل بوابة، والحضور يظهر فوراً',
              body: 'أنشئ حساب مسحٍ لكل باب — بوابة الرجال، بوابة النساء — يفتحه المنظّم على جواله ويمسح الباركود. المقاعد تُخصم مع كل مسحة، والكود المستهلك يُرفض تلقائياً.',
              points: ['حسابات مسح متعددة بلا تعارض', 'يمنع دخول كودٍ مستخدم أو غير صالح', 'عدّاد الحضور يتحدّث لحظياً في لوحتك'],
              visual: <ScanVisual />,
              flip: true,
            }} />
          </div>
        </div>
      </section>

      {/* ————— أنواع الاحتفالات ————— */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className="eyebrow">لكل مناسبةٍ برقيّتها</p>
        <h2 className="sec-title font-display text-brand">أنواع الاحتفالات</h2>
        <GoldRule />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OCCASIONS.map((o) => (
            <div key={o.t} className="border border-gold-line bg-white px-6 py-7">
              <h4 className="font-display text-[22px] font-bold text-brand">{o.t}</h4>
              <p className="mt-1.5 text-[13px] leading-7 text-muted">{o.d}</p>
              <span className="mt-4 inline-block border border-gold-line bg-paper px-2.5 py-1 text-[11px] text-gold">
                {o.tag}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-[13px] text-muted">
          لكل نوعٍ قوالبه المعتمدة — تختارها عند إنشاء مناسبتك.
        </p>
      </section>

      {/* ————— الباقات ————— */}
      <section id="pricing" className="bg-paper py-20">
        <div className="mx-auto max-w-6xl px-5">
          <p className="eyebrow">الأسعار</p>
          <h2 className="sec-title font-display text-brand">باقاتٌ بعدد المقاعد</h2>
          <GoldRule />
          <p className="mx-auto max-w-xl text-center text-[14px] leading-8 text-muted">
            ادفع مرةً واحدة لكل مناسبة — لا اشتراكات. المقعد الواحد = ضيفٌ واحد يدخل الحفل،
            وكل باقة مستقلة لمناسبتها.
          </p>

          <div className="mt-12 grid items-start gap-5 md:grid-cols-3">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`border bg-white px-7 py-9 ${
                  p.featured ? 'border-gold shadow-pop md:-my-4 md:py-12' : 'border-gold-line'
                }`}
              >
                {p.featured ? (
                  <span className="mb-3 inline-block bg-gold px-3 py-1 text-[11px] font-semibold tracking-wider text-white">
                    الأكثر طلباً
                  </span>
                ) : null}
                <h3 className="font-display text-[26px] font-bold text-brand">{p.name}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-muted">{p.desc}</p>

                <div className="mt-5 flex items-baseline gap-1.5 border-t border-gold-line pt-5">
                  <span className="font-display text-[44px] font-bold leading-none text-brand num">
                    {formatNumber(p.price)}
                  </span>
                  <span className="text-[13px] text-muted">ر.س</span>
                </div>
                <p className="mt-1 text-[13px] font-semibold text-gold num">{formatNumber(p.seats)} مقعد</p>

                <ul className="mt-5 space-y-2.5 border-t border-gold-line pt-5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] leading-6 text-ink">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link href="/signup"
                  className={`mt-7 w-full !rounded-[2px] ${p.featured ? 'btn-gold' : 'btn-primary'}`}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-[13px] text-muted">
            تحتاج مقاعد إضافية بعد الشراء؟ تقدر ترقّي باقتك في أي وقت قبل المناسبة.
          </p>
        </div>
      </section>

      {/* ————— الأسئلة ————— */}
      <section id="faq" className="mx-auto max-w-3xl px-5 py-20">
        <p className="eyebrow">قبل أن تبدأ</p>
        <h2 className="sec-title font-display text-brand">أسئلة يسألها الجميع</h2>
        <GoldRule />
        <div className="mt-8 divide-y divide-gold-line border-y border-gold-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-display text-[17px] font-bold text-brand marker:content-['']">
                {f.q}
                <span className="shrink-0 text-gold transition-transform group-open:rotate-45">+</span>
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
            ابدأ أولى مناسباتك مع برقية
          </h2>
          <p className="mt-4 text-[15px] leading-8 text-white/75">
            جهّز دعوتك خلال دقائق، وجرّبها مجاناً بخمس رسائل قبل الإطلاق.
          </p>
          <Link href="/signup" className="btn-gold mt-8 !rounded-[2px]">أنشئ حسابك الآن</Link>
        </div>
      </section>

      {/* ————— تواصل ————— */}
      <section className="mx-auto max-w-3xl px-5 py-20 text-center">
        <p className="eyebrow">تواصل</p>
        <h2 className="sec-title font-display text-brand">لديك سؤال قبل أن تبدأ؟</h2>
        <GoldRule />
        <p className="text-[14px] leading-8 text-muted">
          نجيبك على أي استفسار — عن الباقات، أو القوالب، أو تجهيز مناسبتك.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[['واتساب', '0500000000'], ['البريد', 'hello@barqiyah.sa']].map(([label, value]) => (
            <div key={label} className="border border-gold-line bg-white px-6 py-6">
              <div className="text-[12px] text-muted">{label}</div>
              <div className="mt-1.5 font-display text-[18px] font-bold text-brand num" dir="ltr">{value}</div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[12.5px] text-muted">نردّ خلال ساعات العمل · السبت إلى الخميس</p>
      </section>

      {/* ————— الفوتر ————— */}
      <footer className="border-t border-gold-line bg-paper py-12">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="font-cerem text-[26px] font-bold text-brand">برقية<span className="text-gold">.</span></span>
            <p className="mt-2 text-[12.5px] leading-7 text-muted">
              منصةٌ سعودية لإدارة دعوات المناسبات، من الإرسال إلى باب الحفل.
            </p>
          </div>
          {[
            { t: 'المنصة', links: [['كيف تعمل', '#how'], ['المميزات', '#features'], ['الباقات', '#pricing'], ['المناسبات', '#platform']] },
            { t: 'الحساب', links: [['تسجيل الدخول', '/login'], ['إنشاء حساب', '/signup'], ['لوحة التحكم', '/app']] },
            { t: 'تواصل', links: [['الدعم', '#faq'], ['الأسئلة الشائعة', '#faq'], ['الشروط والخصوصية', '#faq']] },
          ].map((col) => (
            <div key={col.t}>
              <h4 className="text-[13px] font-bold text-brand">{col.t}</h4>
              <ul className="mt-3 space-y-2">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} className="text-[12.5px] text-muted hover:text-gold">{label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-10 max-w-6xl border-t border-gold-line px-5 pt-6 text-center text-[12px] text-muted num">
          © ٢٠٢٦ برقية — جميع الحقوق محفوظة
        </p>
      </footer>
    </main>
  );
}
