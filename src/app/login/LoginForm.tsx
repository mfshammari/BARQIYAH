'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, type AuthState } from './actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'جارٍ الدخول…' : label}
    </button>
  );
}

export function LoginForm({
  next = '', label = 'تسجيل الدخول',
}: { next?: string; label?: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">البريد الإلكتروني</label>
        <input
          id="email" name="email" type="email" required autoComplete="email"
          dir="ltr" className="field text-left" placeholder="you@example.com"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">كلمة المرور</label>
        <input
          id="password" name="password" type="password" required
          autoComplete="current-password" dir="ltr" className="field text-left" placeholder="••••••••"
        />
      </div>
      {state.error ? (
        <div className="rounded-xl bg-danger-soft text-danger px-3.5 py-2.5 text-[13px]">
          {state.error}
        </div>
      ) : null}
      <SubmitButton label={label} />
    </form>
  );
}
