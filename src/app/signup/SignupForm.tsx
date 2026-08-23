'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signUp, type SignupState } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
    </button>
  );
}

export function SignupForm() {
  const [state, formAction] = useActionState<SignupState, FormData>(signUp, {});

  if (state.notice) {
    return (
      <div className="rounded-xl bg-ok-soft px-4 py-4 text-center text-[13.5px] font-semibold text-ok">
        {state.notice}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <div className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{state.error}</div>
      ) : null}

      <div>
        <label className="label" htmlFor="full_name">الاسم الكامل</label>
        <input id="full_name" name="full_name" className="field" placeholder="محمد العبدالله" required />
      </div>
      <div>
        <label className="label" htmlFor="email">البريد الإلكتروني</label>
        <input id="email" name="email" type="email" dir="ltr" className="field text-left"
          placeholder="you@example.com" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="phone">رقم الجوال</label>
        <input id="phone" name="phone" dir="ltr" className="field text-left num"
          placeholder="0555123456" inputMode="tel" required />
      </div>
      <div>
        <label className="label" htmlFor="password">كلمة المرور</label>
        <input id="password" name="password" type="password" dir="ltr" className="field text-left"
          placeholder="٨ أحرف على الأقل" autoComplete="new-password" minLength={8} required />
      </div>

      <label className="flex items-start gap-2 text-[12.5px] leading-6 text-muted">
        <input type="checkbox" name="consent" className="mt-1 accent-brand" />
        <span>
          أوافق على شروط الاستخدام، وعلى تلقّي رسائل تتعلق بحسابي ومناسباتي.
          أرقام مدعوّيّ تُستخدم لإيصال الدعوة فقط.
        </span>
      </label>

      <Submit />
    </form>
  );
}
