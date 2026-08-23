import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState, EventStatusBadge, StatCard } from '@/components/ui';
import { formatDate, formatHijri, formatNumber } from '@/lib/format';
import { computeBalance } from '@/lib/balance';
import { OCCASION_LABELS, type EventRow, type Guest, type Inviter } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface EventWithGuests extends EventRow {
  guests: Pick<Guest, 'status' | 'max_seats' | 'confirmed_seats'>[];
}

/** بطاقة مناسبة يملكها العميل — بشريط تقدّم المقاعد وأرقامها الثلاثة. */
function OwnedEventCard({ event }: { event: EventWithGuests }) {
  const balance = computeBalance(event.guests as Guest[], event.seats_quota);
  const used = balance.confirmed + balance.held;
  const pct = event.seats_quota ? Math.min(100, Math.round((used / event.seats_quota) * 100)) : 0;

  return (
    <Link href={`/e/${event.id}`} className="card card-pad transition-shadow hover:shadow-pop">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-ui font-bold text-ink">
            {event.internal_name || event.host_name}
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            {OCCASION_LABELS[event.occasion_type]}
          </div>
        </div>
        <EventStatusBadge status={event.status} />
      </div>

      <div className="mt-3 space-y-0.5 text-[12.5px] text-muted">
        <div className="num">{formatHijri(event.event_date)}</div>
        <div className="num">{formatDate(event.event_date)}</div>
        {event.venue ? <div>{event.venue}</div> : null}
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full border border-line bg-panel">
        <div className="flex h-full">
          <div className="h-full bg-ok" style={{ width: `${event.seats_quota ? (balance.confirmed / event.seats_quota) * 100 : 0}%` }} />
          <div className="h-full bg-warn" style={{ width: `${event.seats_quota ? (balance.held / event.seats_quota) * 100 : 0}%` }} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="font-ui text-[15px] font-bold text-ok num">{formatNumber(balance.confirmed)}</div>
          <div className="text-[11px] text-muted">مؤكّد</div>
        </div>
        <div>
          <div className="font-ui text-[15px] font-bold text-warn num">{formatNumber(balance.held)}</div>
          <div className="text-[11px] text-muted">محجوز</div>
        </div>
        <div>
          <div className={`font-ui text-[15px] font-bold num ${balance.available > 0 ? 'text-brand' : 'text-danger'}`}>
            {formatNumber(balance.available)}
          </div>
          <div className="text-[11px] text-muted">متاح</div>
        </div>
      </div>

      <div className="mt-3 border-t border-line pt-2 text-[11.5px] text-muted num">
        استُهلك {pct}٪ من {formatNumber(event.seats_quota)} مقعد
      </div>
    </Link>
  );
}

interface InviterRow extends Inviter {
  events: Pick<EventRow, 'id' | 'host_name' | 'internal_name' | 'occasion_type' | 'event_date' | 'venue' | 'status'> | null;
}

/** بطاقة مناسبة العميل داعٍ فيها — حصته وحدها لا إجمالي المناسبة. */
function InvitedEventCard({ row, mySeats }: { row: InviterRow; mySeats: { held: number; confirmed: number } }) {
  const e = row.events;
  if (!e) return null;
  const available = row.seats_quota - mySeats.held - mySeats.confirmed;

  return (
    <Link href={`/inviter/${row.id}`} className="card card-pad transition-shadow hover:shadow-pop">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-ui font-bold text-ink">{e.host_name}</div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            {OCCASION_LABELS[e.occasion_type]}
            {row.side_label ? ` · ${row.side_label}` : ''}
          </div>
        </div>
        <span className="badge bg-gold-soft/50 text-warn">داعٍ</span>
      </div>

      <div className="mt-3 space-y-0.5 text-[12.5px] text-muted">
        <div className="num">{formatHijri(e.event_date)}</div>
        {e.venue ? <div>{e.venue}</div> : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
        <div>
          <div className="font-ui text-[15px] font-bold text-ok num">{formatNumber(mySeats.confirmed)}</div>
          <div className="text-[11px] text-muted">مؤكّد</div>
        </div>
        <div>
          <div className="font-ui text-[15px] font-bold text-warn num">{formatNumber(mySeats.held)}</div>
          <div className="text-[11px] text-muted">محجوز</div>
        </div>
        <div>
          <div className={`font-ui text-[15px] font-bold num ${available > 0 ? 'text-brand' : 'text-danger'}`}>
            {formatNumber(available)}
          </div>
          <div className="text-[11px] text-muted">متاح لك</div>
        </div>
      </div>

      <div className="mt-2 text-[11.5px] text-muted num">حصتك {formatNumber(row.seats_quota)} مقعداً</div>
    </Link>
  );
}

export default async function MyEventsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: ownedData }, { data: invitedData }, { data: contactCount }] = await Promise.all([
    supabase
      .from('events')
      .select('*, guests (status, max_seats, confirmed_seats)')
      .eq('owner_id', user.id)
      .order('event_date', { ascending: true })
      .returns<EventWithGuests[]>(),
    supabase
      .from('inviters')
      .select('*, events:event_id (id, host_name, internal_name, occasion_type, event_date, venue, status)')
      .eq('profile_id', user.id)
      .returns<InviterRow[]>(),
    supabase.from('contacts').select('id', { count: 'exact', head: true }),
  ]);

  const owned = ownedData ?? [];
  const invited = (invitedData ?? []).filter((r) => r.events);

  // مقاعد الداعي محسوبة داخل حصته فقط (SPEC §8.4)
  const inviterIds = invited.map((r) => r.id);
  const { data: myGuests } = inviterIds.length
    ? await supabase.from('guests').select('inviter_id, status, max_seats, confirmed_seats')
        .in('inviter_id', inviterIds).returns<Guest[]>()
    : { data: [] as Guest[] };

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

  return (
    <>
      <PageHeader
        title="مناسباتي"
        subtitle="حسابك الدائم يجمع كل مناسباتك — تلك التي تملكها وتلك التي دُعيت لتكون داعياً فيها."
        action={<Link href="/app/events/new" className="btn-primary">+ مناسبة جديدة</Link>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="مناسباتي" value={formatNumber(owned.length)} />
        <StatCard label="داعٍ فيها" value={formatNumber(invited.length)} tone="warn" />
        <StatCard label="إجمالي التأكيدات" value={formatNumber(totalConfirmed)} tone="ok" />
        <StatCard label="دفتر العناوين" value={formatNumber(contactCount?.length ?? 0)} sub="جهة محفوظة" />
      </div>

      <h2 className="sec-title mb-3">مناسبات أملكها</h2>
      {owned.length === 0 ? (
        <EmptyState
          title="لا توجد مناسبات بعد"
          description="ابدأ بإنشاء مناسبتك الأولى، ثم أضف المدعوين وأرسل الدعوات عبر واتساب."
          action={<Link href="/app/events/new" className="btn-primary">إنشاء مناسبة</Link>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {owned.map((e) => <OwnedEventCard key={e.id} event={e} />)}
        </div>
      )}

      {invited.length > 0 ? (
        <>
          <h2 className="sec-title mb-3 mt-9">مناسبات أنا داعٍ فيها</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
    </>
  );
}
