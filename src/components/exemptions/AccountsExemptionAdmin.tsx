'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatNumber } from '@/lib/format';
import { exemptionStatus } from '@/lib/exemptions/logic';
import {
  adminName, grantExemption, listAccounts, listAllExemptions, listEvents, listExemptionLog,
  revokeExemption, updateExemptionCap, type MockAccount, type MockEvent,
} from '@/lib/exemptions/mock';
import type { Exemption, ExemptionLogEntry, GrantInput } from '@/lib/exemptions/types';
import { ExemptionDialog } from './ExemptionDialog';
import { ExemptionLogTable } from './ExemptionLogTable';

type Filter = 'all' | 'exempt' | 'normal';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'exempt', label: 'المعفاة' },
  { key: 'normal', label: 'العادية' },
];

/** الحساب «معفى» ما دام إعفاؤه غير مسحوب وغير منتهٍ (ولو بلغ السقف). */
function isExempt(ex: Exemption | undefined): boolean {
  if (!ex) return false;
  const s = exemptionStatus(ex);
  return s === 'active' || s === 'cap_reached';
}

/** قائمة الحسابات للأدمن مع عمود «الدفع» وحوار الإعفاء وسجلّه. */
export function AccountsExemptionAdmin() {
  const [accounts, setAccounts] = useState<MockAccount[]>([]);
  const [events, setEvents] = useState<MockEvent[]>([]);
  const [exemptions, setExemptions] = useState<Record<string, Exemption>>({});
  const [log, setLog] = useState<ExemptionLogEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [a, e, x, l] = await Promise.all([listAccounts(), listEvents(), listAllExemptions(), listExemptionLog()]);
    setAccounts(a); setEvents(e); setExemptions(x); setLog(l);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const accountName = useCallback(
    (id: string) => accounts.find((a) => a.id === id)?.name ?? id,
    [accounts],
  );

  const rows = useMemo(() => accounts
    .map((a) => ({ a, ex: exemptions[a.id], exempt: isExempt(exemptions[a.id]), events: events.filter((e) => e.accountId === a.id).length }))
    .filter((r) => filter === 'all' || (filter === 'exempt' ? r.exempt : !r.exempt)), [accounts, exemptions, events, filter]);

  async function run(label: string, fn: () => Promise<unknown>, closeAfter = true) {
    setBusy(true); setError(null);
    try {
      await fn();
      await refresh();
      setToast(label);
      if (closeAfter) setOpenId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر تنفيذ الإجراء');
    } finally {
      setBusy(false);
    }
  }

  const openAccount = openId ? accounts.find((a) => a.id === openId) ?? null : null;

  if (loading) return <div className="card card-pad text-center text-[13px] text-muted">جارٍ تحميل الحسابات…</div>;

  const counts = {
    all: accounts.length,
    exempt: accounts.filter((a) => isExempt(exemptions[a.id])).length,
    normal: accounts.filter((a) => !isExempt(exemptions[a.id])).length,
  };

  return (
    <div className="space-y-5">
      <div className="tabs-row !mb-0">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={filter === f.key ? 'tab-on' : 'tab'}>
            {f.label} <span className="num opacity-70">({formatNumber(counts[f.key])})</span>
          </button>
        ))}
      </div>

      <section className="card">
        <div className="overflow-x-auto">
          <table className="tbl-tight">
            <thead>
              <tr><th>العميل</th><th>الجوال</th><th>المناسبات</th><th>الدفع</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map(({ a, ex, exempt, events: evCount }) => (
                <tr key={a.id}>
                  <td className="font-semibold">{a.name}</td>
                  <td className="num text-muted" dir="ltr">{a.phone}</td>
                  <td className="num">{formatNumber(evCount)}</td>
                  <td>
                    {exempt ? (
                      <span className="badge bg-ok-soft text-ok">
                        معفى
                        {ex ? <span className="num font-normal opacity-80"> · {formatNumber(ex.used)}/{formatNumber(ex.cap)}</span> : null}
                      </span>
                    ) : (
                      <span className="badge bg-panel text-muted border border-line">عادي</span>
                    )}
                  </td>
                  <td className="text-left">
                    <button type="button" onClick={() => { setError(null); setOpenId(a.id); }}
                      className={exempt ? 'btn-ghost btn-sm' : 'btn-soft btn-sm'}>
                      {exempt ? 'إدارة الإعفاء' : 'إعفاء من الدفع'}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-[13px] text-muted">لا حسابات في هذا التصنيف</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <ExemptionLogTable rows={log} accountName={accountName} adminName={adminName} />

      {openAccount ? (
        <ExemptionDialog
          accountName={openAccount.name}
          exemption={exemptions[openAccount.id] ?? null}
          adminName={adminName}
          busy={busy}
          error={error}
          onGrant={(input: GrantInput) => { void run('تم تفعيل الإعفاء', () => grantExemption(openAccount.id, input)); }}
          onUpdateCap={(cap) => { void run('تم تعديل السقف', () => updateExemptionCap(openAccount.id, cap)); }}
          onRevoke={() => { void run('تم سحب الإعفاء', () => revokeExemption(openAccount.id)); }}
          onClose={() => { setOpenId(null); setError(null); }}
        />
      ) : null}

      {toast ? (
        <div role="status" className="fixed bottom-6 start-1/2 z-50 -translate-x-1/2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white shadow-pop">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
