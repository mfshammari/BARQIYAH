import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { qrDataUrl } from '@/lib/qr';
import { appUrl } from '@/lib/env';
import { formatDate, formatNumber } from '@/lib/format';
import { OCCASION_LABELS, type EventRow, type Guest } from '@/lib/types';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Message({ title, body }: { title: string; body?: string }) {
  return (
    <main className="min-h-screen grid place-items-center px-4 py-8">
      <div className="card card-pad max-w-sm w-full text-center">
        <div className="font-display font-bold text-lg">{title}</div>
        {body ? <p className="text-[13px] text-muted mt-2">{body}</p> : null}
      </div>
    </main>
  );
}

/** بطاقة الباركود للمدعو المؤكِّد — تُفتح من رابط واتساب وتُعرض عند البوابة. */
export default async function InvitePassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!UUID_RE.test(token)) return <Message title="رابط غير صالح" />;
  if (!adminClientAvailable) return <Message title="الخدمة غير متاحة حالياً" />;

  const admin = createAdminClient();
  const { data: guest } = await admin
    .from('guests').select('*').eq('qr_token', token).maybeSingle<Guest>();

  if (!guest) {
    return <Message title="الرمز غير موجود" body="تأكد من فتح الرابط كما وصلك في رسالة واتساب." />;
  }

  const { data: event } = await admin
    .from('events').select('*').eq('id', guest.event_id).maybeSingle<EventRow>();

  const seats = guest.confirmed_seats ?? 0;
  const remaining = Math.max(0, seats - guest.scans_used);
  const qr = await qrDataUrl(appUrl(`/i/${token}`), 420);

  return (
    <main className="min-h-screen grid place-items-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="card overflow-hidden">
          <div className="bg-brand text-center px-6 py-6">
            <div className="font-cerem text-gold-soft text-xl">بطاقة الدخول</div>
            {event ? (
              <>
                <p className="text-white text-[15px] mt-2 font-semibold">{event.host_name}</p>
                <p className="text-white/70 text-[12.5px] mt-1">
                  {OCCASION_LABELS[event.occasion_type]} · <span className="num">{formatDate(event.event_date)}</span>
                </p>
              </>
            ) : null}
          </div>

          <div className="card-pad text-center">
            <p className="text-[14px] font-semibold">{guest.name}</p>
            <p className="text-[12.5px] text-muted mt-0.5">
              عدد المقاعد: <b className="text-ink num">{formatNumber(seats)}</b>
            </p>

            <div className="mt-4 rounded-xl border border-line p-3 bg-surface inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="رمز الدخول" className="w-56 h-56" />
            </div>

            <div className="mt-4">
              {guest.status === 'attended' && remaining === 0 ? (
                <div className="rounded-xl bg-brand text-white px-4 py-3 text-[13.5px] font-semibold">
                  تم تسجيل دخول جميع المقاعد
                </div>
              ) : guest.scans_used > 0 ? (
                <div className="rounded-xl bg-warn-soft text-warn px-4 py-3 text-[13.5px] font-semibold">
                  دخل <span className="num">{formatNumber(guest.scans_used)}</span> من{' '}
                  <span className="num">{formatNumber(seats)}</span> — متبقٍ{' '}
                  <span className="num">{formatNumber(remaining)}</span>
                </div>
              ) : (
                <div className="rounded-xl bg-ok-soft text-ok px-4 py-3 text-[13.5px] font-semibold">
                  الرمز صالح — يُمسح عند البوابة
                </div>
              )}
            </div>

            <p className="text-[11.5px] text-muted mt-4">
              يُمسح هذا الرمز بعدد المقاعد المؤكّدة فقط، ولا يُقبل بعد اكتمالها.
            </p>
          </div>
        </div>

        <p className="text-center text-[11.5px] text-muted mt-4">
          <span className="font-cerem text-brand">برقية</span>
        </p>
      </div>
    </main>
  );
}
