'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { formatNumber } from '@/lib/format';
import { resolveInviterNames } from '@/lib/manual-whatsapp/message';
import { getInvitationByToken, markOpened, submitRsvp } from '@/lib/manual-whatsapp/mock';
import type { Guest, Invitation } from '@/lib/manual-whatsapp/types';
import { InvitationCard } from './InvitationCard';

type Step = 'prompt' | 'count' | 'ticket' | 'declined';

function stepFor(g: Guest): Step {
  if (g.status === 'confirmed' || g.status === 'attended') return 'ticket';
  if (g.status === 'declined') return 'declined';
  return 'prompt';
}

/** صفحة المدعو العامة: الدعوة ثم السؤال ثم التذكرة — السيناريو نفسه الذي سيتّبعه البوت. */
export function GuestInvitation({ token }: { token: string }) {
  const [inv, setInv] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('prompt');
  const [showMap, setShowMap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getInvitationByToken(token);
        if (!alive) return;
        setInv(data);
        setStep(stepFor(data.guest));
        // فتح الصفحة يحوّل «مسودة» أو «بانتظار» إلى «فتح الدعوة»
        await markOpened(token);
      } catch {
        if (alive) setError('الرمز غير موجود');
      }
    })();
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if (step !== 'ticket') return;
    let alive = true;
    QRCode.toDataURL(token, {
      width: 480, margin: 1, errorCorrectionLevel: 'M',
      color: { dark: '#153A2BFF', light: '#FFFFFFFF' },
    }).then((url) => { if (alive) setQr(url); });
    return () => { alive = false; };
  }, [step, token]);

  async function answer(attending: boolean, attendees: number) {
    if (!inv || busy) return;
    setBusy(true);
    try {
      const guest = await submitRsvp(token, { attending, attendees });
      setInv({ ...inv, guest });
      setStep(stepFor(guest));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Frame>
        <div className="card rounded-[2px] p-6 text-center">
          <div className="font-display text-lg font-bold">{error}</div>
          <p className="mt-2 text-[13px] text-muted">تأكد من فتح الرابط كما وصلك في رسالة واتساب.</p>
        </div>
      </Frame>
    );
  }

  if (!inv) {
    return (
      <Frame>
        <div className="py-16 text-center text-[13px] text-muted">جارٍ تحميل الدعوة…</div>
      </Frame>
    );
  }

  const { event, guest, signBy } = inv;
  const names = resolveInviterNames(event, signBy);

  return (
    <Frame>
      <p className="mb-3 text-center font-display text-[18px] font-bold text-brand">المكرّم {guest.name}</p>

      <InvitationCard event={event} inviterNames={names} seats={guest.maxSeats} />

      <section className="mt-4 rounded-[2px] border border-gold-line bg-paper p-4 text-center">
        {step === 'prompt' ? (
          <>
            <h2 className="font-display text-[17px] font-bold text-brand">هل نسعد بحضوركم؟</h2>
            <div className="mt-3.5 grid gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => (guest.maxSeats > 1 ? setStep('count') : void answer(true, 1))}
                className="btn-primary !rounded-[2px] w-full"
              >
                تأكيد الحضور
              </button>
              <button type="button" disabled={busy} onClick={() => { void answer(false, 0); }} className="btn-ghost !rounded-[2px] w-full">
                اعتذار
              </button>
              <button type="button" onClick={() => setShowMap((v) => !v)} className="btn-ghost !rounded-[2px] w-full">
                موقع القاعة
              </button>
            </div>
            {showMap ? (
              <p className="mt-3 text-[13.5px] text-ink">
                موقع القاعة:{' '}
                <a href={event.mapUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">
                  افتح في الخرائط
                </a>
              </p>
            ) : null}
          </>
        ) : null}

        {step === 'count' ? (
          <>
            <h2 className="font-display text-[17px] font-bold text-brand">كم عدد الحضور؟</h2>
            <div className="mt-3.5 flex flex-wrap justify-center gap-2">
              {Array.from({ length: guest.maxSeats }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy}
                  onClick={() => { void answer(true, n); }}
                  className="btn-primary !rounded-[2px] num min-w-[56px]"
                >
                  {formatNumber(n)}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setStep('prompt')} className="mt-3 text-[12.5px] text-muted hover:text-ink">
              رجوع
            </button>
          </>
        ) : null}

        {step === 'ticket' ? (
          <>
            <h2 className="font-display text-[17px] font-bold text-ok">تم تأكيد حضوركم</h2>
            <p className="mt-1 text-[13px] text-muted">أبرزوا هذا الرمز عند البوابة</p>
            <div className="mx-auto mt-3 inline-block rounded-[2px] border border-line bg-surface p-2.5">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="رمز الدخول" className="h-52 w-52" />
              ) : (
                <div className="grid h-52 w-52 place-items-center text-[12px] text-muted">…</div>
              )}
            </div>
            <p dir="ltr" className="mt-2 font-mono text-[13px] tracking-wider text-ink">{guest.token}</p>
            <p className="mt-1 text-[13.5px]">
              عدد الحضور: <b className="num text-brand">{formatNumber(guest.attendees)}</b>
            </p>
            <button type="button" onClick={() => setStep('prompt')} className="btn-ghost btn-sm !rounded-[2px] mt-4">
              تغيير الرد
            </button>
          </>
        ) : null}

        {step === 'declined' ? (
          <>
            <p className="text-[14.5px] leading-8 text-ink">شكرًا لإبلاغنا. نتمنى لقاءكم في مناسبة قادمة.</p>
            <button type="button" onClick={() => setStep('prompt')} className="btn-ghost btn-sm !rounded-[2px] mt-3">
              تغيير الرد
            </button>
          </>
        ) : null}
      </section>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-bg px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-[400px]">
        {children}
        <p className="mt-6 text-center text-[11.5px] text-muted">
          أُرسلت عبر <span className="font-cerem text-brand">برقية</span>
        </p>
      </div>
    </main>
  );
}
