'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  startPhoneLogin, resendLoginOtp, verifyLoginCode,
  type LoginOtpState, type LoginVerifyState,
} from './otpActions';
import {
  Dots, Submit, PhoneField, CodeBoxes, UnifiedNotice, useCountdown, mmss,
} from '@/app/signup/otpUi';
import { formatNumber } from '@/lib/format';

/**
 * دخول العميل: خطوتان لا أكثر — رقم الجوال، ثم الرمز الذي يصله.
 * لا اسم ولا بريد ولا إقرار؛ تلك للتسجيل وحده.
 */
export function PhoneLogin({ next }: { next: string }) {
  const router = useRouter();
  const [start, startAction] = useActionState<LoginOtpState, FormData>(startPhoneLogin, {});
  const [resent, resendAction] = useActionState<LoginOtpState, FormData>(resendLoginOtp, {});
  const [verify, verifyAction] = useActionState<LoginVerifyState, FormData>(verifyLoginCode, {});

  const [dial, setDial] = useState('966');
  const [phone, setPhone] = useState('');

  const onCode = start.step === 'code' || resent.step === 'code';
  const unified = resent.unifiedCode ?? start.unifiedCode;

  const [round, setRound] = useState(0);
  useEffect(() => { if (onCode) setRound((r) => r + 1); }, [onCode, resent.notice]);

  const resendIn = useCountdown(60, round);
  const expiresIn = useCountdown(300, round);

  useEffect(() => {
    if (verify.done) router.push(next || '/app');
  }, [verify.done, next, router]);

  // ————— الخطوة الثانية: الرمز —————
  if (onCode) {
    const expired = expiresIn === 0;
    const locked = Boolean(verify.error?.includes('تجاوزت'));

    return (
      <>
        <Dots step={2} total={2} />
        <h1 className="text-center font-display text-[24px] font-bold text-brand">أدخل رمز الدخول</h1>
        <p className="mt-2 text-center text-[13px] leading-7 text-muted">
          أرسلنا رمزاً إلى واتساب على الرقم{' '}
          <span dir="ltr" className="num text-ink">+{dial}{phone}</span>
        </p>

        {unified ? <UnifiedNotice code={unified} /> : null}

        <CodeBoxes action={verifyAction} disabled={expired || locked} error={verify.error} />

        {verify.error ? (
          <p className="mt-3 text-center text-[12.5px] font-semibold text-danger">
            {verify.error}
            {verify.attemptsLeft ? (
              <span className="block font-normal text-muted">
                بقيت لك {formatNumber(verify.attemptsLeft)} محاولات
              </span>
            ) : null}
          </p>
        ) : null}

        <div className="mt-5 space-y-2 text-center text-[12.5px] text-muted">
          {expired ? (
            <p className="font-semibold text-danger">انتهت صلاحية الرمز</p>
          ) : (
            <p className="num">تنتهي صلاحية الرمز خلال {mmss(expiresIn)}</p>
          )}

          <form action={resendAction}>
            {resendIn > 0 && !expired ? (
              <span className="num">إعادة الإرسال خلال {mmss(resendIn)}</span>
            ) : (
              <button type="submit" className="font-semibold text-brand hover:underline">
                إعادة إرسال الرمز
              </button>
            )}
          </form>

          <p>
            <Link href="/login" className="hover:underline">تغيير الرقم</Link>
          </p>
        </div>
      </>
    );
  }

  // ————— الخطوة الأولى: الجوال —————
  return (
    <>
      <Dots step={1} total={2} />
      <h1 className="text-center font-display text-[24px] font-bold text-brand">ادخل بجوالك</h1>
      <p className="mt-2 text-center text-[13px] text-muted">سنرسل لك رمز دخول عبر واتساب</p>

      <form action={startAction} className="mt-6 space-y-4">
        <PhoneField id="l-phone" dial={dial} setDial={setDial} phone={phone} setPhone={setPhone} />

        {start.error ? (
          <p className="text-[12.5px] font-semibold text-danger">
            {start.error}
            {start.error.includes('لا يوجد حساب') ? (
              <Link href="/signup" className="mx-1 underline">إنشاء حساب</Link>
            ) : null}
          </p>
        ) : null}

        <Submit
          label="إرسال رمز الدخول"
          pendingLabel="جاري الإرسال…"
          disabled={phone.length < 8}
        />
      </form>

      <p className="mt-4 text-center text-[12.5px] text-muted">
        ما عندك حساب؟{' '}
        <Link href="/signup" className="font-semibold text-brand hover:underline">أنشئ حسابك</Link>
      </p>
    </>
  );
}
