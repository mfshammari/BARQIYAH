import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState, StatCard } from '@/components/ui';
import { can } from '@/lib/permissions';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import { TRANSACTION_TYPE_LABELS, type EventRow, type Transaction } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Row extends Transaction {
  events: Pick<EventRow, 'id' | 'host_name' | 'internal_name'> | null;
}

const METHOD_LABELS: Record<string, string> = {
  gateway: 'بوابة دفع',
  bank_transfer: 'تحويل بنكي',
  manual: 'تفعيل يدوي',
};

export default async function FinancePage() {
  const user = await requireUser();
  if (!can(user.profile.role, 'finance')) redirect('/admin');

  const supabase = await createClient();
  const { data } = await supabase
    .from('transactions')
    .select('*, events:event_id (id, host_name, internal_name)')
    .order('created_at', { ascending: false })
    .returns<Row[]>();

  const rows = data ?? [];
  const paid = rows.filter((t) => t.status === 'paid');
  const pending = rows.filter((t) => t.status === 'pending');

  const revenue = paid.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const outstanding = pending.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const byGateway = paid.filter((t) => t.method === 'gateway').length;

  return (
    <>
      <PageHeader
        title="المالية"
        subtitle="الإيراد والتحصيل المعلّق، وسجل يبيّن طريقة الدفع وآلية التفعيل."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="الإيراد المحصَّل" value={formatCurrency(revenue)} tone="ok" />
        <StatCard label="تحصيل معلّق" value={formatCurrency(outstanding)} tone="warn"
          sub={`${formatNumber(pending.length)} عملية`} />
        <StatCard label="عمليات مدفوعة" value={formatNumber(paid.length)} />
        <StatCard label="عبر البوابة" value={formatNumber(byGateway)}
          sub={`${formatNumber(paid.length - byGateway)} يدوياً`} />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="لا عمليات بعد" />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>المناسبة</th><th>النوع</th><th>الطريقة</th><th>آلية التفعيل</th>
                <th>المقاعد</th><th>المبلغ</th><th>الحالة</th><th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="font-semibold">
                    {t.events?.internal_name || t.events?.host_name || '—'}
                  </td>
                  <td className="text-[12.5px] text-muted">{TRANSACTION_TYPE_LABELS[t.type]}</td>
                  <td className="text-[12.5px] text-muted">{METHOD_LABELS[t.method] ?? t.method}</td>
                  <td className="text-[12px]">
                    {t.method === 'gateway' ? (
                      <span className="badge bg-info-soft text-info">تلقائي</span>
                    ) : (
                      <span className="badge border border-line bg-panel text-muted">يدوي</span>
                    )}
                  </td>
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
                  <td className="num text-[12px] text-muted">{formatDateTime(t.paid_at ?? t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
