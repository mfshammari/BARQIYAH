'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { formatNumber } from '@/lib/format';

/** دول الخليج بترتيب الاستخدام، والسعودية أولاً. */
export const COUNTRIES = [
  { flag: '🇸🇦', name: 'السعودية', dial: '966' },
  { flag: '🇦🇪', name: 'الإمارات', dial: '971' },
  { flag: '🇰🇼', name: 'الكويت', dial: '965' },
  { flag: '🇶🇦', name: 'قطر', dial: '974' },
  { flag: '🇧🇭', name: 'البحرين', dial: '973' },
  { flag: '🇴🇲', name: 'عُمان', dial: '968' },
];

/** مؤشّر الخطوات — عددها يتبدّل: التسجيل ثلاث خطوات والدخول خطوتان. */
export function Dots({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <div className="mb-6 flex justify-center gap-2" aria-label={`الخطوة ${step} من ${total}`}>
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <span
          key={n}
          className={`h-2 w-2 rounded-full transition-colors ${n === step ? 'bg-gold' : 'bg-line'}`}
        />
      ))}
    </div>
  );
}

export function Submit({ label, pendingLabel, disabled }: {
  label: string; pendingLabel: string; disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary !rounded-[2px] w-full" disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </button>
  );
}

/** عدّاد تنازلي يُعاد تشغيله بتغيّر المفتاح. */
export function useCountdown(seconds: number, key: number) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const t = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [seconds, key]);
  return left;
}

/** m:ss بالأرقام العربية الهندية. */
export function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${formatNumber(m)}:${formatNumber(s).padStart(2, '٠')}`;
}

/** حقل الجوال: مفتاح الدولة ملتصق بالرقم، والرقم دائماً LTR. */
export function PhoneField({
  dial, setDial, phone, setPhone, id = 'p-phone', label = 'رقم الجوال',
}: {
  dial: string; setDial: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  id?: string; label?: string;
}) {
  const ok = phone.length >= 8;
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <select
          name="dial"
          className="field !rounded-[2px] w-[122px] shrink-0"
          value={dial}
          onChange={(e) => setDial(e.target.value)}
          aria-label="مفتاح الدولة"
        >
          {COUNTRIES.map((c) => (
            <option key={c.dial} value={c.dial}>{c.flag} +{c.dial}</option>
          ))}
        </select>
        <input
          id={id} name="phone" dir="ltr" inputMode="tel" autoComplete="tel"
          className="field !rounded-[2px] text-end"
          placeholder="5xxxxxxxx"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
          required
        />
      </div>
      {ok ? <p className="hint num" dir="ltr">+{dial}{phone}</p> : null}
    </div>
  );
}

/**
 * ست خانات للرمز: تنقّل تلقائي، ولصق كامل، وإرسال ذاتي عند اكتمالها،
 * وهزّة وتفريغ عند الخطأ.
 */
export function CodeBoxes({
  action, disabled, error,
}: {
  action: (fd: FormData) => void;
  disabled: boolean;
  error?: string;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [shake, setShake] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!error) return;
    setShake(true);
    setDigits(Array(6).fill(''));
    const t = setTimeout(() => { setShake(false); refs.current[0]?.focus(); }, 400);
    return () => clearTimeout(t);
  }, [error]);

  const submitIfComplete = (next: string[]) => {
    // الإرسال الذاتي فور اكتمال الست خانات — بلا زر تأكيد
    if (next.every((d) => d !== '')) setTimeout(() => formRef.current?.requestSubmit(), 0);
  };

  return (
    <form ref={formRef} action={action} className="mt-6">
      <input type="hidden" name="code" value={digits.join('')} />
      <div className={`flex justify-center gap-2 ${shake ? 'animate-[shake_.4s]' : ''}`} dir="ltr">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            value={d}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            aria-label={`الخانة ${i + 1}`}
            className="field !rounded-[2px] h-12 w-11 p-0 text-center font-mono text-[19px]"
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '');
              const next = [...digits];
              next[i] = v.slice(-1);
              setDigits(next);
              if (v && i < 5) refs.current[i + 1]?.focus();
              submitIfComplete(next);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
              if (text.length < 2) return;
              e.preventDefault();
              const next = text.padEnd(6, '').split('').slice(0, 6);
              setDigits(next);
              refs.current[Math.min(text.length, 5)]?.focus();
              submitIfComplete(next);
            }}
          />
        ))}
      </div>
    </form>
  );
}

/** تنبيه وضع المحاكاة: الرمز موحّد ولا يُرسل حتى تُربط Meta. */
export function UnifiedNotice({ code }: { code: string }) {
  return (
    <div className="mt-4 rounded-xl bg-info-soft px-3.5 py-3 text-[12.5px] leading-7 text-info">
      <b>وضع المحاكاة:</b> مفاتيح واتساب غير مربوطة بعد، فالرمز موحّد ولا يُرسل فعلاً.
      الرمز: <b dir="ltr" className="font-mono tracking-[2px]">{code}</b>
    </div>
  );
}
