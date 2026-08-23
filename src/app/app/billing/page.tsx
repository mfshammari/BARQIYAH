import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState, StatCard } from '@/components/ui';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import { TRANSACTION_TYPE_LABELS, type EventRow, type Transaction } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface TxRow extends Transaction {
  events: Pick<EventRow, 'id' | 'internal_name' | 'host_name'> | null;
}

const METHOD_LABELS: Record<string, string> = {
  gateway: 'بوابة دفع',
  bank_transfer: 'تحويل بنكي',
  manual: 'تفعيل يدوي',
};

export default async function BillingPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: eventIds } = await supabase.from('events').select('id').eq('owner_id', user.id);
  const ids = (eventIds ?? []).map((e) => e.id);

  const { data } = ids.length
    ? await supabase
        .from('transactions')
        .select('*, events:event_id (id, internal_name, host_name)')
        .in('event_id', ids)
        .order('created_at', { ascending: false })
        .returns<TxRow[]>()
    : { data: [] as TxRow[] };

  const rows = data ?? [];
  const paid = rows.filter((t) => t.status === 'paid');
  const totalPaid = paid.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const totalSeats = paid.reduce((s, t) => s + (t.seats_added ?? 0), 0);
  const pending = rows.filter((t) => t.status === 'pending');

  return (
    <>
      <PageHeader title="المشتريات" subtitle="سجل باقاتك ومدفوعاتك عبر كل مناسباتك." />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="إجمالي المدفوع" value={formatCurrency(totalPaid)} tone="ok" />
        <StatCard label="المقاعد المشتراة" value={formatNumber(totalSeats)} />
        <StatCard label="عمليات معلّقة" value={formatNumber(pending.length)} tone="warn" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="لا توجد مشتريات بعد"
          description="ستظهر هنا فواتير باقاتك بعد إنشاء أول مناسبة وشراء باقتها."
          action={<Link href="/app/events/new" className="btn-primary">إنشاء مناسبة</Link>}
        />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>المناسبة</th><th>النوع</th><th>الطريقة</th><th>المقاعد</th>
                <th>المبلغ</th><th>الحالة</th><th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="font-semibold">
                    {t.events ? (
                      <Link href={`/e/${t.events.id}`} className="hover:text-brand">
                        {t.events.internal_name || t.events.host_name}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="text-muted text-[12.5px]">{TRANSACTION_TYPE_LABELS[t.type]}</td>
                  <td className="text-muted text-[12.5px]">{METHOD_LABELS[t.method] ?? t.method}</td>
                  <td className="num">+{formatNumber(t.seats_added)}</td>
                  <td className="num font-semibold">{formatCurrency(t.amount)}</td>
                  <td>
                    <span className={`badge ${
                      t.status === 'paid' ? 'bg-ok-soft text-ok'
                        : t.status === 'pending' ? 'bg-warn-soft text-warn'
                        : 'bg-danger-soft text-danger'
                    }`}>
                      {t.status === 'paid' ? 'مدفوعة' : t.status === 'pending' ? 'معلّقة' : 'فاشلة'}
                    </span>
                  </td>
                  <td className="num text-[12.5px] text-muted">
                    {formatDateTime(t.paid_at ?? t.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
