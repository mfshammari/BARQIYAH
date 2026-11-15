import { requireUser, CLIENT_ROLES, ADMIN_ROLES } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { isSuperAdmin } from '@/lib/exemptions/logic';
import { fetchAllExemptions, fetchExemptionLog } from '@/lib/exemptions/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState, StatCard } from '@/components/ui';
import { ExemptionLogTable } from '@/components/exemptions/ExemptionLogTable';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { EventRow, Profile, Transaction } from '@/lib/types';
import { ClientsTable, type ClientRow } from './ClientsTable';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const user = await requireUser();
  const mayImpersonate = can(user.profile.role, 'impersonate');
  const maySuperAdmin = isSuperAdmin(user.profile.role);
  const supabase = await createClient();

  const [{ data: clientsData }, { data: eventsData }, { data: txData }, { data: adminsData }, exemptions, log] =
    await Promise.all([
      supabase.from('profiles').select('*').in('role', CLIENT_ROLES)
        .order('created_at', { ascending: false }).returns<Profile[]>(),
      supabase.from('events').select('id, owner_id, created_at, status').returns<EventRow[]>(),
      supabase.from('transactions').select('event_id, amount, status').returns<Transaction[]>(),
      supabase.from('profiles').select('id, full_name').in('role', ADMIN_ROLES).returns<Pick<Profile, 'id' | 'full_name'>[]>(),
      fetchAllExemptions(supabase),
      fetchExemptionLog(supabase),
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

  const rows: ClientRow[] = clients.map((c) => {
    const own = events.filter((e) => e.owner_id === c.id);
    const last = own.map((e) => e.created_at).sort().at(-1) ?? null;
    return {
      id: c.id,
      name: c.full_name ?? c.id.slice(0, 8),
      phone: c.phone,
      eventCount: own.length,
      spend: spendByOwner.get(c.id) ?? 0,
      last,
      sendingPaused: c.sending_paused,
      exemption: exemptions[c.id] ?? null,
    };
  }).sort((a, b) => b.spend - a.spend);

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const adminNames: Record<string, string> = {};
  for (const a of adminsData ?? []) adminNames[a.id] = a.full_name ?? 'فريق برقية';
  const clientNames = new Map(rows.map((r) => [r.id, r.name]));

  return (
    <>
      <PageHeader title="العملاء" subtitle="حساباتهم الدائمة، وعدد مناسباتهم، وإنفاقهم، ومن منهم معفى من الدفع." />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="عدد العملاء" value={formatNumber(clients.length)} />
        <StatCard label="إجمالي المناسبات" value={formatNumber(events.length)} />
        <StatCard label="إجمالي الإنفاق" value={formatCurrency(totalSpend)} tone="ok" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="لا عملاء بعد" />
      ) : (
        <ClientsTable rows={rows} adminNames={adminNames} mayImpersonate={mayImpersonate} maySuperAdmin={maySuperAdmin} />
      )}

      <div className="mt-6">
        <ExemptionLogTable
          rows={log}
          accountName={(id) => clientNames.get(id) ?? id.slice(0, 8)}
          adminName={(id) => adminNames[id] ?? 'فريق برقية'}
        />
      </div>

      <p className="mt-3 text-[11.5px] text-muted">
        بيانات العملاء للدعم التشغيلي — وأرقام مدعوّيهم لا تُعرض هنا ولا تُصدَّر.
      </p>
    </>
  );
}
