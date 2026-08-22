'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { acceptRsvp, declineRsvp, type RsvpState } from './actions';

function Pending({ children, className }: { children: React.ReactNode; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? 'جارٍ الإرسال…' : children}
    </button>
  );
}

export function RsvpForm({ token, maxSeats }: { token: string; maxSeats: number }) {
  const [mode, setMode] = useState<'idle' | 'accepting'>('idle');
  const [acceptState, acceptAction] = useActionState<RsvpState, FormData>(acceptRsvp, {});
  const [declineState, declineAction] = useActionState<RsvpState, FormData>(declineRsvp, {});
  const [seats, setSeats] = useState(Math.min(1, maxSeats));

  const state = acceptState.error || acceptState.notice ? acceptState : declineState;

  if (state.notice) {
    return (
      <div className="rounded-xl bg-ok-soft text-ok px-4 py-4 text-center text-[14px] font-semibold">
        {state.notice}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {state.error ? (
        <div className="rounded-xl bg-danger-soft text-danger px-3.5 py-2.5 text-[13px]">{state.error}</div>
      ) : null}

      {mode === 'idle' ? (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="btn-primary" onClick={() => setMode('accepting')}>
            تأكيد الحضور
          </button>
          <form action={declineAction}>
            <input type="hidden" name="token" value={token} />
            <Pending className="btn-ghost w-full">الاعتذار</Pending>
          </form>
        </div>
      ) : (
        <form action={acceptAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <label className="label text-center">كم عدد الحاضرين معكم؟</label>
            <div className="flex items-center justify-center gap-4 mt-2">
              <button
                type="button" className="btn-ghost w-11 h-11 !p-0 text-lg"
                onClick={() => setSeats((s) => Math.max(1, s - 1))}
                aria-label="إنقاص"
              >−</button>
              <span className="font-display font-extrabold text-3xl num w-14 text-center">{seats}</span>
              <button
                type="button" className="btn-ghost w-11 h-11 !p-0 text-lg"
                onClick={() => setSeats((s) => Math.min(maxSeats, s + 1))}
                aria-label="زيادة"
              >+</button>
            </div>
            <input type="hidden" name="seats" value={seats} />
            <p className="hint text-center">
              الحد الأقصى في دعوتكم <span className="num">{maxSeats}</span>
              {maxSeats > 1 ? ' أشخاص' : ' شخص'}
            </p>
          </div>

          <Pending className="btn-primary w-full">تأكيد الحضور</Pending>
          <button type="button" className="btn-ghost w-full" onClick={() => setMode('idle')}>
            رجوع
          </button>
        </form>
      )}
    </div>
  );
}
