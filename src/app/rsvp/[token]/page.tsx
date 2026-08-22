import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { InviteCard } from '@/components/InviteCard';
import { RsvpForm } from './RsvpForm';
import { appUrl } from '@/lib/env';
import { formatNumber } from '@/lib/format';
import type { EventRow, Guest } from '@/lib/types';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen grid place-items-center px-4 py-8">{children}</main>;
}

function Message({ title, body }: { title: string; body?: string }) {
  return (
    <Shell>
      <div className="card card-pad max-w-sm w-full text-center">
        <div className="font-display font-bold text-lg">{title}</div>
        {body ? <p className="text-[13px] text-muted mt-2">{body}</p> : null}
      </div>
    </Shell>
  );
}

/** صفحة RSVP العامة — بديل/مكمّل لأزرار واتساب، بلا تسجيل دخول. */
export default async function RsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!UUID_RE.test(token)) {
    return <Message title="رابط غير صالح" body="تأكد من فتح الرابط كما وصلك في رسالة واتساب." />;
  }
  if (!adminClientAvailable) {
    return <Message title="الخدمة غير متاحة حالياً" body="يرجى المحاولة بعد قليل." />;
  }

  const admin = createAdminClient();
  const { data: guest } = await admin
    .from('guests').select('*')
    .or(`invite_token.eq.${token},qr_token.eq.${token}`)
    .maybeSingle<Guest>();

  if (!guest) {
    return <Message title="الدعوة غير موجودة" body="قد يكون الرابط منتهياً أو غير صحيح." />;
  }

  const { data: event } = await admin
    .from('events').select('*').eq('id', guest.event_id).maybeSingle<EventRow>();

  if (!event) return <Message title="المناسبة غير متاحة" />;

  const card = (children: React.ReactNode) => (
    <Shell>
      <InviteCard
        hostName={event.host_name}
        occasion={event.occasion_type}
        eventDate={event.event_date}
        guestName={guest.name}
        imageUrl={event.image_url}
      >
        {children}
      </InviteCard>
    </Shell>
  );

  if (guest.status === 'draft') {
    return card(
      <p className="text-center text-[13px] text-muted">
        لم تُفعّل هذه الدعوة بعد. ستصلكم رسالة واتساب عند إرسالها.
      </p>,
    );
  }

  if (guest.status === 'declined') {
    return card(
      <div className="space-y-4">
        <div className="rounded-xl bg-panel border border-line px-4 py-3 text-center text-[13px] text-muted">
          سجّلنا اعتذاركم سابقاً. إن تغيّرت خططكم يمكنكم التأكيد الآن.
        </div>
        <RsvpForm token={guest.invite_token} maxSeats={guest.max_seats} />
      </div>,
    );
  }

  if (guest.status === 'accepted' || guest.status === 'attended') {
    return card(
      <div className="space-y-4 text-center">
        <div className="rounded-xl bg-ok-soft text-ok px-4 py-3 text-[13.5px] font-semibold">
          تم تأكيد حضوركم — <span className="num">{formatNumber(guest.confirmed_seats ?? 0)}</span>{' '}
          {(guest.confirmed_seats ?? 0) > 1 ? 'أشخاص' : 'شخص'}
        </div>
        {guest.qr_token ? (
          <a href={appUrl(`/i/${guest.qr_token}`)} className="btn-primary w-full">عرض الباركود</a>
        ) : null}
        {guest.status === 'attended' ? (
          <p className="text-[12.5px] text-muted">تم تسجيل دخولكم عند البوابة.</p>
        ) : (
          <p className="text-[12.5px] text-muted">
            لتعديل عدد الحاضرين، تواصلوا مع صاحب الدعوة.
          </p>
        )}
      </div>,
    );
  }

  // status === 'sent' أو 'expired'
  return card(
    <div className="space-y-4">
      <p className="text-center text-[13px] text-muted">
        دعوتكم تتسع لـ <b className="text-ink num">{formatNumber(guest.max_seats)}</b>{' '}
        {guest.max_seats > 1 ? 'أشخاص' : 'شخص'}. نرجو تأكيد العدد الفعلي.
      </p>
      <RsvpForm token={guest.invite_token} maxSeats={guest.max_seats} />
    </div>,
  );
}
