import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState, StatCard } from '@/components/ui';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import type { EventRow, Profile, Transaction } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const user = await requireUser();
  const mayImpersonate = can(user.profile.role, 'impersonate');
  const supabase = await createClient();

  const [{ data: clientsData }, { data: eventsData }, { data: txData }] = await Promise.all([
    supabase.from('profiles').select('*').in('role', ['user', 'owner'])
      .order('created_at', { ascending: false }).returns<Profile[]>(),
    supabase.from('events').select('id, owner_id, created_at, status').returns<EventRow[]>(),
    supabase.from('transactions').select('event_id, amount, status').returns<Transaction[]>(),
  ]);

  const clients = clientsData ?? [];
  const events = eventsData ?? [];
  const txs = txData ?? [];

  const eventOwner = new Map(events.map((e) => [e.id, e.owner_id]));
  const spendByOwner = new Map<string, number>();
  for (const t of txs) {
    if (t.status !== 'paid') continue;
    const owner = eventOwner.get(t.event_id);
    if (!owner) continue;
    spendByOwner.set(owner, (spendByOwner.get(owner) ?? 0) + Number(t.amount ?? 0));
  }

  const rows = clients.map((c) => {
    const own = events.filter((e) => e.owner_id === c.id);
    const last = own.map((e) => e.created_at).sort().at(-1) ?? null;
    return { c, eventCount: own.length, spend: spendByOwner.get(c.id) ?? 0, last };
  }).sort((a, b) => b.spend - a.spend);

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);

  return (
    <>
      <PageHeader title="العملاء" subtitle="حساباتهم الدائمة، وعدد مناسباتهم، وإنفاقهم، وآخر نشاط." />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="عدد العملاء" value={formatNumber(clients.length)} />
        <StatCard label="إجمالي المناسبات" value={formatNumber(events.length)} />
        <StatCard label="إجمالي الإنفاق" value={formatCurrency(totalSpend)} tone="ok" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="لا عملاء بعد" />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>العميل</th><th>الجوال</th><th>المناسبات</th><th>الإنفاق</th><th>آخر نشاط</th><th>الحالة</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map(({ c, eventCount, spend, last }) => (
                <tr key={c.id}>
                  <td className="font-semibold">{c.full_name ?? c.id.slice(0, 8)}</td>
                  <td className="num text-muted" dir="ltr">{c.phone ?? '—'}</td>
                  <td className="num">{formatNumber(eventCount)}</td>
                  <td className="num">{formatCurrency(spend)}</td>
                  <td className="num text-[12px] text-muted">{last ? formatDate(last) : '—'}</td>
                  <td>
                    {c.sending_paused ? (
                      <span className="badge bg-danger-soft text-danger">الإرسال موقوف</span>
                    ) : (
                      <span className="badge bg-ok-soft text-ok">نشط</span>
                    )}
                  </td>
                  <td className="text-left">
                    {mayImpersonate ? (
                      <Link href={`/admin/clients/${c.id}`} className="btn-ghost btn-sm">
                        عرض كالعميل
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11.5px] text-muted">
        بيانات العملاء للدعم التشغيلي — وأرقام مدعوّيهم لا تُعرض هنا ولا تُصدَّر.
      </p>
    </>
  );
}
