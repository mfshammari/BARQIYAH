'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui';
import { deleteContact } from './actions';
import { formatNumber } from '@/lib/format';
import type { Contact } from '@/lib/types';

export interface ResponseRecord {
  invited: number;
  accepted: number;
}

/** سجل الاستجابة محسوب من مناسبات صاحب الدفتر السابقة (SPEC §8.2). */
function responseLabel(rec: ResponseRecord | undefined) {
  if (!rec || rec.invited === 0) return { text: 'لم يُدعَ بعد', cls: 'bg-panel text-muted border border-line' };
  const rate = rec.accepted / rec.invited;
  if (rate >= 0.7) return { text: 'يرد دائماً', cls: 'bg-ok-soft text-ok' };
  if (rate >= 0.3) return { text: 'يتأخر', cls: 'bg-warn-soft text-warn' };
  return { text: 'نادراً', cls: 'bg-danger-soft text-danger' };
}

export function ContactsTable({
  contacts, groups, responses,
}: {
  contacts: Contact[];
  groups: string[];
  responses: Record<string, ResponseRecord>;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');

  const visible = useMemo(() => {
    const q = query.trim();
    return contacts.filter((c) => {
      if (group && (c.group_label ?? '') !== group) return false;
      if (!q) return true;
      return c.name.includes(q) || c.phone.includes(q);
    });
  }, [contacts, query, group]);

  return (
    <div className="space-y-4">
      <div className="card card-pad flex flex-wrap items-center gap-2">
        <input
          className="field min-w-[180px] flex-1"
          placeholder="بحث بالاسم أو الجوال…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="field w-auto" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">كل المجموعات</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <span className="text-[12.5px] text-muted num">
          {formatNumber(visible.length)} من {formatNumber(contacts.length)}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={contacts.length === 0 ? 'دفترك فارغ' : 'لا توجد نتائج'}
          description={
            contacts.length === 0
              ? 'أضف جهاتك مرة واحدة، وستكون جاهزة لكل مناسباتك القادمة.'
              : 'جرّب تغيير البحث أو المجموعة.'
          }
        />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>الاسم</th><th>الجوال</th><th>المجموعة</th><th>سجل الاستجابة</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const badge = responseLabel(responses[c.phone]);
                const rec = responses[c.phone];
                return (
                  <tr key={c.id}>
                    <td className="font-semibold">{c.name}</td>
                    <td className="num text-muted" dir="ltr">{c.phone}</td>
                    <td className="text-[12.5px] text-muted">{c.group_label ?? '—'}</td>
                    <td>
                      <span className={`badge ${badge.cls}`}>{badge.text}</span>
                      {rec && rec.invited > 0 ? (
                        <span className="ms-2 text-[11px] text-muted num">
                          {formatNumber(rec.accepted)}/{formatNumber(rec.invited)}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <form action={deleteContact} className="flex justify-end">
                        <input type="hidden" name="contact_id" value={c.id} />
                        <button
                          type="submit" className="btn-ghost btn-sm"
                          onClick={(e) => { if (!confirm(`حذف «${c.name}» من دفترك؟`)) e.preventDefault(); }}
                        >
                          حذف
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
