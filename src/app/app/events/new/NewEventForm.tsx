'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createEvent, type ActionState } from '../actions';
import { formatEventLine } from '@/lib/format';
import { PackagePicker } from '@/components/PackagePicker';
import { InviteTextEditor } from '@/components/InviteTextEditor';
import { InviteImagePicker } from '@/components/InviteImagePicker';
import { defaultOccasionText, validateInviteVars, renderInvite } from '@/lib/inviteVars';
import { CELEBRANT_LABELS, OCCASION_LABELS, hasTwoCelebrants, type OccasionType, type PackageCatalog } from '@/lib/types';

const STEPS = ['التفاصيل', 'الباقة', 'دعوتك', 'الدفع'] as const;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'جارٍ الإنشاء…' : 'إنشاء المناسبة'}
    </button>
  );
}

export function NewEventForm({ catalog, uid }: { catalog: PackageCatalog; uid: string }) {
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

  // متغيّرا القالب الموحّد {{1}} و{{2}} — يُملآن ابتداءً من التفاصيل ويحرّرهما المالك
  const [inviteHost, setInviteHost] = useState('');
  const [inviteOccasion, setInviteOccasion] = useState('');
  const [inviteTouched, setInviteTouched] = useState({ host: false, occasion: false });

  const two = hasTwoCelebrants(occasion);
  const celebrantLabel = CELEBRANT_LABELS[occasion];

  const suggestedOccasion = defaultOccasionText(
    OCCASION_LABELS[occasion], two ? [celebrant1, celebrant2] : [celebrant1],
  );
  const effectiveHost = inviteTouched.host ? inviteHost : host;
  const effectiveOccasion = inviteTouched.occasion ? inviteOccasion : suggestedOccasion;

  const previewLine = formatEventLine({ dateGregorian: date || null, time, venue });
  const previewText = renderInvite({ host: effectiveHost, occasion: effectiveOccasion }, previewLine || '…');

  const detailsReady = Boolean(date && host && celebrant1);
  const inviteReady = validateInviteVars({ host: effectiveHost, occasion: effectiveOccasion }).length === 0;

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
                value={celebrant1} onChange={(e) => setCelebrant1(e.target.value)} placeholder="محمد" />
            </div>
            {two ? (
              <div>
                <label className="label" htmlFor="c2">العروس <span className="text-muted font-normal">(اختياري)</span></label>
                <input id="c2" name="celebrant_secondary" className="field"
                  value={celebrant2} onChange={(e) => setCelebrant2(e.target.value)} placeholder="عريب" />
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
            <input id="iname" name="internal_name" className="field" placeholder="زواج محمد" />
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

          <PackagePicker catalog={catalog} />
          <p className="hint">السعر يتجمّد لحظة الشراء — تعديل الباقات لاحقاً لا يغيّر فاتورتك.</p>

          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStep(0)}>رجوع</button>
            <button type="button" className="btn-primary" onClick={() => setStep(2)}>التالي: القالب</button>
          </div>
        </section>

        {/* ————— ٣) دعوتك ————— */}
        <section className={`card card-pad space-y-4 ${step === 2 ? '' : 'hidden'}`}>
          <h2 className="sec-title">دعوتك</h2>
          <p className="text-[13px] text-muted">
            القالب واحد للمنصة كلها. تكتب فيه الجهة الداعية ووصف المناسبة، والموعد والمكان يُحقنان آلياً.
            كل داعٍ يكتب نصّه بنفسه لاحقاً.
          </p>

          <InviteTextEditor
            host={effectiveHost} occasion={effectiveOccasion} eventLine={previewLine}
            onHostChange={(v) => { setInviteHost(v); setInviteTouched((t) => ({ ...t, host: true })); }}
            onOccasionChange={(v) => { setInviteOccasion(v); setInviteTouched((t) => ({ ...t, occasion: true })); }}
            hostLabel="الدعوة باسم" occasionLabel="المناسبة"
            hostHint="يُملأ من «الدعوة باسم» — عدّله كما تريد أن يظهر." occasionHint="يُملأ من نوع المناسبة وأصحابها."
            fieldPrefix="new-"
          />

          <div>
            <span className="label">صورة الدعوة</span>
            <InviteImagePicker
              uid={uid} folder="pending"
              generatedFallback={
                <div className="grid h-20 place-items-center rounded-xl bg-panel text-[12px] text-muted">
                  بطاقة برقية الخضراء الذهبية — كالمعاينة المجاورة — تُولَّد من بيانات دعوتك.
                </div>
              }
            />
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStep(1)}>رجوع</button>
            <button type="button" className="btn-primary" onClick={() => setStep(3)} disabled={!inviteReady}>
              التالي: الدفع
            </button>
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
              تتشرّف {effectiveHost || '…'} بدعوتكم
              <br />
              لحضور {effectiveOccasion || '…'}
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
        <p className="mt-2 rounded-xl bg-panel px-3 py-2 text-[12px] leading-6 text-muted">{previewText}</p>
      </aside>
    </div>
  );
}
