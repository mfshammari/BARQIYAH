'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { remindPending } from './actions';
import { formatNumber } from '@/lib/format';

function Submit({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary btn-sm" disabled={pending}>
      {pending ? 'جارٍ الإرسال…' : `ذكّر ${formatNumber(count)}`}
    </button>
  );
}

/**
 * تذكير من لم يردّ — رسالة واتساب مدفوعة تُرسل **مرة واحدة فقط**،
 * فنؤكّد قبلها بنافذة تذكر العدد وتنصّ على أنها لا تتكرّر (SPEC §4.1).
 */
export function RemindButton({ eventId, count }: { eventId: string; count: number }) {
  const [state, formAction] = useActionState<{ error?: string; notice?: string }, FormData>(
    remindPending,
    {},
  );
  const [confirming, setConfirming] = useState(false);

  if (state.notice) {
    return <span className="text-[12.5px] font-semibold text-ok">{state.notice}</span>;
  }

  return (
    <>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirming(true)}>
        ذكّرهم
      </button>

      {confirming ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="card card-pad w-full max-w-sm">
            <h3 className="font-ui text-[16px] font-bold text-ink">
              تذكير <span className="num">{formatNumber(count)}</span> مدعواً لم يردّوا
            </h3>
            <p className="mt-2 text-[13px] leading-7 text-muted">
              تُرسل رسالة واتساب واحدة لكل واحد منهم — <b className="text-ink">مرة واحدة فقط</b>،
              ولن يدخلوا في أي تذكير لاحق مهما تأخّروا. الرسالة مدفوعة، وتكرارها يرفع
              شكاوى الحظر ويضرّ الرقم المشترك.
            </p>

            {state.error ? (
              <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
                {state.error}
              </p>
            ) : null}

            <form action={formAction} className="mt-4 flex justify-end gap-2">
              <input type="hidden" name="event_id" value={eventId} />
              <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirming(false)}>
                إلغاء
              </button>
              <Submit count={count} />
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
