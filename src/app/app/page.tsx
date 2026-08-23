import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { EmptyState, EventStatusBadge } from '@/components/ui';
import { formatHijri, formatNumber } from '@/lib/format';
import { computeBalance } from '@/lib/balance';
import { OCCASION_LABELS, type EventRow, type Guest, type Inviter } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface EventWithGuests extends EventRow {
  guests: Pick<Guest, 'status' | 'max_seats' | 'confirmed_seats'>[];
}

/** بطاقة مناسبة يملكها العميل — أفقية بشريط جانبي يدل على حالتها. */
function OwnedEventCard({ event }: { event: EventWithGuests }) {
  const balance = computeBalance(event.guests as Guest[], event.seats_quota);
  const used = balance.confirmed + balance.held;
  const pct = event.seats_quota ? Math.min(100, Math.round((used / event.seats_quota) * 100)) : 0;
  const isDraft = event.status === 'unpaid' || event.status === 'pending';
  const isPast = event.status === 'closed';
  const side = isPast ? 'evc-side-done' : isDraft ? 'evc-side-warn' : 'evc-side-live';

  return (
    <Link href={`/e/${event.id}`} className={`evc ${isPast ? 'opacity-[.86]' : ''}`}>
      <div className={side} />
      <div className="evc-main">
        <div className="evc-top">
          <EventStatusBadge status={event.status} />
          <span className="evc-when num">{formatHijri(event.event_date)}</span>
        </div>
        <h4>{event.internal_name || event.host_name}</h4>
        <div className="evc-meta">
          {[event.venue, OCCASION_LABELS[event.occasion_type]].filter(Boolean).join(' · ')}
        </div>

        {isDraft ? (
          <div className="evc-draft">أكمل التجهيز لتتمكن من الإرسال</div>
        ) : isPast ? (
          <div className="evc-nums num">
            <span>
              {formatNumber(balance.cnt_attended)} حضروا من {formatNumber(event.seats_quota)}
            </span>
            <span className="font-semibold text-brand">التقرير</span>
          </div>
        ) : (
          <>
            <div className="evc-bar">
              <i
                className="bg-ok"
                style={{ width: `${event.seats_quota ? (balance.confirmed / event.seats_quota) * 100 : 0}%` }}
              />
              <i
                className="bg-warn"
                style={{ width: `${event.seats_quota ? (balance.held / event.seats_quota) * 100 : 0}%` }}
              />
            </div>
            <div className="evc-nums num">
              <span>{formatNumber(balance.confirmed)} مؤكّد</span>
              <span>{formatNumber(balance.held)} محجوز</span>
              <span>{formatNumber(balance.available)} متاح</span>
              <span className="text-muted/70">استُهلك {formatNumber(pct)}٪</span>
            </div>
          </>
        )}
      </div>
      <div className="evc-go">{isDraft ? 'أكمل ←' : 'فتح ←'}</div>
    </Link>
  );
}

interface InviterRow extends Inviter {
  events: Pick<EventRow, 'id' | 'host_name' | 'occasion_type' | 'event_date' | 'venue' | 'status'> | null;
}

