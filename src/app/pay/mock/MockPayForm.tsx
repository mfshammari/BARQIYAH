'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { simulatePayment, type MockPayState } from './actions';

function Btn({ action, className, children }: { action: string; className: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="action" value={action} className={className} disabled={pending}>
      {pending ? '…' : children}
    </button>
  );
}

export function MockPayForm({ tx, back }: { tx: string; back: string }) {
  const [state, action] = useActionState<MockPayState, FormData>(simulatePayment, {});

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="tx" value={tx} />
      <input type="hidden" name="back" value={back} />

      {state.error ? (
        <div className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{state.error}</div>
      ) : null}
      {state.notice ? (
        <div className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-[13px] text-ok">{state.notice}</div>
      ) : null}

      <Btn action="pay" className="btn-primary w-full">تأكيد الدفع</Btn>

      <div className="grid grid-cols-2 gap-2">
        <Btn action="fail" className="btn-danger">محاكاة فشل</Btn>
        <Btn action="retry" className="btn-ghost">إعادة إرسال الحدث</Btn>
      </div>

      <p className="hint text-center">
        «إعادة الإرسال» تختبر الـidempotency — البوابات الحقيقية تعيد الإرسال،
        والمقاعد يجب ألا تتضاعف.
      </p>
    </form>
  );
}
