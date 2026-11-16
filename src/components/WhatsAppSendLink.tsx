'use client';

import { useState, useTransition } from 'react';

/**
 * زر «واتساب» بجانب المدعو — الحل المؤقّت للإرسال اليدوي.
 *
 * رابط عادي يفتح واتساب (الجوال أو الويب) والرسالة جاهزة برابط المدعو.
 * للمسودة: الضغط يحجز مقاعدها ويحوّلها إلى «أُرسلت» في الخلفية؛ إن رُفض
 * الحجز يظهر السبب هنا، وصفحة المدعو تبقى غير مفعّلة حتى ينجح.
 * للمُرسلة التي لم يُردّ عليها: الزر يبقى باسم «إرسال مرة أخرى» ويفتح الرسالة
 * نفسها بالرابط نفسه بلا حجز جديد، ويختفي حين يردّ المدعو بالقبول أو الاعتذار.
 */
export function WhatsAppSendLink({
  href, markSent, label = 'واتساب',
}: {
  /** null = رقم غير صالح لواتساب */
  href: string | null;
  /** يُستدعى للمسودة فقط — يحجز ويسجّل الإرسال */
  markSent?: () => Promise<{ error?: string }>;
  label?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!href) {
    return <span className="text-[11.5px] text-danger" title="صحّح رقم الجوال">رقم غير صالح</span>;
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <a
        href={href} target="_blank" rel="noopener noreferrer"
        className="btn-soft btn-sm"
        aria-busy={pending}
        onClick={() => {
          if (!markSent) return;
          setError(null);
          startTransition(async () => {
            try {
              const r = await markSent();
              if (r.error) setError(r.error);
            } catch {
              setError('تعذّر تسجيل الإرسال. حدّث الصفحة وحاول مرة أخرى.');
            }
          });
        }}
      >
        {label}
      </a>
      {error ? (
        <span className="max-w-[220px] text-end text-[11.5px] leading-5 text-danger">
          لم تُفعَّل الدعوة: {error}
        </span>
      ) : null}
    </span>
  );
}
