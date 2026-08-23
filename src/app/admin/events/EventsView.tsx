'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { EventStatusBadge, EmptyState } from '@/components/ui';
import { formatDate, formatHijri, formatNumber } from '@/lib/format';
import { OCCASION_LABELS, type EventRow } from '@/lib/types';

export interface AdminEventRow extends EventRow {
  ownerName: string | null;
  guestCount: number;
  sentCount: number;
  draftCount: number;
}

type Tab = 'all' | 'unpaid' | 'active' | 'soon' | 'past';
type View = 'table' | 'calendar';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'unpaid', label: 'غير مدفوعة' },
  { key: 'active', label: 'نشطة' },
  { key: 'soon', label: 'قريبة' },
  { key: 'past', label: 'منتهية' },
];

function readiness(e: AdminEventRow) {
  if (e.status === 'unpaid' || e.status === 'pending') {
    return { label: 'غير مدفوعة', cls: 'bg-danger-soft text-danger', dot: 'bg-danger' };
  }
  if (e.guestCount === 0 || e.sentCount === 0) {
    return { label: 'تحتاج متابعة', cls: 'bg-warn-soft text-warn', dot: 'bg-warn' };
  }
  if (e.draftCount > 0) {
    return { label: 'تحتاج متابعة', cls: 'bg-warn-soft text-warn', dot: 'bg-warn' };
  }
  return { label: 'جاهزة', cls: 'bg-ok-soft text-ok', dot: 'bg-ok' };
}

/** تقويم شهري يبرز الأيام المزدحمة — ضغط الإرسال يتركّز فيها. */
function Calendar({ events, monthOffset, onShift }: {
  events: AdminEventRow[]; monthOffset: number; onShift: (d: number) => void;
}) {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);

  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = new Date(year, month, 1).getDay();       // 0 = الأحد
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = new Map<number, AdminEventRow[]>();
  for (const e of events) {
    const d = new Date(e.event_date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const list = byDay.get(d.getDate()) ?? [];
      list.push(e);
      byDay.set(d.getDate(), list);
    }
  }

  const monthLabel = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { month: 'long', year: 'numeric' })
    .format(base);
  const hijriLabel = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { month: 'long', year: 'numeric' })
    .format(base);

  const busy = Array.from(byDay.values()).filter((l) => l.length >= 3).length;

  return (
    <div className="card card-pad">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-ui font-bold">{monthLabel}</div>
          <div className="text-[12px] text-muted num">{hijriLabel}</div>
        </div>
        <div className="flex gap-1.5">
          <button type="button" className="btn-ghost btn-sm" onClick={() => onShift(-1)}>السابق</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => onShift(0)}>اليوم</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => onShift(1)}>التالي</button>
        </div>
      </div>

      {busy > 0 ? (
        <div className="mb-4 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[12.5px] text-warn">
          <b className="num">{formatNumber(busy)}</b> يوماً مزدحماً هذا الشهر (٣ مناسبات فأكثر) —
          ضغط الإرسال يتركّز فيها، فراقب جودة الرقم المشترك.
        </div>
      ) : null}

      <div className="grid grid-cols-7 gap-1 text-center">
        {['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map((d) => (
          <div key={d} className="pb-2 text-[11px] font-semibold text-muted">{d.slice(0, 3)}</div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const list = byDay.get(day) ?? [];
          const crowded = list.length >= 3;
          return (
            <div
              key={day}
              className={`min-h-[68px] rounded-lg border p-1.5 text-right ${
                crowded ? 'border-warn/40 bg-warn-soft' : 'border-line bg-surface'
              }`}
            >
              <div className="text-[11px] text-muted num">{formatNumber(day)}</div>
              <div className="mt-1 space-y-0.5">
                {list.slice(0, 3).map((e) => {
                  const r = readiness(e);
                  return (
                    <Link key={e.id} href={`/admin/events/${e.id}`}
                      className="flex items-center gap-1 truncate text-[10.5px] hover:underline">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.dot}`} />
                      <span className="truncate">{e.host_name}</span>
                    </Link>
                  );
                })}
                {list.length > 3 ? (
                  <div className="text-[10px] text-muted num">+{formatNumber(list.length - 3)}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 border-t border-line pt-3 text-[11.5px] text-muted">
        {[['bg-ok','جاهزة'],['bg-warn','تحتاج متابعة'],['bg-danger','غير مدفوعة']].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${c}`} /> {l}
          </span>
        ))}
      </div>
    </div>
  );
}

