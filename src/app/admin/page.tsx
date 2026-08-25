import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { EmptyState, SecLabel, NoticeBar, TaskCardBox } from '@/components/ui';
import { can } from '@/lib/permissions';
import { formatCurrency, formatHijri, formatNumber } from '@/lib/format';
import { computeBalance } from '@/lib/balance';
import { metaConfigured } from '@/lib/env';
import type { EventRow, Guest, Template, Transaction } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** الموعد بصيغة قريبة: اليوم · غداً · بعد ٣ أيام (كما في النموذج). */
function relativeDay(dateStr: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  const d = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (d < 0) return 'مضت';
  if (d === 0) return 'اليوم';
  if (d === 1) return 'غداً';
  if (d === 2) return 'بعد يومين';
  return `بعد ${formatNumber(d)} أيام`;
}

/** أقدمية المهمة بالأيام — البند الأقدم أولى بالانتباه. */
function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

interface EventWithGuests extends EventRow {
  guests: Pick<Guest, 'status' | 'max_seats' | 'confirmed_seats'>[];
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

  const today = new Intl.DateTimeFormat('ar-SA', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date());

  return (
    <>
      <div className="acct-head">
        <div>
          <h1 className="acct-h">اليوم</h1>
          <p className="acct-sub">
            {today} · المدفوع يُفعَّل تلقائياً — هذه التي تحتاج تدخّلك.
          </p>
        </div>
        <Link href="/admin/events" className="btn-ghost btn-sm">كل المناسبات</Link>
      </div>

      {!metaConfigured ? (
        <NoticeBar tone="warn" title="وضع المحاكاة">
          مفاتيح Meta غير مضبوطة — الرسائل تُسجَّل وتُحدِّث الحالات والرصيد دون إرسال فعلي.
        </NoticeBar>
      ) : null}

      <SecLabel>مهام تنتظرك</SecLabel>
      <div className="task-grid mb-6">
        <TaskCardBox
          count={formatNumber(unpaid.length)}
          title="طلبات غير مدفوعة"
          meta={
            unpaid[0]
              ? `أقدمها منذ ${formatNumber(ageDays(unpaid[0].created_at))} يوماً`
              : 'لا شيء ينتظر ✓'
          }
          action={
            unpaid.length > 0 ? (
              <Link href="/admin/events?tab=unpaid" className="btn-primary btn-sm">راجع</Link>
            ) : null
          }
        />
        {can(role, 'review_templates') ? (
          <TaskCardBox
            count={formatNumber(templates.length)}
            title="قوالب قيد المراجعة"
            meta={
              templates[0]
                ? `أقدمها منذ ${formatNumber(ageDays(templates[0].created_at))} يوماً`
                : 'لا قوالب تنتظر ✓'
            }
            action={
              templates.length > 0 ? (
                <Link href="/admin/template-requests" className="btn-primary btn-sm">راجع</Link>
              ) : null
            }
          />
        ) : null}
        <TaskCardBox
          count={formatNumber(upcoming.length)}
          title="مناسبات خلال ٧ أيام"
          meta={upcoming[0] ? upcoming[0].internal_name || upcoming[0].host_name : 'لا مناسبات قريبة'}
          action={
            upcoming.length > 0 ? (
              <Link href="/admin/events?tab=soon" className="btn-ghost btn-sm">افتح</Link>
            ) : null
          }
        />
      </div>

      {/* مناسبات قريبة + نبض المنصة */}
      <div className="two-col">
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
          <table className="tbl-tight">
            <thead>
              <tr>
                <th>المناسبة</th><th>التاريخ</th><th>المقاعد</th><th>الجاهزية</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((e) => {
                const r = readiness(e);
                const b = computeBalance(e.guests as Guest[], e.seats_quota);
                return (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/admin/events/${e.id}`} className="font-semibold hover:text-brand">
                        {e.internal_name || e.host_name}
                      </Link>
                      <span className="block text-[11.5px] text-muted num">
                        {e.event_date_hijri || formatHijri(e.event_date)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-[12.5px] text-muted num">
                      {relativeDay(e.event_date)}
                    </td>
                    <td className="whitespace-nowrap text-[12.5px] num">
                      {formatNumber(b.confirmed + b.held)}/{formatNumber(e.seats_quota)}
                    </td>
                    <td><span className={`badge ${r.cls}`}>{r.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card card-pad">
        <SecLabel>نبض المنصة · اليوم</SecLabel>
        <dl className="divide-y divide-line/70">
          {([
            ['رسائل أُرسلت', formatNumber(pulse.sent), 'text-ink'],
            ['فشل الإرسال', formatNumber(pulse.failed), pulse.failed > 0 ? 'text-danger' : 'text-ink'],
            ['تأكيدات حضور', formatNumber(pulse.accepted), 'text-ok'],
            ['عمليات مسح', formatNumber(pulse.scans), 'text-brand'],
            ...(can(role, 'finance')
              ? [['إيراد اليوم', formatCurrency(pulse.revenue), 'text-ok'] as const]
              : []),
          ] as const).map(([label, value, cls]) => (
            <div key={label} className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-[13px] text-muted">{label}</dt>
              <dd className={`font-ui text-[15px] font-bold num ${cls}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      </div>
    </>
  );
}
