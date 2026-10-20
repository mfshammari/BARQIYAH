'use client';

import { useActionState, useState } from 'react';
import { SubmitButton } from '@/components/ActionForm';
import { InviteTextEditor } from '@/components/InviteTextEditor';
import { InviteImagePicker } from '@/components/InviteImagePicker';
import { saveInviteContent, type ActionState } from './actions';
import { validateInviteVars } from '@/lib/inviteVars';
import type { ImageMode } from '@/lib/types';

/**
 * «دعوتي» للداعي — خطوة واحدة: النص + الصورة + المعاينة.
 * القالب واحد للمنصة كلها؛ الموعد والمكان صفّ مقفل مصدره صاحب المناسبة (SPEC §8.4).
 */
export function InviteEditor({
  inviterId, uid, eventLine, initial,
}: {
  inviterId: string;
  uid: string;
  eventLine: string;
  initial: {
    host: string; occasion: string;
    imageMode: ImageMode; imagePath: string | null; imagePublicUrl: string | null; generatedUrl: string;
  };
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveInviteContent, {});
  const [host, setHost] = useState(initial.host);
  const [occasion, setOccasion] = useState(initial.occasion);
  const [preview, setPreview] = useState<string | null>(
    initial.imageMode === 'uploaded' ? initial.imagePublicUrl : initial.generatedUrl,
  );
  const issues = validateInviteVars({ host, occasion });

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="inviter_id" value={inviterId} />

      {state.error ? (
        <div className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{state.error}</div>
      ) : null}
      {state.notice ? (
        <div className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-[13px] text-ok">{state.notice}</div>
      ) : null}

      <section className="card card-pad space-y-4">
        <div>
          <h2 className="sec-title mb-1">اكتب نصّك</h2>
          <p className="text-[12.5px] text-muted">
            اسمك وصلتك بالمناسبة فقط — والموعد والمكان يأتيان من صاحب المناسبة.
          </p>
        </div>

        <InviteTextEditor
          host={host} occasion={occasion} eventLine={eventLine}
          onHostChange={setHost} onOccasionChange={setOccasion}
          fieldPrefix="inv-"
          image={
            preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="mb-2 max-h-40 w-full rounded-lg object-cover" />
            ) : (
              <div className="mb-2 grid h-24 place-items-center rounded-lg bg-panel text-[11px] text-muted">
                بلا صورة
              </div>
            )
          }
        />

        <div>
          <span className="label">صورة دعوتك</span>
          <InviteImagePicker
            uid={uid} folder={inviterId}
            initialMode={initial.imageMode} initialPath={initial.imagePath}
            initialPublicUrl={initial.imagePublicUrl} generatedUrl={initial.generatedUrl}
            onChange={(v) => setPreview(v.mode === 'uploaded' ? v.publicUrl : initial.generatedUrl)}
          />
          <p className="hint">لكل داعٍ صورته — تظهر أعلى الرسالة.</p>
        </div>

        <SubmitButton className={`btn-primary ${issues.length > 0 ? 'pointer-events-none opacity-50' : ''}`}>
          حفظ دعوتي
        </SubmitButton>
      </section>
    </form>
  );
}
