'use client';

import { useState } from 'react';
import { LoginForm } from './LoginForm';
import { PhoneSignup } from '@/app/signup/PhoneSignup';

/**
 * مساران للدخول:
 *  - **العميل بجواله** عبر رمز يصله على واتساب (نفس خطوات التسجيل —
 *    الرقم المعروف يدخل مباشرةً بلا إنشاء حساب جديد).
 *  - **الفريق بالبريد وكلمة المرور** — مسار موثوق لا يعتمد على قناة
 *    خارجية، فلا يُقفل الباب على الإدارة إن تعطّل واتساب.
 */
export function LoginTabs({ next }: { next: string }) {
  const [tab, setTab] = useState<'phone' | 'email'>('phone');

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTab('phone')}
          className={tab === 'phone' ? 'tab-on' : 'tab'}
        >
          بجوالي
        </button>
        <button
          type="button"
          onClick={() => setTab('email')}
          className={tab === 'email' ? 'tab-on' : 'tab'}
        >
          فريق برقية
        </button>
      </div>

      {tab === 'phone' ? (
        <PhoneSignup />
      ) : (
        <>
          <LoginForm next={next} />
          <p className="mt-4 text-center text-[12px] leading-6 text-muted">
            هذا المسار لفريق المنصة. العملاء يدخلون بأرقام جوالهم.
          </p>
        </>
      )}
    </>
  );
}
