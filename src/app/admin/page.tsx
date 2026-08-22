import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, StatCard, EventStatusBadge, EmptyState } from '@/components/ui';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { metaConfigured } from '@/lib/env';
import { OCCASION_LABELS, type EventRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [events, guests, owners, transactions, pendingTemplates] = await Promise.all([
    supabase.from('events').select('*').order('created_at', { ascending: false }),
    supabase.from('guests').select('id, status', { count: 'exact' }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'owner'),
    supabase.from('transactions').select('amount, status'),
    supabase.from('templates').select('id', { count: 'exact', head: true }).eq('status', 'under_review'),
  ]);

  const allEvents = (events.data ?? []) as EventRow[];
  const messagesSent = (guests.data ?? []).filter((g) => g.status !== 'draft').length;
  const revenue = (transactions.data ?? [])
    .filter((t) => t.status === 'paid')
    .reduce((s, t) => s + Number(t.amount ?? 0), 0);

  return (
    <>
      <PageHeader
        title="لوحة المنصة"
        subtitle="نظرة عامة على المناسبات والعملاء والاستهلاك."
      />

      {!metaConfigured ? (
        <div className="mb-5 rounded-xl border border-warn/25 bg-warn-soft text-warn px-4 py-3 text-[13px]">
          <b>وضع المحاكاة مفعّل:</b> مفاتيح Meta غير مضبوطة، فالرسائل تُسجَّل ولا تُرسل فعلياً.
          أضف المفاتيح من <Link href="/admin/integration" className="underline">إعدادات واتساب</Link>.
        </div>
      ) : null}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="إجمالي المناسبات" value={formatNumber(allEvents.length)} />
        <StatCard label="العملاء (أصحاب المناسبات)" value={formatNumber(owners.count ?? 0)} />
        <StatCard label="الرسائل المرسلة" value={formatNumber(messagesSent)} tone="brand" />
        <StatCard label="الإيرادات المسجّلة" value={formatCurrency(revenue)} tone="ok" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="مناسبات بانتظار التفعيل" tone="warn"
          value={formatNumber(allEvents.filter((e) => e.status === 'pending').length)} />
        <StatCard label="مناسبات مفعّلة" tone="ok"
          value={formatNumber(allEvents.filter((e) => e.status === 'active').length)} />
        <StatCard label="طلبات قوالب قيد المراجعة" tone="warn"
          value={formatNumber(pendingTemplates.count ?? 0)} />
      </div>

      <div className="card">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-line">
          <h2 className="sec-title">أحدث المناسبات</h2>
          <Link href="/admin/events" className="text-[12.5px] text-brand font-semibold">عرض الكل</Link>
        </div>

        {allEvents.length === 0 ? (
          <div className="p-5">
            <EmptyState title="لا توجد مناسبات بعد" description="ستظهر هنا فور إنشاء العملاء لمناسباتهم." />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الدعوة باسم</th><th>النوع</th><th>التاريخ</th>
                  <th>المقاعد</th><th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {allEvents.slice(0, 8).map((e) => (
                  <tr key={e.id}>
                    <td className="font-semibold">{e.host_name}</td>
                    <td className="text-muted">{OCCASION_LABELS[e.occasion_type]}</td>
                    <td className="text-muted num">{formatDate(e.event_date)}</td>
                    <td className="num">{formatNumber(e.seats_quota)}</td>
                    <td><EventStatusBadge status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
