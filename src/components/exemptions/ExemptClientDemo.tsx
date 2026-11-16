'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDate, formatNumber } from '@/lib/format';
import { isExemptionActive } from '@/lib/exemptions/logic';
import {
  createEvent, getExemption, listAccounts, listEvents, sendInvitations, type MockAccount, type MockEvent,
} from '@/lib/exemptions/mock';
import { CAP_REACHED_MESSAGE, type Exemption, type SendBlockReason } from '@/lib/exemptions/types';
import { HospitalityBalanceCard } from './HospitalityBalanceCard';

const BLOCK_TEXT: Record<SendBlockReason, string> = {
  cap_reached: CAP_REACHED_MESSAGE,
  revoked: CAP_REACHED_MESSAGE,
  expired: CAP_REACHED_MESSAGE,
  no_package: 'هذه المناسبة بلا باقة بعد. اختر باقة لبدء الإرسال.',
};

/**
 * جانب العميل: مناسبات الحساب، إنشاء مناسبة (تُفعَّل فورًا للمعفى بلا دفع)،
 * وإرسال دفعة دعوات يمرّ بفحص الخادم. لا أدوات إعفاء هنا.
 */
export function ExemptClientDemo({ accountId }: { accountId: string }) {
  const [account, setAccount] = useState<MockAccount | null>(null);
  const [exemption, setExemption] = useState<Exemption | null>(null);
  const [events, setEvents] = useState<MockEvent[]>([]);
  const [name, setName] = useState('');
  const [count, setCount] = useState('5');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string; packages?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [accs, ex, evs] = await Promise.all([listAccounts(), getExemption(accountId), listEvents(accountId)]);
    setAccount(accs.find((a) => a.id === accountId) ?? null);
    setExemption(ex);
    setEvents(evs);
    setLoading(false);
  }, [accountId]);

  useEffect(() => { setLoading(true); void refresh(); }, [refresh]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const ev = await createEvent(accountId, name);
      setName('');
      setNotice(ev.status === 'active'
        ? { tone: 'ok', text: 'أُنشئت المناسبة وفُعّلت ضمن باقة الضيافة — بلا خطوة دفع.' }
        : { tone: 'warn', text: 'أُنشئت المناسبة. اختر باقة لتفعيلها.' });
      await refresh();
    } finally { setBusy(false); }
  }

  async function onSend(ev: MockEvent) {
    const n = Math.max(1, Math.round(Number(count) || 1));
    setBusy(true);
    try {
      const { result } = await sendInvitations(accountId, ev.id, n);
      setNotice(result.ok
        ? { tone: 'ok', text: `أُرسلت ${formatNumber(n)} دعوة من «${ev.name}».` }
        : { tone: 'warn', text: BLOCK_TEXT[result.reason ?? 'no_package'], packages: true });
      await refresh();
    } finally { setBusy(false); }
  }

  if (loading || !account) return <div className="card card-pad text-center text-[13px] text-muted">جارٍ التحميل…</div>;

  const exemptActive = isExemptionActive(exemption);
  const blocked = Boolean(exemption) && !exemptActive;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {notice ? (
          <div className={`rounded-xl px-3.5 py-2.5 text-[13px] ${notice.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
            {notice.text}
            {notice.packages ? (
              <a href="/app/events/new" className="btn-gold btn-sm ms-3">عرض الباقات</a>
            ) : null}
          </div>
        ) : null}

        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
            <h2 className="sec-title">مناسباتي</h2>
            <label className="flex items-center gap-2 text-[12.5px] text-muted">
              دفعة الإرسال
              <input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)}
                className="field !w-20 !py-1.5 num" aria-label="عدد الدعوات في الدفعة" />
            </label>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="tbl-tight">
              <thead><tr><th>المناسبة</th><th>الحالة</th><th>الباقة</th><th>المرسل</th><th></th></tr></thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td>
                      <div className="font-semibold">{ev.name}</div>
                      <div className="num text-[11.5px] text-muted">{formatDate(ev.createdAt)}</div>
                    </td>
                    <td>
                      {ev.status === 'active'
                        ? <span className="badge bg-ok-soft text-ok">مفعّلة</span>
                        : <span className="badge bg-danger-soft text-danger">غير مدفوعة</span>}
                    </td>
                    <td className="text-[12.5px]">{ev.paidPackage ?? (exemption && ev.status === 'active' ? 'باقة ضيافة' : '—')}</td>
                    <td className="num">{formatNumber(ev.sent)}</td>
                    <td className="text-left">
                      <button type="button" disabled={busy} onClick={() => { void onSend(ev); }} className="btn-primary btn-sm">
                        إرسال الدعوات
                      </button>
                    </td>
                  </tr>
                ))}
                {events.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-[13px] text-muted">لا مناسبات بعد</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <form onSubmit={onCreate} className="card card-pad flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="label" htmlFor="ev-name">مناسبة جديدة</label>
            <input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder="حفل زواج…" />
          </div>
          <button type="submit" disabled={busy} className="btn-primary">إنشاء المناسبة</button>
          <p className="hint w-full">
            {exemptActive ? 'حسابك ضمن باقة الضيافة: تُفعَّل المناسبة فورًا بلا دفع.' : 'بعد الإنشاء تختار الباقة وتدفع لتفعيل المناسبة.'}
          </p>
        </form>
      </div>

      <div className="space-y-4">
        {exemption ? (
          <HospitalityBalanceCard exemption={exemption} blocked={blocked} />
        ) : (
          <div className="card card-pad">
            <h2 className="sec-title mb-2">الباقة</h2>
            <p className="text-[13px] text-muted">لا باقة نشطة على مستوى الحساب. تُشترى الباقة لكل مناسبة عند إنشائها.</p>
          </div>
        )}
        <p className="text-[11.5px] text-muted">
          الحساب: <b className="text-ink">{account.name}</b>
        </p>
      </div>
    </div>
  );
}
