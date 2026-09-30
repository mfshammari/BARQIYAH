'use client';

import { useActionState, useState } from 'react';
import { SubmitButton } from '@/components/ActionForm';
import { InviteTextEditor } from '@/components/InviteTextEditor';
import { saveEventInvite, type ActionState } from '../actions';
import { validateInviteVars } from '@/lib/inviteVars';

/** «دعوتي» للمالك: متغيّرا القالب الموحّد + الصورة + المعاينة. */
export function OwnerInviteEditor({
  eventId, eventLine, initial,
}: {
  eventId: string;
  eventLine: string;
  initial: { host: string; occasion: string; imageUrl: string | null };
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveEventInvite, {});
  const [host, setHost] = useState(initial.host);
  const [occasion, setOccasion] = useState(initial.occasion);
  const issues = validateInviteVars({ host, occasion });

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="event_id" value={eventId} />

      {state.error ? (
        <div className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{state.error}</div>
      ) : null}
      {state.notice ? (
        <div className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-[13px] text-ok">{state.notice}</div>
      ) : null}

      <section className="card card-pad space-y-4">
        <div>
          <h2 className="sec-title mb-1">نصّ دعوتك</h2>
          <p className="text-[12.5px] text-muted">
            القالب واحد لكل المنصة — تكتب فيه الجهة الداعية ووصف المناسبة، والموعد يُحقن آلياً.
          </p>
        </div>

        <InviteTextEditor
          host={host} occasion={occasion} eventLine={eventLine}
          onHostChange={setHost} onOccasionChange={setOccasion}
          hostLabel="الدعوة باسم" occasionLabel="المناسبة"
          hostHint="الجهة الداعية كما تظهر في نصّ الدعوة." occasionHint="مثل: زواج محمد وعريب."
          fieldPrefix="ev-"
          image={
            initial.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={initial.imageUrl} alt="" className="mb-2 max-h-32 w-full rounded-lg object-cover" />
            ) : (
              <div className="mb-2 grid h-24 place-items-center rounded-lg bg-panel text-[11px] text-muted">
                صورة الدعوة
              </div>
            )
          }
        />

        <div>
          <label className="label" htmlFor="ev-img">صورة الدعوة <span className="font-normal text-muted">(اختياري)</span></label>
          <input id="ev-img" name="image_url" dir="ltr" className="field text-left"
            defaultValue={initial.imageUrl ?? ''} placeholder="https://…" />
        </div>

        <SubmitButton className={`btn-primary ${issues.length > 0 ? 'pointer-events-none opacity-50' : ''}`}>
          حفظ دعوتي
        </SubmitButton>
      </section>
    </form>
  );
}
