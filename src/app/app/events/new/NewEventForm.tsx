'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createEvent, type ActionState } from '../actions';
import { formatCurrency, formatEventLine, formatNumber } from '@/lib/format';
import { CELEBRANT_LABELS, OCCASION_LABELS, hasTwoCelebrants, type OccasionType, type Package, type Template } from '@/lib/types';

const STEPS = ['التفاصيل', 'الباقة', 'القالب', 'الدفع'] as const;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'جارٍ الإنشاء…' : 'إنشاء المناسبة'}
    </button>
  );
}

export function NewEventForm({
  packages, templates,
}: { packages: Package[]; templates: Template[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createEvent, {});
  const [step, setStep] = useState(0);

  // حقول المعاينة الحيّة
  const [occasion, setOccasion] = useState<OccasionType>('wedding');
  const [host, setHost] = useState('');
  const [celebrant1, setCelebrant1] = useState('');
  const [celebrant2, setCelebrant2] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [venue, setVenue] = useState('');
  const [packageId, setPackageId] = useState('');

  const two = hasTwoCelebrants(occasion);
  const celebrantLabel = CELEBRANT_LABELS[occasion];

  const celebrants = two
    ? [celebrant1, celebrant2].filter(Boolean).join(' و')
    : celebrant1;

  const previewHost = host || '…';
  const previewOccasion = `${OCCASION_LABELS[occasion]}${celebrants ? ` ${celebrants}` : ''}`;
  const previewLine = formatEventLine({ dateGregorian: date || null, time, venue });

  const detailsReady = Boolean(date && host && celebrant1);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px] items-start">
      <form action={formAction} className="space-y-5">
        {/* شريط الخطوات */}
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(i)}
                className={`rounded-xl px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
                  step === i ? 'bg-brand text-white'
                    : 'border border-line bg-surface text-muted hover:text-ink'
                }`}
              >
                <span className="num">{['١','٢','٣','٤'][i]}</span> · {label}
              </button>
            </li>
          ))}
        </ol>

        {state.error ? (
          <div className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{state.error}</div>
        ) : null}

        {/* ————— ١) التفاصيل ————— */}
        <section className={`card card-pad space-y-4 ${step === 0 ? '' : 'hidden'}`}>
          <h2 className="sec-title">تفاصيل المناسبة</h2>

          <div>
            <label className="label" htmlFor="occ">نوع المناسبة</label>
            <select
              id="occ" name="occasion_type" className="field" value={occasion}
              onChange={(e) => setOccasion(e.target.value as OccasionType)}
            >
              {(Object.keys(OCCASION_LABELS) as OccasionType[]).map((k) => (
                <option key={k} value={k}>{OCCASION_LABELS[k]}</option>
              ))}
            </select>
          </div>

          <div className={`grid gap-4 ${two ? 'sm:grid-cols-2' : ''}`}>
            <div>
              <label className="label" htmlFor="c1">{two ? 'العريس' : celebrantLabel}</label>
              <input id="c1" name="celebrant_primary" className="field" required
                value={celebrant1} onChange={(e) => setCelebrant1(e.target.value)} placeholder="حمودي" />
            </div>
            {two ? (
              <div>
                <label className="label" htmlFor="c2">العروس <span className="text-muted font-normal">(اختياري)</span></label>
                <input id="c2" name="celebrant_secondary" className="field"
                  value={celebrant2} onChange={(e) => setCelebrant2(e.target.value)} placeholder="سوسو" />
              </div>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="host">الدعوة باسم</label>
            <input id="host" name="host_name" className="field" required
              value={host} onChange={(e) => setHost(e.target.value)} placeholder="أسرة العبدالله" />
            <p className="hint">الجهة الداعية كما تظهر في نص الدعوة.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="date">التاريخ الميلادي</label>
              <input id="date" name="event_date" type="date" className="field num" required
                value={date} onChange={(e) => setDate(e.target.value)} />
              <p className="hint">يُحسب التاريخ الهجري واليوم تلقائياً.</p>
            </div>
            <div>
              <label className="label" htmlFor="time">الوقت</label>
              <input id="time" name="event_time" type="time" className="field num"
                value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="venue">المكان</label>
            <input id="venue" name="venue" className="field"
              value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="قصر ٣٣ للاحتفالات" />
          </div>

          <div>
            <label className="label" htmlFor="iname">اسم المناسبة الداخلي <span className="text-muted font-normal">(اختياري)</span></label>
            <input id="iname" name="internal_name" className="field" placeholder="زواج حمودي" />
            <p className="hint">يميّزها في قائمة مناسباتك ولا يظهر للمدعوين.</p>
          </div>

          <button type="button" className="btn-primary" onClick={() => setStep(1)} disabled={!detailsReady}>
            التالي: الباقة
          </button>
        </section>

        {/* ————— ٢) الباقة ————— */}
        <section className={`card card-pad space-y-4 ${step === 1 ? '' : 'hidden'}`}>
          <h2 className="sec-title">اختر الباقة</h2>
          <p className="text-[13px] text-muted">الرصيد بالمقاعد (عدد الأشخاص) لا بعدد الدعوات.</p>

          <div className="grid gap-3 sm:grid-cols-2">
            {packages.map((p) => (
              <label key={p.id}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  packageId === p.id ? 'border-brand bg-brand-soft' : 'border-line hover:bg-panel'
                }`}>
                <input type="radio" name="package_id" value={p.id} className="sr-only"
                  checked={packageId === p.id} onChange={() => setPackageId(p.id)} />
                <div className="font-ui font-bold">{p.name}</div>
                <div className="mt-1 font-ui text-2xl font-extrabold num">{formatNumber(p.seats)}</div>
                <div className="text-[12px] text-muted">مقعداً</div>
                <div className="mt-2 border-t border-line pt-2 text-[13px] font-semibold text-gold num">
                  {formatCurrency(p.price)}
                </div>
              </label>
            ))}
          </div>
          {packages.length === 0 ? (
            <p className="text-[13px] text-warn">لا توجد باقات متاحة حالياً — تواصل مع الإدارة.</p>
          ) : null}

          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStep(0)}>رجوع</button>
            <button type="button" className="btn-primary" onClick={() => setStep(2)}>التالي: القالب</button>
          </div>
        </section>

        {/* ————— ٣) القالب ————— */}
        <section className={`card card-pad space-y-4 ${step === 2 ? '' : 'hidden'}`}>
          <h2 className="sec-title">قالب الدعوة</h2>
          <p className="text-[13px] text-muted">
            يمكنك اختياره الآن أو لاحقاً. كل داعٍ يختار قالبه ويكتب نصّه بنفسه.
          </p>

          <div>
            <label className="label" htmlFor="tpl">القالب</label>
            <select id="tpl" name="template_id" className="field" defaultValue="">
              <option value="">— أختار لاحقاً —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="img">رابط صورة الدعوة <span className="text-muted font-normal">(اختياري)</span></label>
            <input id="img" name="image_url" dir="ltr" className="field text-left" placeholder="https://…" />
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStep(1)}>رجوع</button>
            <button type="button" className="btn-primary" onClick={() => setStep(3)}>التالي: الدفع</button>
          </div>
        </section>

        {/* ————— ٤) الدفع ————— */}
        <section className={`card card-pad space-y-4 ${step === 3 ? '' : 'hidden'}`}>
          <h2 className="sec-title">الدفع والتفعيل</h2>
          <div className="rounded-xl bg-info-soft px-4 py-3 text-[13px] text-info">
            تُنشأ المناسبة بحالة <b>غير مدفوعة</b>. بعد إتمام الدفع تُفعَّل تلقائياً ويُضاف رصيد
            المقاعد. يمكنك تجهيز المدعوين والدعاة قبل الدفع، والإرسال يبدأ بعد التفعيل.
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStep(2)}>رجوع</button>
            <Submit />
          </div>
        </section>
      </form>

      {/* ————— المعاينة الحيّة ————— */}
      <aside className="lg:sticky lg:top-24">
        <h2 className="sec-title mb-3">كيف ستصل دعوتك</h2>
        <div className="overflow-hidden rounded-2xl border border-line">
          <div className="px-6 py-8 text-center" style={{ background: 'linear-gradient(160deg,#1A4433,#123528)' }}>
            <div className="pointer-events-none absolute" aria-hidden />
            <div className="mx-auto grid place-items-center rounded-full border border-gold-soft/70 font-cerem text-2xl text-gold-soft"
                 style={{ width: 48, height: 48 }}>ب</div>
            <p className="mt-4 text-[11px] tracking-[3px] text-gold-soft">دعوة</p>
            <h3 className="mt-3 font-display text-[15px] leading-[2] text-[#F5EEDC]">
              تتشرّف {previewHost} بدعوتكم
              <br />
              لحضور {previewOccasion}
            </h3>
            <div className="my-4 flex items-center justify-center gap-2" aria-hidden>
              <span className="h-px w-10" style={{ background: 'linear-gradient(90deg,transparent,#D8BE86)' }} />
              <span className="rotate-45 text-[7px] text-gold-soft">◆</span>
              <span className="h-px w-10" style={{ background: 'linear-gradient(90deg,#D8BE86,transparent)' }} />
            </div>
            <p className="text-[12px] leading-7 text-white/75 num">{previewLine || '…'}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 bg-panel p-3">
            <span className="rounded-lg bg-surface py-2 text-center text-[12.5px] font-semibold text-brand">تأكيد الحضور</span>
            <span className="rounded-lg bg-surface py-2 text-center text-[12.5px] font-semibold text-muted">الاعتذار</span>
          </div>
        </div>
        <p className="hint mt-2 text-center">
          الموعد والمكان يُحقنان آلياً من بيانات المناسبة، ولا يحرّرهما الدعاة.
        </p>
      </aside>
    </div>
  );
}
