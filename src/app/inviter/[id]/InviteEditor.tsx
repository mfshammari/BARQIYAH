'use client';

import { useActionState, useState } from 'react';
import { SubmitButton } from '@/components/ActionForm';
import { saveInviteContent, type ActionState } from './actions';
import { validateInviteVars, renderInvite, MAX_VAR_LENGTH } from '@/lib/inviteVars';
import type { Template } from '@/lib/types';

/**
 * «دعوتي» — خطوتان: اختيار القالب، ثم كتابة النص.
 * الموعد والمكان صفّ مقفل يبيّن مصدره: صاحب المناسبة (SPEC §8.4).
 */
export function InviteEditor({
  inviterId, templates, eventLine, initial,
}: {
  inviterId: string;
  templates: Template[];
  eventLine: string;
  initial: { host: string; occasion: string; templateId: string | null; imageUrl: string | null };
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveInviteContent, {});
  const [host, setHost] = useState(initial.host);
  const [occasion, setOccasion] = useState(initial.occasion);
  const [templateId, setTemplateId] = useState(initial.templateId ?? '');

  const issues = validateInviteVars({ host, occasion });
  const issueFor = (f: 'host' | 'occasion') => issues.find((i) => i.field === f);
  const touched = host.length > 0 || occasion.length > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px] items-start">
      <form action={action} className="space-y-5">
        <input type="hidden" name="inviter_id" value={inviterId} />

        {state.error ? (
          <div className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{state.error}</div>
        ) : null}
        {state.notice ? (
          <div className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-[13px] text-ok">{state.notice}</div>
        ) : null}

        {/* ١) القالب */}
        <section className="card card-pad">
          <h2 className="sec-title mb-1">
            <span className="num">١</span> · اختر قالبك
          </h2>
          <p className="mb-4 text-[12.5px] text-muted">
            اختيارك مستقل عن بقية الدعاة في المناسبة نفسها.
          </p>

          {templates.length === 0 ? (
            <p className="text-[13px] text-warn">لا توجد قوالب معتمدة بعد.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.map((t) => (
                <label key={t.id}
                  className={`cursor-pointer rounded-xl border p-3.5 transition-colors ${
                    templateId === t.id ? 'border-brand bg-brand-soft' : 'border-line hover:bg-panel'
                  }`}>
                  <input type="radio" name="template_id" value={t.id} className="sr-only"
                    checked={templateId === t.id} onChange={() => setTemplateId(t.id)} />
                  <div className="font-semibold text-[14px]">{t.name}</div>
                  <p className="mt-1 text-[12px] leading-6 text-muted line-clamp-3">{t.body_text}</p>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* ٢) النص */}
        <section className="card card-pad space-y-4">
          <div>
            <h2 className="sec-title mb-1">
              <span className="num">٢</span> · اكتب نصّك
            </h2>
            <p className="text-[12.5px] text-muted">
              اسمك وصلتك بالمناسبة فقط — والموعد والمكان يأتيان من صاحب المناسبة.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="host">من الداعي؟</label>
            <input
              id="host" name="host" className="field" value={host} maxLength={MAX_VAR_LENGTH + 20}
              onChange={(e) => setHost(e.target.value)} placeholder="أم عبدالله الفالح"
            />
            <div className="flex justify-between gap-3">
              <p className={`hint ${issueFor('host') && touched ? 'text-danger' : ''}`}>
                {touched && issueFor('host') ? issueFor('host')!.message : 'كما تريد أن يظهر في الدعوة.'}
              </p>
              <span className={`hint num shrink-0 ${host.length > MAX_VAR_LENGTH ? 'text-danger' : ''}`}>
                {host.length}/{MAX_VAR_LENGTH}
              </span>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="occasion">ما المناسبة؟</label>
            <input
              id="occasion" name="occasion" className="field" value={occasion} maxLength={MAX_VAR_LENGTH + 20}
              onChange={(e) => setOccasion(e.target.value)} placeholder="زواج ابني محمد"
            />
            <div className="flex justify-between gap-3">
              <p className={`hint ${issueFor('occasion') && touched ? 'text-danger' : ''}`}>
                {touched && issueFor('occasion') ? issueFor('occasion')!.message : 'صلتك بالمناسبة كما تكتبها أنت.'}
              </p>
              <span className={`hint num shrink-0 ${occasion.length > MAX_VAR_LENGTH ? 'text-danger' : ''}`}>
                {occasion.length}/{MAX_VAR_LENGTH}
              </span>
            </div>
          </div>

          {/* صف مقفل — مصدره صاحب المناسبة */}
          <div>
            <label className="label">الموعد والمكان</label>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3.5 py-2.5">
              <span className="text-muted" aria-hidden>🔒</span>
              <span className="text-[13px] text-muted num">{eventLine || '—'}</span>
            </div>
            <p className="hint">من بيانات المناسبة — لا يعدّله الدعاة، فالموعد واحد للجميع.</p>
          </div>

          <div>
            <label className="label" htmlFor="img">صورة دعوتك <span className="font-normal text-muted">(اختياري)</span></label>
            <input id="img" name="image_url" dir="ltr" className="field text-left"
              defaultValue={initial.imageUrl ?? ''} placeholder="https://…" />
            <p className="hint">لكل داعٍ صورته — تظهر أعلى الرسالة.</p>
          </div>

          <SubmitButton
            className={`btn-primary ${issues.length > 0 || !templateId ? 'pointer-events-none opacity-50' : ''}`}
          >
            حفظ دعوتي
          </SubmitButton>
          {issues.length > 0 && touched ? (
            <p className="hint text-danger">صحّح الملاحظات أعلاه — واتساب يرفض القالب وقد يضرّ ذلك بالرقم المشترك.</p>
          ) : null}
        </section>
      </form>

      {/* المعاينة الحيّة */}
      <aside className="lg:sticky lg:top-24">
        <h2 className="sec-title mb-3">كما تصل على واتساب</h2>
        <div className="overflow-hidden rounded-2xl border border-line bg-[#E6DDD4] p-3">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            {initial.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={initial.imageUrl} alt="" className="mb-2 max-h-32 w-full rounded-lg object-cover" />
            ) : (
              <div className="mb-2 grid h-24 place-items-center rounded-lg bg-panel text-[11px] text-muted">
                صورة الدعوة
              </div>
            )}
            <p className="text-[13px] leading-7 text-ink">
              {renderInvite({ host, occasion }, eventLine)}
            </p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <span className="rounded-lg bg-white py-2 text-center text-[12.5px] font-semibold text-[#075E54]">
              تأكيد الحضور
            </span>
            <span className="rounded-lg bg-white py-2 text-center text-[12.5px] font-semibold text-[#075E54]">
              الاعتذار
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
