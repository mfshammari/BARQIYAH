import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { AppShell } from '@/components/AppShell';
import { PageHeader, EmptyState, EventStatusBadge } from '@/components/ui';
import { formatDate, formatNumber } from '@/lib/format';
import { OCCASION_LABELS, type EventRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  if (!supabaseConfigured) return <SetupNotice />;
  const user = await requireRole(['owner', 'admin']);
  const supabase = await createClient();

  const { data } = await supabase
    .from('events').select('*').eq('owner_id', user.id)
    .order('created_at', { ascending: false }).returns<EventRow[]>();
  const events = data ?? [];

  return (
    <AppShell
      nav={[{ href: '/events', label: 'مناسباتي' }, { href: '/events/new', label: 'مناسبة جديدة' }]}
      active="/events"
      userName={user.profile.full_name ?? user.email ?? 'صاحب المناسبة'}
      userSub="صاحب مناسبة"
    >
      <PageHeader
        title="مناسباتي"
        subtitle="كل مناسبة لها باقتها ورصيدها المستقل."
        action={<Link href="/events/new" className="btn-primary">+ مناسبة جديدة</Link>}
      />

      {events.length === 0 ? (
        <EmptyState
          title="لا توجد مناسبات بعد"
          description="ابدأ بإنشاء مناسبتك الأولى، ثم أضف المدعوين وأرسل الدعوات عبر واتساب."
          action={<Link href="/events/new" className="btn-primary">إنشاء مناسبة</Link>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <Link key={e.id} href={`/e/${e.id}`} className="card card-pad hover:shadow-pop transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="font-display font-bold text-ink">{e.host_name}</div>
                <EventStatusBadge status={e.status} />
              </div>
              <div className="text-[12.5px] text-muted mt-1.5">{OCCASION_LABELS[e.occasion_type]}</div>
              <div className="text-[12.5px] text-muted num mt-0.5">{formatDate(e.event_date)}</div>
              <div className="mt-3 pt-3 border-t border-line text-[12.5px] text-muted">
                الرصيد: <b className="text-ink num">{formatNumber(e.seats_quota)}</b> مقعد
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
