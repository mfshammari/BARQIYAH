import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState, EventStatusBadge } from '@/components/ui';
import { can } from '@/lib/permissions';
import { formatCurrency, formatDate, formatHijri, formatNumber } from '@/lib/format';
import { metaConfigured } from '@/lib/env';
import { OCCASION_LABELS, type EventRow, type Guest, type Template, type Transaction } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** أقدمية المهمة بالأيام — البند الأقدم أولى بالانتباه. */
function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

interface EventWithGuests extends EventRow {
  guests: Pick<Guest, 'status' | 'max_seats' | 'confirmed_seats'>[];
}

/** بطاقة مهمة: عدد وأقدمية ورابط مباشر للإجراء. */
function TaskCard({
  title, count, oldestDays, href, tone = 'warn', empty,
}: {
  title: string; count: number; oldestDays?: number; href: string;
  tone?: 'warn' | 'danger' | 'info'; empty: string;
}) {
  const tones = {
    warn: 'border-warn/25 bg-warn-soft text-warn',
    danger: 'border-danger/25 bg-danger-soft text-danger',
    info: 'border-info/20 bg-info-soft text-info',
  } as const;

  if (count === 0) {
    return (
      <div className="card card-pad">
        <div className="text-[13px] font-semibold text-ink">{title}</div>
        <div className="mt-2 text-[12.5px] text-ok">{empty}</div>
      </div>
    );
  }

  return (
    <Link href={href} className={`rounded-xl border p-4 transition-shadow hover:shadow-card ${tones[tone]}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold">{title}</span>
        <span className="font-ui text-2xl font-extrabold num leading-none">{formatNumber(count)}</span>
      </div>
      {oldestDays != null && oldestDays > 0 ? (
        <div className="mt-2 text-[11.5px] opacity-80 num">
          الأقدم منذ {formatNumber(oldestDays)} يوماً
        </div>
      ) : null}
    </Link>
  );
}

export default async function AdminToday() {
  const user = await requireUser();
  const supabase = await createClient();
  const role = user.profile.role;

  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);
  const todayIso = new Date().toISOString().slice(0, 10);

  const [
    { data: unpaidData },
    { data: pendingTemplates },
    { data: upcomingData },
    { data: recentGuests },
    { data: txData },
  ] = await Promise.all([
    supabase.from('events').select('*').in('status', ['unpaid', 'pending'])
      .order('created_at', { ascending: true }).returns<EventRow[]>(),
    supabase.from('templates').select('id, created_at, name').eq('status', 'under_review')
      .order('created_at', { ascending: true }).returns<Pick<Template, 'id' | 'created_at' | 'name'>[]>(),
    supabase.from('events').select('*, guests (status, max_seats, confirmed_seats)')
      .eq('status', 'active')
      .gte('event_date', todayIso)
      .lte('event_date', weekAhead.toISOString().slice(0, 10))
      .order('event_date', { ascending: true }).returns<EventWithGuests[]>(),
    supabase.from('guests').select('status, sent_at, responded_at, attended_at, scans_used')
      .returns<Guest[]>(),
    supabase.from('transactions').select('amount, status, paid_at, created_at').returns<Transaction[]>(),
  ]);

  const unpaid = unpaidData ?? [];
  const templates = pendingTemplates ?? [];
  const upcoming = upcomingData ?? [];
  const guests = recentGuests ?? [];

  // نبض اليوم
  const isToday = (iso: string | null) => Boolean(iso && iso.slice(0, 10) === todayIso);
  const pulse = {
    sent: guests.filter((g) => isToday(g.sent_at)).length,
    failed: guests.filter((g) => g.status === 'failed').length,
    accepted: guests.filter((g) => isToday(g.responded_at) && (g.status === 'accepted' || g.status === 'attended')).length,
    scans: guests.filter((g) => isToday(g.attended_at)).length,
    revenue: (txData ?? [])
      .filter((t) => t.status === 'paid' && isToday(t.paid_at ?? t.created_at))
      .reduce((s, t) => s + Number(t.amount ?? 0), 0),
  };

  /** جاهزية المناسبة: هل الرصيد موزَّع والدعوات أُرسلت؟ */
  const readiness = (e: EventWithGuests) => {
    const g = e.guests ?? [];
    if (g.length === 0) return { label: 'لم تبدأ', cls: 'bg-danger-soft text-danger' };
    const drafts = g.filter((x) => x.status === 'draft').length;
    const sent = g.filter((x) => x.status !== 'draft').length;
    if (sent === 0) return { label: 'لم تُرسل', cls: 'bg-danger-soft text-danger' };
    if (drafts > 0) return { label: 'تحتاج متابعة', cls: 'bg-warn-soft text-warn' };
    return { label: 'جاهزة', cls: 'bg-ok-soft text-ok' };
  };

  return (
    <>
      <PageHeader
        title="اليوم"
        subtitle="ما يحتاج تدخّلك الآن — مرتّباً بالأقدمية لا بالأرقام."
      />

      {!metaConfigured ? (
        <div className="mb-5 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-[13px] text-warn">
          <b>وضع المحاكاة:</b> مفاتيح Meta غير مضبوطة — الرسائل تُسجَّل ولا تُرسل فعلياً.
        </div>
      ) : null}

      {/* بطاقات المهام */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TaskCard
          title="طلبات غير مدفوعة"
          count={unpaid.length}
          oldestDays={unpaid[0] ? ageDays(unpaid[0].created_at) : undefined}
          href="/admin/events?tab=unpaid"
          tone="danger"
          empty="لا طلبات معلّقة ✓"
        />
        {can(role, 'review_templates') ? (
          <TaskCard
            title="قوالب قيد المراجعة"
            count={templates.length}
            oldestDays={templates[0] ? ageDays(templates[0].created_at) : undefined}
            href="/admin/template-requests"
            tone="warn"
            empty="لا قوالب تنتظر المراجعة ✓"
          />
        ) : null}
        <TaskCard
          title="مناسبات خلال ٧ أيام"
          count={upcoming.length}
          href="/admin/events?tab=soon"
          tone="info"
          empty="لا مناسبات قريبة"
        />
      </div>

      {/* نبض اليوم */}
      <h2 className="sec-title mb-3">نبض اليوم</h2>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          ['أُرسل', pulse.sent, 'text-ink'],
          ['فشل', pulse.failed, pulse.failed > 0 ? 'text-danger' : 'text-ink'],
          ['تأكيدات', pulse.accepted, 'text-ok'],
          ['مسح عند الباب', pulse.scans, 'text-brand'],
        ].map(([label, value, cls]) => (
          <div key={String(label)} className="card card-pad">
            <div className={`font-ui text-2xl font-extrabold num leading-none ${cls}`}>
              {formatNumber(Number(value))}
            </div>
            <div className="mt-2 text-[12.5px] text-muted">{String(label)}</div>
          </div>
        ))}
        {can(role, 'finance') ? (
          <div className="card card-pad">
            <div className="font-ui text-2xl font-extrabold num leading-none text-ok">
              {formatCurrency(pulse.revenue)}
            </div>
            <div className="mt-2 text-[12.5px] text-muted">إيراد اليوم</div>
          </div>
        ) : null}
      </div>

      {/* مناسبات قريبة بعمود الجاهزية */}
      <div className="card">
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5">
          <h2 className="sec-title">مناسبات خلال ٧ أيام</h2>
          <Link href="/admin/events" className="text-[12.5px] font-semibold text-brand">كل المناسبات</Link>
        </div>

        {upcoming.length === 0 ? (
          <div className="p-5">
            <EmptyState title="لا مناسبات قريبة" description="ستظهر هنا المناسبات المفعّلة خلال الأسبوع القادم." />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الدعوة باسم</th><th>النوع</th><th>هجري</th><th>ميلادي</th>
                  <th>الجاهزية</th><th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((e) => {
                  const r = readiness(e);
                  return (
                    <tr key={e.id}>
                      <td className="font-semibold">
                        <Link href={`/admin/events/${e.id}`} className="hover:text-brand">
                          {e.internal_name || e.host_name}
                        </Link>
                      </td>
                      <td className="text-[12.5px] text-muted">{OCCASION_LABELS[e.occasion_type]}</td>
                      <td className="num text-[12.5px]">{e.event_date_hijri || formatHijri(e.event_date)}</td>
                      <td className="num text-[12.5px] text-muted">{formatDate(e.event_date)}</td>
                      <td><span className={`badge ${r.cls}`}>{r.label}</span></td>
                      <td><EventStatusBadge status={e.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
