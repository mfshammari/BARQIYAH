import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured, appUrl } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { AccountShell } from '@/components/AccountShell';
import {
  PageHeader, Alert, SecLabel, QuotaBar, StatTriple, TodoCard, PolicyNote, Crumb,
} from '@/components/ui';
import { InviteEditor } from './InviteEditor';
import { InviterGuests } from './InviterGuests';
import { InviterRemindButton } from './RemindButton';
import { formatDate, formatEventLine, formatHijri, formatNumber, formatTime } from '@/lib/format';
import { OCCASION_LABELS, type Contact, type EventBalance, type EventRow, type Guest, type Inviter, type Template } from '@/lib/types';

export const dynamic = 'force-dynamic';

const EMPTY: EventBalance = {
  seats_quota: 0, held: 0, confirmed: 0, available: 0, messages_used: 0, total_guests: 0,
  cnt_draft: 0, cnt_sent: 0, cnt_accepted: 0, cnt_declined: 0, cnt_expired: 0, cnt_attended: 0,
};

/** أيام حتى المناسبة — عدّاد تنازلي في بطاقة المناسبة الثابتة. */
function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export default async function InviterWorkspace({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  if (!supabaseConfigured) return <SetupNotice />;

  const { id } = await params;
  const { tab } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: inviter } = await supabase
    .from('inviters').select('*').eq('id', id).maybeSingle<Inviter>();

  // مساحة الداعي لصاحبها وحده
  if (!inviter || inviter.profile_id !== user.id) redirect('/app');

  const [{ data: event }, { data: balanceRows }, { data: guestsData }, { data: templatesData }, { data: contactsData }] =
    await Promise.all([
      supabase.from('events').select('*').eq('id', inviter.event_id).maybeSingle<EventRow>(),
      supabase.rpc('inviter_balance', { p_inviter_id: id }),
      supabase.from('guests').select('*').eq('inviter_id', id)
        .order('created_at', { ascending: false }).returns<Guest[]>(),
      supabase.from('templates').select('*').is('owner_id', null).eq('status', 'approved')
        .order('created_at', { ascending: true }).returns<Template[]>(),
      supabase.from('contacts').select('*').eq('owner_id', user.id)
        .order('name', { ascending: true }).returns<Contact[]>(),
    ]);

  if (!event) redirect('/app');

  // مالك المناسبة له صفٌّ في inviters بحسابه، لكن مكانه لوحة مناسبته
  // لا مساحة الداعي — وإلا ظهر لنفسه «داعياً» بحصة صفر (SPEC §3)
  if (event.owner_id === user.id) redirect(`/e/${event.id}`);

  const balance: EventBalance = {
    ...EMPTY,
    ...((Array.isArray(balanceRows) ? balanceRows[0] : balanceRows) ?? {}),
  };
  const guests = guestsData ?? [];
  const vars = (inviter.invite_vars ?? {}) as { host?: string; occasion?: string };
  const ready = Boolean(inviter.template_id && vars.host && vars.occasion);
  const canSend = event.status === 'active';
  const active = tab === 'guests' ? 'guests' : 'invite';

  const eventLine = formatEventLine({
    dateGregorian: event.event_date,
    dateHijri: event.event_date_hijri,
    weekday: event.event_weekday,
    time: event.event_time,
    venue: event.venue,
  });

  const days = daysUntil(event.event_date);
  const noResponse = guests.filter((g) => g.status === 'sent').length;
  // المؤهّلون للتذكير داخل حصته وحده (SPEC §4.1)
  const { data: dueCount } = await supabase.rpc('reminder_due_count', {
    p_event_id: inviter.event_id,
    p_inviter_id: id,
  });
  const dueForReminder = Number(dueCount ?? 0);
  const drafts = guests.filter((g) => g.status === 'draft').length;

  return (
    <AccountShell
      userName={inviter.name}
      userSub={inviter.side_label ?? 'داعٍ'}
      crumb={<Crumb trail={[{ href: '/app', label: 'مناسباتي' }]} current={event.host_name} />}
    >
      {/* تبويبات مساحة الداعي */}
      <div className="ev-tabs">
        <Link href={`/inviter/${id}?tab=invite`} className={active === 'invite' ? 'tab-on' : 'tab'}>
          دعوتي
        </Link>
        <Link href={`/inviter/${id}?tab=guests`} className={active === 'guests' ? 'tab-on' : 'tab'}>
          مدعوّوي
        </Link>
      </div>

      {/* بطاقة المناسبة الثابتة — للقراءة فقط */}
      <div className="card card-pad mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-ui text-lg font-bold">{event.host_name}</div>
            <div className="mt-0.5 text-[12.5px] text-muted">
              {OCCASION_LABELS[event.occasion_type]}
              {event.celebrant_primary ? ` · ${event.celebrant_primary}` : ''}
              {event.celebrant_secondary ? ` و${event.celebrant_secondary}` : ''}
            </div>
          </div>
          {days >= 0 ? (
            <div className="text-center">
              <div className="font-ui text-2xl font-extrabold text-brand num leading-none">
                {formatNumber(days)}
              </div>
              <div className="text-[11px] text-muted">{days === 0 ? 'اليوم' : 'يوماً متبقياً'}</div>
            </div>
          ) : null}
        </div>

        <dl className="mt-4 grid gap-2 border-t border-line pt-3 text-[12.5px] sm:grid-cols-2">
          <div className="flex gap-2"><dt className="text-muted">هجري</dt>
            <dd className="num">{event.event_date_hijri || formatHijri(event.event_date)}</dd></div>
          <div className="flex gap-2"><dt className="text-muted">ميلادي</dt>
            <dd className="num">{formatDate(event.event_date)}</dd></div>
          <div className="flex gap-2"><dt className="text-muted">الوقت</dt>
            <dd className="num">{formatTime(event.event_time) || '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-muted">المكان</dt>
            <dd>{event.venue || '—'}</dd></div>
        </dl>
        <p className="hint mt-2">هذه البيانات من صاحب المناسبة — للقراءة فقط.</p>
      </div>

      {/* حصته بثلاث حالات — الأرقام الخاصة به وحده */}
      <SecLabel>حصتي من المقاعد</SecLabel>
      <QuotaBar
        total={formatNumber(balance.seats_quota)}
        totalLabel="مقعداً منحك إياها صاحب المناسبة"
        segments={[
          {
            label: `مؤكّد ${formatNumber(balance.confirmed)}`,
            value: balance.confirmed,
            pct: balance.seats_quota ? (balance.confirmed / balance.seats_quota) * 100 : 0,
            color: 'rgb(var(--ok))',
          },
          {
            label: `محجوز ${formatNumber(balance.held)}`,
            value: balance.held,
            pct: balance.seats_quota ? (balance.held / balance.seats_quota) * 100 : 0,
            color: 'rgb(var(--warn))',
          },
          {
            label: `متاح لك ${formatNumber(Math.max(0, balance.available))}`,
            value: balance.available,
            pct: balance.seats_quota ? (Math.max(0, balance.available) / balance.seats_quota) * 100 : 0,
            color: 'rgb(var(--line))',
          },
        ]}
      />
      <StatTriple
        items={[
          { tone: 'g', label: 'متاح لك', value: formatNumber(balance.available) },
          { tone: 'd', label: 'محجوز بانتظار الرد', value: formatNumber(balance.held) },
          { tone: 'n', label: 'مؤكّد', value: formatNumber(balance.confirmed) },
        ]}
      />
      <p className="mt-3 text-[12.5px] text-muted">
        لا ترى إجمالي المناسبة ولا مقاعد بقية الدعاة ولا مدعوّيهم.
      </p>

      {balance.available <= 0 ? (
        <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger">
          نفدت حصتك — راجع صاحب المناسبة لزيادتها. المالك وحده يوزّع الحصص.
        </p>
      ) : null}

      {/* ما يحتاج انتباهك */}
      <div className="mt-5">
        <SecLabel>ما يحتاج انتباهك</SecLabel>
        <div className="todo-grid">
          <TodoCard
            count={formatNumber(drafts)}
            label="مسوّدات لم تُرسل"
            action={
              <Link href={`/inviter/${id}?tab=guests`} className="btn-primary btn-sm">
                أرسلها الآن
              </Link>
            }
          />
          <TodoCard
            count={formatNumber(dueForReminder)}
            label="لم يردّوا منذ ٥ أيام"
            action={
              dueForReminder > 0 ? (
                <InviterRemindButton inviterId={id} count={dueForReminder} />
              ) : (
                <span className="btn-ghost btn-sm pointer-events-none opacity-60">ذُكّروا ✓</span>
              )
            }
          />
          <TodoCard
            count={formatNumber(Math.max(0, balance.available))}
            label="مقعداً متاحاً لك"
            action={
              <Link href={`/inviter/${id}?tab=guests`} className="btn-ghost btn-sm">
                أضف مدعوين
              </Link>
            }
          />
        </div>
      </div>

      {!ready ? (
        <div className="mb-5">
          <Alert tone="warn" title="لم تكتب نصّ دعوتك بعد">
            اختر قالبك واكتب كلماتك من تبويب «دعوتي» قبل أن ترسل لأي مدعو.
          </Alert>
        </div>
      ) : null}

      <PageHeader
        title={active === 'invite' ? 'دعوتي' : 'مدعوّوي'}
        subtitle={
          active === 'invite'
            ? 'قالبك ونصّك وصورتك — تملكها وحدك، ولا يعدّلها صاحب المناسبة.'
            : 'مدعوّوك وحدهم — لا ترى مدعوّي بقية الدعاة ولا يرون مدعوّيك.'
        }
      />

      {active === 'invite' ? (
        <InviteEditor
          inviterId={id}
          templates={templatesData ?? []}
          eventLine={eventLine}
          initial={{
            host: vars.host ?? '',
            occasion: vars.occasion ?? '',
            templateId: inviter.template_id,
            imageUrl: inviter.image_url,
          }}
        />
      ) : (
        <InviterGuests
          inviterId={id}
          guests={guests}
          contacts={contactsData ?? []}
          canSend={canSend}
          ready={ready}
          appUrl={appUrl()}
        />
      )}

      <div className="mt-5">
        <PolicyNote>
          لو احتجت مقاعد إضافية، اطلبها من <b className="text-brand">{event.host_name}</b> —
          الحصص تُوزَّع من صاحب المناسبة. وأرقام مدعويك بيانات أمانة لا تُستخدم لغير إيصال دعوتك.
        </PolicyNote>
      </div>
    </AccountShell>
  );
}