/** بطاقة مناسبة العميل داعٍ فيها — حصته وحدها لا إجمالي المناسبة. */
function InvitedEventCard({ row, mySeats }: { row: InviterRow; mySeats: { held: number; confirmed: number } }) {
  const e = row.events;
  if (!e) return null;
  const available = row.seats_quota - mySeats.held - mySeats.confirmed;
  const pctConfirmed = row.seats_quota ? (mySeats.confirmed / row.seats_quota) * 100 : 0;
  const pctHeld = row.seats_quota ? (mySeats.held / row.seats_quota) * 100 : 0;

  return (
    <Link href={`/inviter/${row.id}`} className="evc bg-paper">
      <div className="evc-side-gold" />
      <div className="evc-main">
        <div className="evc-top">
          <span className="badge bg-warn-soft text-warn">داعٍ</span>
          <span className="evc-when num">{formatHijri(e.event_date)}</span>
        </div>
        <h4>{e.host_name}</h4>
        <div className="evc-meta num">
          {[
            e.venue,
            row.side_label,
            `حصتك ${formatNumber(row.seats_quota)} مقعداً`,
          ].filter(Boolean).join(' · ')}
        </div>
        <div className="evc-bar">
          <i className="bg-ok" style={{ width: `${pctConfirmed}%` }} />
          <i className="bg-warn" style={{ width: `${pctHeld}%` }} />
        </div>
        <div className="evc-nums num">
          <span>{formatNumber(mySeats.confirmed)} مؤكّد</span>
          <span>{formatNumber(mySeats.held)} محجوز</span>
          <span>{formatNumber(available)} متاح لك</span>
        </div>
      </div>
      <div className="evc-go">فتح ←</div>
    </Link>
  );
}

