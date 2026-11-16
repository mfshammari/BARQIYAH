import { cache } from 'react';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { InviteCard } from '@/components/InviteCard';
import { RsvpForm } from './RsvpForm';
import { appUrl, supabaseConfigured } from '@/lib/env';
import { formatNumber } from '@/lib/format';
import { imageVersion, resolveHeaderImage, resolveInviteVideo } from '@/lib/inviteImage';
import { OG_DESCRIPTION, inviteTitle, ogImagePath, shouldRecordOpen } from '@/lib/inviteOg';
import { OCCASION_LABELS, type EventRow, type Guest, type Inviter } from '@/lib/types';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface InviteData {
  guest: Guest;
  event: EventRow;
  /** الداعي الفرعي صاحب النصّ والصورة — null إن كانت الدعوة من المالك */
  inviter: Inviter | null;
}

/** يقرأ الدعوة مرة واحدة لكل طلب — تشاركها generateMetadata والصفحة. */
const loadInvite = cache(async (token: string): Promise<InviteData | null> => {
  if (!UUID_RE.test(token) || !adminClientAvailable) return null;
  const admin = createAdminClient();
  const { data: guest } = await admin
    .from('guests').select('*')
    .or(`invite_token.eq.${token},qr_token.eq.${token}`)
    .maybeSingle<Guest>();
  if (!guest) return null;

  const { data: event } = await admin
    .from('events').select('*').eq('id', guest.event_id).maybeSingle<EventRow>();
  if (!event) return null;

  // صورة الدعوة كما وصلت: صورة الداعي إن كان له، وإلا صورة المالك
  const { data: inviterRow } = guest.inviter_id
    ? await admin.from('inviters').select('*').eq('id', guest.inviter_id).maybeSingle<Inviter>()
    : { data: null as Inviter | null };
  const inviterVars = (inviterRow?.invite_vars ?? {}) as { host?: string };
  const fromInviter = Boolean(inviterRow && inviterRow.profile_id !== event.owner_id && inviterVars.host);

  return { guest, event, inviter: fromInviter ? inviterRow : null };
});

/** مصدر البطاقة والمتغيّرات: الداعي الفرعي أو المالك. */
function cardSource(d: InviteData) {
  const { event, inviter } = d;
  if (inviter) {
    const vars = (inviter.invite_vars ?? {}) as { host?: string; occasion?: string };
    return {
      kind: 'inviter' as const, id: inviter.id, vars,
      imageMode: inviter.image_mode, imageUrl: inviter.image_url,
      version: [vars.host, vars.occasion, event.event_date, event.event_time, event.venue],
    };
  }
  const vars = (event.invite_vars ?? {}) as { host?: string; occasion?: string };
  return {
    kind: 'event' as const, id: event.id, vars,
    imageMode: event.image_mode, imageUrl: event.image_url,
    version: [vars.host, vars.occasion, event.event_date, event.event_time, event.venue, event.host_name],
  };
}

/**
 * معاينة الرابط في واتساب: og:title عنوان المناسبة (بلا اسم المدعو)،
 * og:description «دعوة خاصة»، og:image صورة الدعوة JPEG مضغوطة.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await loadInvite(token);
  const base: Metadata = { robots: { index: false, follow: false } };
  if (!data) return { ...base, title: 'دعوة — برقية' };

  const src = cardSource(data);
  const title = inviteTitle({
    occasionText: src.vars.occasion,
    occasionLabel: OCCASION_LABELS[data.event.occasion_type],
    hostName: data.event.host_name,
  });
  // بصمة تشمل مسار المرفوع: تغيّر الصورة يغيّر الرابط فيعيد الزاحف جلبها
  const image = appUrl(ogImagePath(src.kind, src.id, imageVersion([...src.version, src.imageMode, src.imageUrl])));

  return {
    ...base,
    title,
    description: OG_DESCRIPTION,
    openGraph: {
      type: 'website',
      locale: 'ar_SA',
      siteName: 'برقية',
      title,
      description: OG_DESCRIPTION,
      url: appUrl(`/rsvp/${token}`),
      images: [{ url: image, type: 'image/jpeg' }],
    },
    twitter: { card: 'summary_large_image', title, description: OG_DESCRIPTION, images: [image] },
  };
}

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

/** هل الزائر صاحب حساب في برقية (المالك أو الداعي يتفقّد الرابط)؟ لا يُحسب فتحاً من المدعو. */
async function viewerIsAccount(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return Boolean(data.user);
  } catch {
    return false;
  }
}

/**
 * يسجّل أول فتح لصفحة المدعو (guests.opened_at) — مرة واحدة، ويُستثنى زاحف
 * معاينة واتساب ومن يفتحه من حسابه. يُقرأ في جدول المدعوين كشارة «فتح الدعوة».
 */
async function recordOpen(guest: Guest) {
  if (guest.opened_at || guest.status === 'draft') return;
  const ua = (await headers()).get('user-agent');
  const account = await viewerIsAccount();
  if (!shouldRecordOpen({ status: guest.status, openedAt: guest.opened_at, userAgent: ua, viewerIsAccount: account })) return;
  await createAdminClient()
    .from('guests').update({ opened_at: new Date().toISOString() })
    .eq('id', guest.id).is('opened_at', null);
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

  const data = await loadInvite(token);
  if (!data) {
    return <Message title="الدعوة غير موجودة" body="قد يكون الرابط منتهياً أو غير صحيح." />;
  }
  const { guest, event } = data;

  await recordOpen(guest);

  // إن كان المرفق فيديو: يُعرض هنا داخل الرابط، والصورة (البطاقة المولَّدة) غلافه
  const src = cardSource(data);
  const videoUrl = resolveInviteVideo({ imageMode: src.imageMode, imageUrl: src.imageUrl });
  const imageUrl = resolveHeaderImage({
    kind: src.kind, id: src.id, imageMode: src.imageMode, imageUrl: src.imageUrl, version: src.version,
  });

  const card = (children: React.ReactNode) => (
    <Shell>
      <InviteCard
        hostName={event.host_name}
        occasion={event.occasion_type}
        eventDate={event.event_date}
        guestName={guest.name}
        imageUrl={imageUrl}
        videoUrl={videoUrl}
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
