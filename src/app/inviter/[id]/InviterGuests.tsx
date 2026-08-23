'use client';

import { useActionState, useMemo, useState } from 'react';
import { GuestStatusBadge, EmptyState } from '@/components/ui';
import { SubmitButton, ActionForm } from '@/components/ActionForm';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { Contact, Guest } from '@/lib/types';
import {
  addInviterGuest, addFromContacts, deleteInviterGuest,
  sendInviterInvitations, type ActionState,
} from './actions';

export function InviterGuests({
  inviterId, guests, contacts, canSend, appUrl, ready,
}: {
  inviterId: string;
  guests: Guest[];
  contacts: Contact[];
  canSend: boolean;
  appUrl: string;
  ready: boolean;
}) {
  const [sendState, sendAction] = useActionState<ActionState, FormData>(sendInviterInvitations, {});
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim();
    if (!q) return guests;
    return guests.filter((g) => g.name.includes(q) || g.phone.includes(q));
  }, [guests, query]);

  const drafts = guests.filter((g) => g.status === 'draft').length;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px] items-start">
      <div className="order-2 space-y-4 lg:order-1">
        {sendState.error ? (
          <div className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{sendState.error}</div>
        ) : null}
        {sendState.notice ? (
          <div className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-[13px] text-ok">{sendState.notice}</div>
        ) : null}

        <div className="card card-pad flex flex-wrap items-center gap-2">
          <input className="field min-w-[160px] flex-1" placeholder="بحث…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
          {canSend ? (
            <form action={sendAction}>
              <input type="hidden" name="inviter_id" value={inviterId} />
              <input type="hidden" name="scope" value="all_drafts" />
              <SubmitButton
                className={`btn-primary ${drafts === 0 || !ready ? 'pointer-events-none opacity-50' : ''}`}
                pendingLabel="جارٍ الإرسال…"
              >
                إرسال المسودّات <span className="num">({formatNumber(drafts)})</span>
              </SubmitButton>
            </form>
          ) : null}
        </div>

        {!ready ? (
          <div className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn">
            اكتب نصّ دعوتك واختر قالبك من تبويب «دعوتي» قبل الإرسال.
          </div>
        ) : null}

        {visible.length === 0 ? (
          <EmptyState
            title={guests.length === 0 ? 'لا مدعوين بعد' : 'لا نتائج'}
            description={guests.length === 0 ? 'أضف مدعوّيك يدوياً أو اخترهم من دفتر عناوينك.' : undefined}
          />
        ) : (
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>الاسم</th><th>الجوال</th><th>المقاعد</th><th>الحالة</th><th>آخر تحديث</th><th></th></tr>
              </thead>
              <tbody>
                {visible.map((g) => (
                  <tr key={g.id}>
                    <td className="font-semibold">{g.name}</td>
                    <td className="num text-muted" dir="ltr">{g.phone}</td>
                    <td className="num">
                      {g.confirmed_seats ?? g.max_seats}
                      <span className="text-[11px] text-muted">
                        {g.confirmed_seats != null ? ' مؤكّد' : ' حد أقصى'}
                      </span>
                    </td>
                    <td><GuestStatusBadge status={g.status} /></td>
                    <td className="num text-[12px] text-muted">
                      {formatDateTime(g.responded_at ?? g.sent_at ?? g.created_at)}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        {g.status === 'draft' && canSend && ready ? (
                          <form action={sendAction}>
                            <input type="hidden" name="inviter_id" value={inviterId} />
                            <input type="hidden" name="scope" value="selected" />
                            <input type="hidden" name="guest_ids" value={g.id} />
                            <SubmitButton className="btn-soft btn-sm" pendingLabel="…">أرسل</SubmitButton>
                          </form>
                        ) : null}
                        {g.status === 'sent' ? (
                          <a href={`${appUrl}/rsvp/${g.invite_token}`} target="_blank" rel="noreferrer"
                            className="btn-ghost btn-sm">ذكّره</a>
                        ) : null}
                        {(g.status === 'accepted' || g.status === 'attended') && g.qr_token ? (
                          <a href={`${appUrl}/i/${g.qr_token}`} target="_blank" rel="noreferrer"
                            className="btn-ghost btn-sm">الباركود</a>
                        ) : null}
                        {g.status === 'draft' ? (
                          <form action={deleteInviterGuest}>
                            <input type="hidden" name="inviter_id" value={inviterId} />
                            <input type="hidden" name="guest_id" value={g.id} />
                            <button type="submit" className="btn-ghost btn-sm"
                              onClick={(e) => { if (!confirm(`حذف «${g.name}»؟`)) e.preventDefault(); }}>
                              حذف
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="order-1 space-y-5 lg:order-2">
        <div className="card card-pad">
          <h2 className="sec-title mb-4">إضافة مدعو</h2>
          <ActionForm action={addInviterGuest} onSuccessReset>
            <input type="hidden" name="inviter_id" value={inviterId} />
            <div>
              <label className="label" htmlFor="g-name">الاسم</label>
              <input id="g-name" name="name" className="field" required placeholder="خالد الفهد" />
            </div>
            <div>
              <label className="label" htmlFor="g-phone">الجوال</label>
              <input id="g-phone" name="phone" dir="ltr" className="field text-left num"
                inputMode="tel" required placeholder="0555123456" />
            </div>
            <div>
              <label className="label" htmlFor="g-seats">عدد الأشخاص</label>
              <input id="g-seats" name="max_seats" type="number" min={1} max={50}
                defaultValue={1} className="field num" required />
              <p className="hint">يُحجز من حصتك حتى يرد المدعو بالعدد الفعلي.</p>
            </div>
            <SubmitButton className="btn-primary w-full" pendingLabel="جارٍ…">إضافة</SubmitButton>
          </ActionForm>
        </div>

        <div className="card card-pad">
          <h2 className="sec-title mb-2">من دفتر عناوينك</h2>
          {contacts.length === 0 ? (
            <p className="text-[12.5px] text-muted">دفترك فارغ — أضف جهاتك من صفحة دفتر العناوين.</p>
          ) : !picking ? (
            <button type="button" className="btn-ghost w-full" onClick={() => setPicking(true)}>
              اختيار من <span className="num">{formatNumber(contacts.length)}</span> جهة
            </button>
          ) : (
            <ActionForm action={addFromContacts} onSuccessReset>
              <input type="hidden" name="inviter_id" value={inviterId} />
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
                {contacts.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-panel">
                    <input type="checkbox" name="contact_ids" value={c.id} className="accent-brand" />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="num text-[11.5px] text-muted" dir="ltr">{c.phone}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="label" htmlFor="bulk-seats">عدد الأشخاص لكل دعوة</label>
                <input id="bulk-seats" name="max_seats" type="number" min={1} max={50}
                  defaultValue={1} className="field num" />
              </div>
              <SubmitButton className="btn-primary w-full" pendingLabel="جارٍ…">إضافة المحدَّد</SubmitButton>
              <button type="button" className="btn-ghost w-full" onClick={() => setPicking(false)}>إغلاق</button>
            </ActionForm>
          )}
        </div>
      </div>
    </div>
  );
}