export function EventsView({ events, initialTab }: { events: AdminEventRow[]; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [view, setView] = useState<View>('table');
  const [query, setQuery] = useState('');
  const [monthOffset, setMonthOffset] = useState(0);

  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);
  const weekIso = weekAhead.toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const q = query.trim();
    return events.filter((e) => {
      if (tab === 'unpaid' && !['unpaid', 'pending'].includes(e.status)) return false;
      if (tab === 'active' && e.status !== 'active') return false;
      if (tab === 'soon' && !(e.event_date >= today && e.event_date <= weekIso)) return false;
      if (tab === 'past' && e.event_date >= today) return false;
      if (!q) return true;
      return (
        e.host_name.includes(q) ||
        (e.internal_name ?? '').includes(q) ||
        (e.ownerName ?? '').includes(q)
      );
    });
  }, [events, tab, query, today, weekIso]);

  const countFor = (t: Tab) => {
    if (t === 'all') return events.length;
    if (t === 'unpaid') return events.filter((e) => ['unpaid', 'pending'].includes(e.status)).length;
    if (t === 'active') return events.filter((e) => e.status === 'active').length;
    if (t === 'soon') return events.filter((e) => e.event_date >= today && e.event_date <= weekIso).length;
    return events.filter((e) => e.event_date < today).length;
  };

  return (
    <div className="space-y-4">
      <div className="card card-pad space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                tab === t.key ? 'bg-brand text-white' : 'border border-line bg-panel text-muted hover:text-ink'
              }`}
            >
              {t.label} <span className="num opacity-70">({formatNumber(countFor(t.key))})</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input className="field min-w-[180px] flex-1" placeholder="بحث بالاسم أو العميل…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="flex overflow-hidden rounded-xl border border-line">
            <button type="button" onClick={() => setView('table')}
              className={`px-3 py-2 text-[12.5px] font-semibold ${view === 'table' ? 'bg-brand text-white' : 'bg-surface text-muted'}`}>
              جدول
            </button>
            <button type="button" onClick={() => setView('calendar')}
              className={`px-3 py-2 text-[12.5px] font-semibold ${view === 'calendar' ? 'bg-brand text-white' : 'bg-surface text-muted'}`}>
              تقويم
            </button>
          </div>
        </div>
      </div>

      {view === 'calendar' ? (
        <Calendar
          events={filtered}
          monthOffset={monthOffset}
          onShift={(d) => setMonthOffset((m) => (d === 0 ? 0 : m + d))}
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="لا مناسبات مطابقة" description="جرّب تبويباً آخر أو غيّر البحث." />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>المناسبة</th><th>العميل</th><th>هجري</th><th>ميلادي</th>
                <th>المقاعد</th><th>الجاهزية</th><th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const r = readiness(e);
                return (
                  <tr key={e.id}>
                    <td className="font-semibold">
                      <Link href={`/admin/events/${e.id}`} className="hover:text-brand">
                        {e.internal_name || e.host_name}
                      </Link>
                    </td>
                    <td className="text-[12.5px] text-muted">{e.ownerName ?? '—'}</td>
                    <td className="num text-[12.5px]">{e.event_date_hijri || formatHijri(e.event_date)}</td>
                    <td className="num text-[12.5px] text-muted">{formatDate(e.event_date)}</td>
                    <td className="num">{formatNumber(e.seats_quota)}</td>
                    <td><span className={`badge ${r.cls}`}>{r.label}</span></td>
                    <td><EventStatusBadge status={e.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[12px] text-muted num">
        {formatNumber(filtered.length)} من {formatNumber(events.length)} مناسبة
        {OCCASION_LABELS ? '' : ''}
      </p>
    </div>
  );
}
