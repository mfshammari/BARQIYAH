import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState, StatCard } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { updateTicket } from './actions';
import { formatDateTime, formatNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface Ticket {
  id: string; client_id: string; event_id: string | null;
  subject: string; body: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  profiles: { full_name: string | null; phone: string | null } | null;
}

const PRIORITY = {
  urgent: { label: 'عاجل', cls: 'bg-danger text-white', order: 0 },
  high:   { label: 'مرتفع', cls: 'bg-danger-soft text-danger', order: 1 },
  normal: { label: 'عادي', cls: 'bg-info-soft text-info', order: 2 },
  low:    { label: 'منخفض', cls: 'bg-panel text-muted border border-line', order: 3 },
} as const;

const STATUS = {
  open: 'مفتوحة', in_progress: 'قيد المعالجة', resolved: 'محلولة', closed: 'مغلقة',
} as const;

export default async function SupportPage() {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('support_tickets')
    .select('*, profiles:client_id (full_name, phone)')
    .order('created_at', { ascending: false })
    .returns<Ticket[]>();

  const tickets = (data ?? []).sort(
    (a, b) => PRIORITY[a.priority].order - PRIORITY[b.priority].order,
  );
  const open = tickets.filter((t) => t.status === 'open');
  const urgent = tickets.filter((t) => t.priority === 'urgent' && t.status !== 'closed');

  return (
    <>
      <PageHeader title="الدعم" subtitle="التذاكر مرتّبة بالأولوية، بإجراءات سريعة." />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="تذاكر مفتوحة" value={formatNumber(open.length)} tone={open.length ? 'warn' : 'default'} />
        <StatCard label="عاجلة" value={formatNumber(urgent.length)} tone={urgent.length ? 'danger' : 'default'} />
        <StatCard label="الإجمالي" value={formatNumber(tickets.length)} />
      </div>

      {tickets.length === 0 ? (
        <EmptyState title="لا تذاكر" description="ستظهر هنا طلبات الدعم من العملاء." />
      ) : (
        <div className="space-y-4">
          {tickets.map((t) => (
            <div key={t.id} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${PRIORITY[t.priority].cls}`}>{PRIORITY[t.priority].label}</span>
                    <span className="font-ui font-bold">{t.subject}</span>
                  </div>
                  <div className="mt-1 text-[12.5px] text-muted">
                    {t.profiles?.full_name ?? 'عميل'}
                    <span className="num"> · {formatDateTime(t.created_at)}</span>
                  </div>
                </div>
                <span className="badge border border-line bg-panel text-muted">{STATUS[t.status]}</span>
              </div>

              {t.body ? (
                <p className="mt-3 rounded-xl border border-line bg-panel px-3.5 py-3 text-[13px] leading-7">
                  {t.body}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                {(['in_progress', 'resolved', 'closed'] as const)
                  .filter((s) => s !== t.status)
                  .map((s) => (
                    <ActionForm key={s} action={updateTicket} className="inline">
                      <input type="hidden" name="ticket_id" value={t.id} />
                      <input type="hidden" name="status" value={s} />
                      <SubmitButton
                        className={s === 'closed' ? 'btn-ghost btn-sm' : 'btn-soft btn-sm'}
                        pendingLabel="…"
                      >
                        {STATUS[s]}
                      </SubmitButton>
                    </ActionForm>
                  ))}
                {t.event_id ? (
                  <Link href={`/admin/events/${t.event_id}`} className="btn-ghost btn-sm">
                    المناسبة
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
