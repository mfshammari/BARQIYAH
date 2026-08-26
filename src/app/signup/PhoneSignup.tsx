'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  startPhoneSignup, resendOtp, verifyPhoneCode,
  type OtpState, type VerifyState,
} from './otpActions';
import {
  Dots, Submit, PhoneField, CodeBoxes, UnifiedNotice, useCountdown, mmss,
} from './otpUi';
import { formatNumber } from '@/lib/format';

export function PhoneSignup() {
  const router = useRouter();
  const [details, detailsAction] = useActionState<OtpState, FormData>(startPhoneSignup, {});
  const [resent, resendAction] = useActionState<OtpState, FormData>(resendOtp, {});
  const [verify, verifyAction] = useActionState<VerifyState, FormData>(verifyPhoneCode, {});

  const [dial, setDial] = useState('966');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCode = details.step === 'code' || resent.step === 'code';
  const unified = resent.unifiedCode ?? details.unifiedCode;
  const done = verify.done;

  // مفتاح لإعادة تشغيل العدّادين عند كل إرسال جديد
  const [round, setRound] = useState(0);
  useEffect(() => { if (onCode) setRound((r) => r + 1); }, [onCode, resent.notice]);

  const resendIn = useCountdown(60, round);
  const expiresIn = useCountdown(300, round);

  // ————— الخطوة الثالثة: تم —————
  if (done) {
    return (
      <>
        <Dots step={3} total={3} />
        <h1 className="text-center font-display text-[24px] font-bold text-brand">تم إنشاء حسابك</h1>

        {verify.recoveryCode ? (
          <>
            <div className="mt-5 border border-gold-line bg-warn-soft p-5 text-center">
              <div className="text-[12.5px] font-semibold text-warn">رمز الاسترجاع</div>
              <div
                dir="ltr"
                className="mt-3 font-mono text-[22px] font-bold tracking-[3px] text-ink"
              >
                {verify.recoveryCode}
              </div>
              <button
                type="button"
                className="btn-ghost btn-sm !rounded-[2px] mt-4"
                onClick={() => {
                  navigator.clipboard?.writeText(verify.recoveryCode!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? 'تم النسخ ✓' : 'انسخ الرمز'}
              </button>
            </div>

            <p className="mt-4 text-[13px] leading-7 text-muted">
              احتفظ بهذا الرمز في مكان آمن. لن نعرضه لك مرة أخرى، وهو وسيلتك لاستعادة
              حسابك إذا فقدت رقم جوالك.
            </p>

            {!verify.hasEmail ? (
              <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-3 text-[12.5px] leading-7 text-danger">
                لم تُدخل بريداً إلكترونياً، لذا هذا الرمز هو وسيلة الاسترجاع الوحيدة لديك.
              </p>
            ) : null}

            <label className="mt-5 flex items-start gap-2.5 text-[13.5px] text-ink">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-brand"
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
              />
              حفظتُ رمز الاسترجاع
            </label>

            <button
              type="button"
              className="btn-primary !rounded-[2px] mt-5 w-full"
              disabled={!saved}
              onClick={() => router.push('/app/events/new')}
            >
              إنشاء أول مناسبة
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-center text-[13.5px] text-muted">أهلاً بعودتك.</p>
            <button
              type="button"
              className="btn-primary !rounded-[2px] mt-5 w-full"
              onClick={() => router.push('/app')}
            >
              إلى مناسباتي
            </button>
          </>
        )}
      </>
    );
  }

  // ————— الخطوة الثانية: الرمز —————
  if (onCode) {
    const expired = expiresIn === 0;
    const locked = verify.error?.includes('تجاوزت');

    return (
      <>
        <Dots step={2} total={3} />
        <h1 className="text-center font-display text-[24px] font-bold text-brand">أدخل رمز التحقق</h1>
        <p className="mt-2 text-center text-[13px] leading-7 text-muted">
          أرسلنا رمزاً إلى واتساب على الرقم{' '}
          <span dir="ltr" className="num text-ink">+{dial}{phone}</span>
        </p>

        {unified ? <UnifiedNotice code={unified} /> : null}

        <CodeBoxes action={verifyAction} disabled={expired || Boolean(locked)} error={verify.error} />

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
            <Link href="/signup" className="hover:underline">تغيير الرقم</Link>
          </p>
        </div>
      </>
    );
  }

  // ————— الخطوة الأولى: البيانات —————
  const phoneOk = phone.length >= 8;
  const ready = name.trim().length >= 3 && phoneOk && consent;

  return (
    <>
      <Dots step={1} total={3} />
      <h1 className="text-center font-display text-[24px] font-bold text-brand">أنشئ حسابك</h1>
      <p className="mt-2 text-center text-[13px] text-muted">سنرسل لك رمز تحقق عبر واتساب</p>

      <form action={detailsAction} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="s-name">الاسم الكامل</label>
          <input
            id="s-name" name="full_name" className="field !rounded-[2px]" required minLength={3}
            value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
          />
        </div>

        <PhoneField id="s-phone" dial={dial} setDial={setDial} phone={phone} setPhone={setPhone} />

        <div>
          <label className="label" htmlFor="s-email">
            البريد الإلكتروني{' '}
            <span className="badge border border-line bg-panel text-muted">اختياري</span>
          </label>
          <input id="s-email" name="email" type="email" dir="ltr"
            className="field !rounded-[2px] text-end" autoComplete="email" />
          <p className="hint">لاستعادة حسابك إذا فقدت رقمك</p>
        </div>

        <label
          className={`flex items-start gap-2.5 border p-3.5 text-[13px] leading-7 transition ${
            details.error?.includes('الموافقة')
              ? 'animate-pulse border-danger bg-danger-soft'
              : 'border-gold-line bg-paper'
          }`}
        >
          <input
            type="checkbox" name="consent" className="mt-1 h-4 w-4 shrink-0 accent-brand"
            checked={consent} onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            أوافق على <Link href="#" className="text-brand underline">الشروط والأحكام</Link>{' '}
            وأتعهّد بأن جميع المدعوين قد وافقوا على استقبال الدعوة منّي.
          </span>
        </label>

        {details.error ? (
          <p className="text-[12.5px] font-semibold text-danger">{details.error}</p>
        ) : null}

        <Submit label="إرسال رمز التحقق" pendingLabel="جاري الإرسال…" disabled={!ready} />
      </form>

      <p className="mt-4 text-center text-[12.5px] text-muted">
        لديك حساب؟{' '}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          ادخل برقمك
        </Link>
      </p>
    </>
  );
}
