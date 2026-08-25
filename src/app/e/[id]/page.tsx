import Link from 'next/link';
import { requireEventAccess } from '@/lib/auth';
import { fetchEventBalance } from '@/lib/balance';
import {
  PageHeader, Alert, EventStatusBadge, GuestStatusBadge,
  SecLabel, Countdown, TodoCard, StatTriple, MiniStats, PolicyNote,
} from '@/components/ui';
import { formatHijri, formatNumber, formatEventLine } from '@/lib/format';
import { metaConfigured } from '@/lib/env';
import { OCCASION_LABELS, type EventRow, type Guest } from '@/lib/types';
import { RemindButton } from './RemindButton';

export const dynamic = 'force-dynamic';

/** الأيام المتبقية حتى المناسبة — صفر إن كانت اليوم أو مضت. */
function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000));
}

export default async function EventDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event, supabase } = await requireEventAccess(id);
  const e = event as EventRow;
  const balance = await fetchEventBalance(supabase, id);
  const days = daysUntil(e.event_date);

  // المؤهّلون للتذكير: مضى ٥ أيام والحالة sent ولم يُذكَّروا (SPEC §4.1)
  const [{ data: latest }, { data: dueCount }] = await Promise.all([
    supabase
      .from('guests')
      .select('id, name, max_seats, confirmed_seats, status')
      .eq('event_id', id)
      .order('created_at', { ascending: false })
      .limit(6)
      .returns<Guest[]>(),
    supabase.rpc('reminder_due_count', { p_event_id: id }),
  ]);

  const dueForReminder = Number(dueCount ?? 0);

  const recent = latest ?? [];

  return (
    <>
      <PageHeader
        title="لوحة المعلومات"
        subtitle={`${e.internal_name || OCCASION_LABELS[e.occasion_type]}${e.venue ? ` · ${e.venue}` : ''}`}
        action={
          <div className="flex items-center gap-2">
            <EventStatusBadge status={e.status} />
            <Link href={`/e/${id}/guests`} className="btn-primary btn-sm">+ إضافة مدعو</Link>
          </div>
        }
      />

      {e.status === 'pending' ? (
        <div className="mb-5">
          <Alert tone="warn" title="المناسبة بانتظار التفعيل">
            لا يمكن إرسال الدعوات قبل أن تفعّل الإدارة الباقة ويُضاف رصيد المقاعد.
            يمكنك الآن تجهيز قائمة المدعوين والدعاة والقالب.
          </Alert>
        </div>
      ) : null}

      {e.status === 'active' && !metaConfigured ? (
        <div className="mb-5">
          <Alert tone="info" title="وضع المحاكاة">
            مفاتيح Meta غير مضبوطة بعد، فالإرسال يُسجَّل ويُحدّث الحالات والرصيد دون إرسال فعلي عبر واتساب.
          </Alert>
        </div>
      ) : null}

      <Countdown
        days={days}
        dateLine={
          formatEventLine({
            dateGregorian: e.event_date,
            dateHijri: e.event_date_hijri,
            weekday: e.event_weekday,
            time: e.event_time,
          }) || formatHijri(e.event_date)
        }
        note={`${formatNumber(balance.confirmed)} ضيفاً مؤكّداً حتى الآن`}
        action={
          <Link href={`/e/${id}/guests?status=accepted`} className="btn-ghost btn-sm">
            قائمة الحضور
          </Link>
        }
      />

      <SecLabel>ما يحتاج انتباهك</SecLabel>
      <div className="todo-grid">
        <TodoCard
          count={formatNumber(balance.cnt_draft)}
          label="مسوّدات لم تُرسل"
          action={<Link href={`/e/${id}/guests?status=draft`} className="btn-primary btn-sm">أرسلها الآن</Link>}
        />
        <TodoCard
          count={formatNumber(dueForReminder)}
          label="لم يردّوا منذ ٥ أيام"
          action={
            dueForReminder > 0 ? (
              <RemindButton eventId={id} count={dueForReminder} />
            ) : (
              <span className="btn-ghost btn-sm pointer-events-none opacity-60">ذُكّروا ✓</span>
            )
          }
        />
        <TodoCard
          count={formatNumber(balance.available)}
          label="مقعداً متاحاً"
          action={<Link href={`/e/${id}/guests`} className="btn-ghost btn-sm">أضف مدعوين</Link>}
        />
      </div>

      <SecLabel>
        الرصيد بالمقاعد — باقة <span className="num">{formatNumber(balance.seats_quota)}</span> مقعد
      </SecLabel>
      <StatTriple
        items={[
          { tone: 'g', label: 'متاح', value: formatNumber(balance.available) },
          { tone: 'd', label: 'محجوز (بانتظار الرد)', value: formatNumber(balance.held) },
          { tone: 'n', label: 'مؤكّد', value: formatNumber(balance.confirmed) },
        ]}
      />

      <div className="mt-4">
        <MiniStats
          items={[
            { label: 'مُرسل', value: formatNumber(balance.cnt_sent) },
            { label: 'أكّد', value: formatNumber(balance.cnt_accepted) },
            { label: 'اعتذر', value: formatNumber(balance.cnt_declined) },
            { label: 'لم يرد', value: formatNumber(balance.cnt_expired) },
            { label: 'حضر', value: formatNumber(balance.cnt_attended) },
            { label: 'مسوّدة', value: formatNumber(balance.cnt_draft) },
          ]}
        />
      </div>

      <div className="card card-pad mt-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <SecLabel>أحدث المدعوين</SecLabel>
          <Link href={`/e/${id}/guests`} className="text-[12.5px] font-semibold text-brand hover:underline">
            الكل ←
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted">
            لم يُضَف أي مدعو بعد — ابدأ من صفحة المدعوين.
          </p>
        ) : (
          <div className="divide-y divide-line/70">
            {recent.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <span className="text-[14px] text-ink">{g.name}</span>
                  <span className="me-2 text-[11px] text-muted num">
                    {' · '}
                    {formatNumber(g.confirmed_seats || g.max_seats)} مقاعد
                  </span>
                </div>
                <GuestStatusBadge status={g.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <PolicyNote>
          أرقام مدعويك بيانات أمانة — تُستخدم لإيصال دعوتك وحدها، ولا تُصدَّر ولا تُشارك،
          التزاماً بنظام حماية البيانات الشخصية وشروط واتساب.
        </PolicyNote>
      </div>
    </>
  );
}
