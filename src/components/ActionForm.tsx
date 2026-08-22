'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

export interface FormState { error?: string; notice?: string }

export function SubmitButton({
  children, className = 'btn-primary', pendingLabel = 'جارٍ الحفظ…', name, value,
}: {
  children: ReactNode; className?: string; pendingLabel?: string;
  name?: string; value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** غلاف نموذج يستخدم Server Action ويعرض رسائل النجاح/الخطأ. */
export function ActionForm({
  action, children, className = 'space-y-4', onSuccessReset = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  onSuccessReset?: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form
      action={formAction}
      className={className}
      key={onSuccessReset && state.notice ? state.notice : undefined}
    >
      {state.error ? (
        <div className="rounded-xl bg-danger-soft text-danger px-3.5 py-2.5 text-[13px]">
          {state.error}
        </div>
      ) : null}
      {state.notice ? (
        <div className="rounded-xl bg-ok-soft text-ok px-3.5 py-2.5 text-[13px]">
          {state.notice}
        </div>
      ) : null}
      {children}
    </form>
  );
}
