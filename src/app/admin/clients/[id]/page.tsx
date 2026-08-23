import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState, EventStatusBadge, StatCard, Alert } from '@/components/ui';
import { can } from '@/lib/permissions';
import { computeBalance } from '@/lib/balance';
import { formatCurrency, formatDate, formatHijri, formatNumber } from '@/lib/format';
import { OCCASION_LABELS, type EventRow, type Guest, type Profile, type Transaction } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface EventWithGuests extends EventRow {
  guests: Pick<Guest, 'status' | 'max_seats' | 'confirmed_seats'>[];
}

/**
 * «الدخول كالعميل» — عرض ما يراه العميل، للقراءة فقط.
 *
 * لا نُصدر جلسة باسمه: ذلك يفتح باباً لتصرّف باسمه دون أثر. بدلاً منه
 * عرض مقروء بصلاحية الأدمن، ويُسجَّل الاطلاع إلزامياً (SPEC §7).
 */
export default async function ImpersonateView({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user.profile.role, 'impersonate')) redirect('/admin/clients');

  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from('profiles').select('*').eq('id', id).maybeSingle<Profile>();
  if (!client) redirect('/admin/clients');

  // تسجيل الاطلاع إلزامي — قبل عرض أي بيان
  await supabase.from('activity_logs').insert({
    actor_id: user.id,
    action: 'client.viewed_as',
    target_type: 'profile',
    target_id: id,
    metadata: { client_name: client.full_name },
  });

  const [{ data: eventsData }, { data: txData }] = await Promise.all([
    supabase.from('events').select('*, guests (status, max_seats, confirmed_seats)')
      .eq('owner_id', id).order('event_date', { ascending: false }).returns<EventWithGuests[]>(),
    supabase.from('transactions').select('*').returns<Transaction[]>(),
  ]);

  const events = eventsData ?? [];
  const eventIds = new Set(events.map((e) => e.id));
  const spend = (txData ?? [])
    .filter((t) => t.status === 'paid' && eventIds.has(t.event_id))
    .reduce((s, t) => s + Number(t.amount ?? 0), 0);

  return (
    <>
      <nav className="mb-3 flex items-center gap-1.5 text-[12.5px] text-muted">
        <Link href="/admin" className="hover:text-brand">اليوم</Link>
        <span>/</span>
        <Link href="/admin/clients" className="hover:text-brand">العملاء</Link>
        <span>/</span>
        <span className="text-ink">{client.full_name ?? 'عميل'}</span>
      </nav>

      <div className="mb-5">
        <Alert tone="warn" title="عرض كالعميل — للقراءة فقط">
          تُشاهد ما يراه العميل لأغراض الدعم. لا يمكنك التصرّف باسمه، و<b>سُجّل اطلاعك</b> في
          سجل النشاط باسمك ووقته.
        </Alert>
      </div>

      <PageHeader
        title={client.full_name ?? 'عميل'}
        subtitle={client.phone ?? '—'}
        action={
          client.sending_paused
            ? <span className="badge bg-danger-soft text-danger">الإرسال موقوف</span>
            : <span className="badge bg-ok-soft text-ok">نشط</span>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="مناسباته" value={formatNumber(events.length)} />
        <StatCard label="إنفاقه" value={formatCurrency(spend)} tone="ok" />
        <StatCard label="عضو منذ" value={formatDate(client.created_at)} />
      </div>

      <h2 className="sec-title mb-3">مناسباته كما يراها</h2>
      {events.length === 0 ? (
        <EmptyState title="لا مناسبات لهذا العميل" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => {
            const b = computeBalance(e.guests as Guest[], e.seats_quota);
            return (
              <Link key={e.id} href={`/admin/events/${e.id}`} className="card card-pad hover:shadow-pop">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-ui font-bold">{e.internal_name || e.host_name}</span>
                  <EventStatusBadge status={e.status} />
                </div>
                <div className="mt-1 text-[12.5px] text-muted">{OCCASION_LABELS[e.occasion_type]}</div>
                <div className="mt-0.5 text-[12px] text-muted num">{formatHijri(e.event_date)}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                  <div>
                    <div className="font-ui text-[15px] font-bold text-ok num">{formatNumber(b.confirmed)}</div>
                    <div className="text-[11px] text-muted">مؤكّد</div>
                  </div>
                  <div>
                    <div className="font-ui text-[15px] font-bold text-warn num">{formatNumber(b.held)}</div>
                    <div className="text-[11px] text-muted">محجوز</div>
                  </div>
                  <div>
                    <div className="font-ui text-[15px] font-bold text-brand num">{formatNumber(b.available)}</div>
                    <div className="text-[11px] text-muted">متاح</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[11.5px] text-muted">
        دفتر عناوين العميل لا يُعرض هنا — خاص بمالكه ولا يراه فريق المنصة.
      </p>
    </>
  );
}