export default async function MyEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  // الاستعلامات الاختيارية تُغلَّف: مخطط لم يُرحَّل بعد يجب ألا يُسقط الصفحة
  const safe = async <T,>(run: () => PromiseLike<{ data: T | null }>): Promise<T | null> => {
    try {
      const { data } = await run();
      return data;
    } catch {
      return null;
    }
  };

  const [ownedData, invitedData, contactCount] = await Promise.all([
    safe<EventWithGuests[]>(() =>
      supabase
        .from('events')
        .select('*, guests (status, max_seats, confirmed_seats)')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .returns<EventWithGuests[]>()),
    safe<InviterRow[]>(() =>
      supabase
        .from('inviters')
        .select('*, events:event_id (id, host_name, occasion_type, event_date, venue, status)')
        .eq('profile_id', user.id)
        .returns<InviterRow[]>()),
    safe<{ id: string }[]>(() => supabase.from('contacts').select('id')),
  ]);

  const owned = ownedData ?? [];
  const invited = (invitedData ?? []).filter((r) => r.events);

  // مقاعد الداعي محسوبة داخل حصته فقط (SPEC §8.4)
  const inviterIds = invited.map((r) => r.id);
  const myGuests = inviterIds.length
    ? await safe<Guest[]>(() =>
        supabase.from('guests').select('inviter_id, status, max_seats, confirmed_seats')
          .in('inviter_id', inviterIds).returns<Guest[]>())
    : [];

  const seatsByInviter = new Map<string, { held: number; confirmed: number }>();
  for (const g of myGuests ?? []) {
    if (!g.inviter_id) continue;
    const cur = seatsByInviter.get(g.inviter_id) ?? { held: 0, confirmed: 0 };
    if (g.status === 'sent') cur.held += g.max_seats;
    if (g.status === 'accepted' || g.status === 'attended') cur.confirmed += g.confirmed_seats ?? 0;
    seatsByInviter.set(g.inviter_id, cur);
  }

  const totalConfirmed = owned.reduce(
    (s, e) => s + computeBalance(e.guests as Guest[], e.seats_quota).confirmed, 0);

  const rate = (() => {
    const sent = owned.reduce((n, e) => n + (e.guests ?? []).filter((g) => g.status !== 'draft').length, 0);
    const yes = owned.reduce((n, e) => n + (e.guests ?? [])
      .filter((g) => g.status === 'accepted' || g.status === 'attended').length, 0);
    return sent ? Math.round((yes / sent) * 100) : 0;
  })();

  // تبويبات التصفية — تُطبَّق على المناسبات المملوكة وحدها
  const isPast = (e: EventWithGuests) =>
    e.status === 'closed' || e.event_date < new Date().toISOString().slice(0, 10);
  const buckets = {
    all: owned,
    active: owned.filter((e) => e.status === 'active' && !isPast(e)),
    soon: owned.filter((e) => (e.status === 'unpaid' || e.status === 'pending') && !isPast(e)),
    past: owned.filter(isPast),
  } as const;
  const tabKey = (tab === 'active' || tab === 'soon' || tab === 'past') ? tab : 'all';
  const shown = buckets[tabKey];

  const TABS: { key: keyof typeof buckets; label: string }[] = [
    { key: 'all', label: 'الكل' },
    { key: 'active', label: 'نشطة' },
    { key: 'soon', label: 'قادمة' },
    { key: 'past', label: 'سابقة' },
  ];

  return (
    <>
      <div className="acct-head">
        <div>
          <h1 className="acct-h">مناسباتي</h1>
          <p className="acct-sub">
            كل مناسباتك في مكان واحد — نشطة وسابقة ومسوّدات، وتلك التي دُعيت لتكون داعياً فيها.
          </p>
        </div>
        <Link href="/app/events/new" className="btn-primary btn-sm">＋ مناسبة جديدة</Link>
      </div>

      <div className="acct-stats">
        <div className="as">
          <b className="num">{formatNumber(owned.length + invited.length)}</b>
          <span>مناسبات</span>
        </div>
        <div className="as">
          <b className="num">{formatNumber(contactCount?.length ?? 0)}</b>
          <span>في دفتر العناوين</span>
        </div>
        <div className="as">
          <b className="num">{formatNumber(rate)}٪</b>
          <span>متوسط التأكيد</span>
        </div>
      </div>

      <div className="tabs-row mt-5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'all' ? '/app' : `/app?tab=${t.key}`}
            className={tabKey === t.key ? 'tab-on' : 'tab'}
          >
            {t.label}
            {t.key !== 'all' && buckets[t.key].length > 0 ? (
              <span className="num"> {formatNumber(buckets[t.key].length)}</span>
            ) : null}
          </Link>
        ))}
      </div>

      {owned.length === 0 ? (
        <EmptyState
          title="لا توجد مناسبات بعد"
          description="ابدأ بإنشاء مناسبتك الأولى، ثم أضف المدعوين وأرسل الدعوات عبر واتساب."
          action={<Link href="/app/events/new" className="btn-primary">إنشاء مناسبة</Link>}
        />
      ) : shown.length === 0 ? (
        <EmptyState title="لا مناسبات في هذا التبويب" />
      ) : (
        <div className="grid gap-3">
          {shown.map((e) => <OwnedEventCard key={e.id} event={e} />)}
        </div>
      )}

      {invited.length > 0 ? (
        <>
          <div className="sec-split">
            <h2 className="ss-h">مناسبات أنا داعٍ فيها</h2>
            <p className="ss-s">دعاكَ أصحابها للمشاركة في الدعوة — لكل واحدة حصتك ونصّك.</p>
          </div>
          <div className="grid gap-3">
            {invited.map((r) => (
              <InvitedEventCard
                key={r.id}
                row={r}
                mySeats={seatsByInviter.get(r.id) ?? { held: 0, confirmed: 0 }}
              />
            ))}
          </div>
        </>
      ) : null}

      <div className="acct-links">
        <Link href="/app/contacts" className="acct-link">
          <b>دفتر العناوين</b>
          <span className="num">
            {formatNumber(contactCount?.length ?? 0)} جهة محفوظة — تستخدمها في كل مناسباتك،
            سواءً كنت مالكاً أو داعياً.
          </span>
        </Link>
        <Link href="/app/billing" className="acct-link">
          <b>المدفوعات والفواتير</b>
          <span>باقات مناسباتك وحالة كل عملية دفع.</span>
        </Link>
        <Link href="/app/settings" className="acct-link">
          <b>حسابي</b>
          <span>اسمك وجوالك — وما يظهر منها للمدعوين.</span>
        </Link>
      </div>

      <p className="bk-note">
        جهاتك وأرقام مدعويك خاصة بك — لا تُستخدم لأي غرض غير إرسال دعواتك.
      </p>
    </>
  );
}
