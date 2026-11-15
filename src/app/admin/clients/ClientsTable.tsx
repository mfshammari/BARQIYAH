'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { ExemptionDialog } from '@/components/exemptions/ExemptionDialog';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { exemptionStatus } from '@/lib/exemptions/logic';
import type { Exemption, GrantInput } from '@/lib/exemptions/types';
import { grantExemptionAction, revokeExemptionAction, updateExemptionCapAction } from '../exemptionActions';

export interface ClientRow {
  id: string;
  name: string;
  phone: string | null;
  eventCount: number;
  spend: number;
  last: string | null;
  sendingPaused: boolean;
  exemption: Exemption | null;
}

type Filter = 'all' | 'exempt' | 'normal';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'exempt', label: 'المعفاة' },
  { key: 'normal', label: 'العادية' },
];

/** الحساب «معفى» ما دام إعفاؤه غير مسحوب وغير منتهٍ (ولو بلغ السقف). */
function isExempt(ex: Exemption | null): boolean {
  if (!ex) return false;
  const s = exemptionStatus(ex);
  return s === 'active' || s === 'cap_reached';
}

/** جدول العملاء مع عمود «الدفع» وحوار الإعفاء — الإجراءات عبر server actions. */
export function ClientsTable({
  rows, adminNames, mayImpersonate, maySuperAdmin,
}: {
  rows: ClientRow[];
  adminNames: Record<string, string>;
  mayImpersonate: boolean;
  /** سوبر أدمن: يرى أزرار الإعفاء. غيره يرى الحالة فقط. */
  maySuperAdmin: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = useMemo(() => rows.filter((r) => {
    if (filter === 'all') return true;
    return filter === 'exempt' ? isExempt(r.exemption) : !isExempt(r.exemption);
  }), [rows, filter]);

  const counts = {
    all: rows.length,
    exempt: rows.filter((r) => isExempt(r.exemption)).length,
    normal: rows.filter((r) => !isExempt(r.exemption)).length,
  };
  const open = openId ? rows.find((r) => r.id === openId) ?? null : null;
  const adminName = (id: string) => adminNames[id] ?? (id === 'system' ? 'النظام' : 'فريق برقية');

  function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { setError(res.error ?? 'تعذّر تنفيذ الإجراء.'); return; }
      setOpenId(null);
      setToast(label);
      router.refresh();
    });
  }

  return (
    <>
      <div className="tabs-row">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={filter === f.key ? 'tab-on' : 'tab'}>
            {f.label} <span className="num opacity-70">({formatNumber(counts[f.key])})</span>
          </button>
        ))}
      </div>

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>العميل</th><th>الجوال</th><th>المناسبات</th><th>الإنفاق</th>
              <th>آخر نشاط</th><th>الحالة</th><th>الدفع</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const exempt = isExempt(r.exemption);
              return (
                <tr key={r.id}>
                  <td className="font-semibold">{r.name}</td>
                  <td className="num text-muted" dir="ltr">{r.phone ?? '—'}</td>
                  <td className="num">{formatNumber(r.eventCount)}</td>
                  <td className="num">{formatCurrency(r.spend)}</td>
                  <td className="num text-[12px] text-muted">{r.last ? formatDate(r.last) : '—'}</td>
                  <td>
                    {r.sendingPaused
                      ? <span className="badge bg-danger-soft text-danger">الإرسال موقوف</span>
                      : <span className="badge bg-ok-soft text-ok">نشط</span>}
                  </td>
                  <td>
                    {exempt ? (
                      <span className="badge bg-ok-soft text-ok">
                        معفى
                        {r.exemption ? <span className="num font-normal opacity-80"> · {formatNumber(r.exemption.used)}/{formatNumber(r.exemption.cap)}</span> : null}
                      </span>
                    ) : (
                      <span className="badge bg-panel text-muted border border-line">عادي</span>
                    )}
                  </td>
                  <td className="text-left">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {maySuperAdmin ? (
                        <button type="button" onClick={() => { setError(null); setOpenId(r.id); }}
                          className={exempt ? 'btn-ghost btn-sm' : 'btn-soft btn-sm'}>
                          {exempt ? 'إدارة الإعفاء' : 'إعفاء من الدفع'}
                        </button>
                      ) : null}
                      {mayImpersonate ? (
                        <Link href={`/admin/clients/${r.id}`} className="btn-ghost btn-sm">عرض كالعميل</Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-[13px] text-muted">لا حسابات في هذا التصنيف</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {open ? (
        <ExemptionDialog
          accountName={open.name}
          exemption={open.exemption}
          adminName={adminName}
          busy={pending}
          error={error}
          onGrant={(input: GrantInput) => run('تم تفعيل الإعفاء', () => grantExemptionAction(open.id, input))}
          onUpdateCap={(cap) => run('تم تعديل السقف', () => updateExemptionCapAction(open.id, cap))}
          onRevoke={() => run('تم سحب الإعفاء', () => revokeExemptionAction(open.id))}
          onClose={() => { setOpenId(null); setError(null); }}
        />
      ) : null}

      {toast ? (
        <div role="status" className="fixed bottom-6 start-1/2 z-50 -translate-x-1/2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white shadow-pop">
          {toast}
        </div>
      ) : null}
    </>
  );
}
