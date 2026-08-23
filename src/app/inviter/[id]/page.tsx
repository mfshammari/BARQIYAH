import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured, appUrl } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { AppShell } from '@/components/AppShell';
import { PageHeader, Alert } from '@/components/ui';
import { InviteEditor } from './InviteEditor';
import { InviterGuests } from './InviterGuests';
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
  const drafts = guests.filter((g) => g.status === 'draft').length;

  return (
    <AppShell
      nav={[
        { href: `/inviter/${id}?tab=invite`, label: 'دعوتي' },
        { href: `/inviter/${id}?tab=guests`, label: 'مدعوّوي' },
      ]}
      active={`/inviter/${id}?tab=${active}`}
      userName={inviter.name}
      userSub={inviter.side_label ?? 'داعٍ'}
      backHref="/app"
      backLabel="كل مناسباتي"
    >
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

      {/* حصته بثلاث حالات */}
      <div className="card card-pad mb-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="sec-title">حصتي من المقاعد</h2>
          <span className="text-[12.5px] text-muted">
            من أصل <b className="text-ink num">{formatNumber(balance.seats_quota)}</b> مقعد
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-ok-soft px-3 py-3">
            <div className="font-ui text-xl font-extrabold text-ok num leading-none">{formatNumber(balance.confirmed)}</div>
            <div className="mt-1.5 text-[11.5px] text-ok/80">مؤكّد</div>
          </div>
          <div className="rounded-xl bg-warn-soft px-3 py-3">
            <div className="font-ui text-xl font-extrabold text-warn num leading-none">{formatNumber(balance.held)}</div>
            <div className="mt-1.5 text-[11.5px] text-warn/80">بانتظار الرد</div>
          </div>
          <div className={`rounded-xl px-3 py-3 ${balance.available > 0 ? 'bg-brand-soft' : 'bg-danger-soft'}`}>
            <div className={`font-ui text-xl font-extrabold num leading-none ${balance.available > 0 ? 'text-brand' : 'text-danger'}`}>
              {formatNumber(balance.available)}
            </div>
            <div className={`mt-1.5 text-[11.5px] ${balance.available > 0 ? 'text-brand/70' : 'text-danger/80'}`}>متاح لي</div>
          </div>
        </div>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full border border-line bg-panel">
          <div className="h-full bg-ok" style={{ width: `${balance.seats_quota ? (balance.confirmed / balance.seats_quota) * 100 : 0}%` }} />
          <div className="h-full bg-warn" style={{ width: `${balance.seats_quota ? (balance.held / balance.seats_quota) * 100 : 0}%` }} />
        </div>
        {balance.available <= 0 ? (
          <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger">
            نفدت حصتك — راجع صاحب المناسبة لزيادتها. المالك وحده يوزّع الحصص.
          </p>
        ) : null}
      </div>

      {/* ما يحتاج انتباهك */}
      {(drafts > 0 || noResponse > 0 || !ready) ? (
        <div className="mb-5">
          <Alert tone="warn" title="ما يحتاج انتباهك">
            <ul className="mt-1 space-y-1">
              {!ready ? <li>· لم تكتب نصّ دعوتك بعد — ابدأ من تبويب «دعوتي».</li> : null}
              {drafts > 0 ? (
                <li>
                  · <span className="num">{formatNumber(drafts)}</span> مسودة لم تُرسل —{' '}
                  <Link href={`/inviter/${id}?tab=guests`} className="underline">أرسلها</Link>
                </li>
              ) : null}
              {noResponse > 0 ? (
                <li>· <span className="num">{formatNumber(noResponse)}</span> مدعواً لم يردّوا بعد.</li>
              ) : null}
            </ul>
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
    </AppShell>
  );
}
