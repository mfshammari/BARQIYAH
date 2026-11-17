'use client';

import { useActionState, useMemo, useState } from 'react';
import { ManualMessageEditor } from '@/components/manual-whatsapp/ManualMessageEditor';
import {
  buildMessage, resolveSignature, templateText, type ManualMessageConfig, type SignBy,
} from '@/lib/manualMessage';
import { GuestStatusBadge, EmptyState } from '@/components/ui';
import { SubmitButton, ActionForm } from '@/components/ActionForm';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { Contact, Guest } from '@/lib/types';
import {
  addInviterGuest, addFromContacts, deleteInviterGuest, markInviterGuestManualSent, saveInviterAttachment,
  saveInviterManualMessage, sendInviterInvitations, type ActionState,
} from './actions';
import { WhatsAppSendLink } from '@/components/WhatsAppSendLink';
import { GUEST_STATUS_LABELS, type GuestStatus } from '@/lib/types';
import { isUnopened, lastUpdate, matchesOpened, sortByUpdate, type OpenedFilter, type UpdatedSort } from '@/lib/guestFilters';
import { buildWhatsAppUrl } from '@/lib/manualInvite';
import { AttachmentBox, type AttachmentInitial } from '@/components/manual-whatsapp/AttachmentBox';

/** حالات شرائح التصفية في صفحة الداعي، بترتيب مسار الدعوة */
const STATUS_CHIPS: GuestStatus[] = ['draft', 'sent', 'accepted', 'declined', 'attended', 'expired'];

function FilterChip({
  label, count, active, onClick,
}: {
  label: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors ${
        active ? 'bg-brand text-white' : 'bg-panel text-muted hover:text-ink border border-line'
      }`}
    >
      {label} <span className="num opacity-70">({count})</span>
    </button>
  );
}

export interface InviterManualSetup {
  /** وصف المناسبة كما كتبه الداعي — {المناسبة} */
  occasion: string;
  /** اليوم والتاريخ الهجري والوقت — {التاريخ} */
  date: string;
  /** {المكان} */
  venue: string;
  /** اسم حساب صاحب المناسبة (event_owner_name) */
  ownerName: string;
  /** اسم حساب الداعي الفرعي */
  subName: string;
  config: ManualMessageConfig;
  signBy: SignBy;
  /** حساب الرافع ومرفق الدعوة الحالي */
  uid: string;
  attachment: AttachmentInitial;
}

export function InviterGuests({
  inviterId, guests, contacts, canSend, appUrl, ready, manual,
}: {
  /** رسالة واتساب اليدوية للداعي — null إن لم يكتب نصّ دعوته بعد */
  manual: InviterManualSetup | null;
  inviterId: string;
  guests: Guest[];
  contacts: Contact[];
  canSend: boolean;
  appUrl: string;
  ready: boolean;
}) {
  const [sendState, sendAction] = useActionState<ActionState, FormData>(sendInviterInvitations, {});
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<GuestStatus | 'all'>('all');
  const [opened, setOpened] = useState<OpenedFilter>('all');
  const [sort, setSort] = useState<UpdatedSort>('none');
  const [picking, setPicking] = useState(false);
  const [config, setConfig] = useState<ManualMessageConfig>(manual?.config ?? { template: 'formal', texts: {} });
  const [signBy, setSignBy] = useState<SignBy>(manual?.signBy ?? 'both');
  const names = manual ? { ownerName: manual.ownerName, subName: manual.subName } : null;
  const signature = names ? resolveSignature(names, signBy) : '';
  const sampleGuest = guests[0];

  const visible = useMemo(() => {
    const q = query.trim();
    const rows = guests.filter((g) => {
      if (status !== 'all' && g.status !== status) return false;
      if (!matchesOpened(g, opened)) return false;
      return !q || g.name.includes(q) || g.phone.includes(q);
    });
    return sortByUpdate(rows, sort);
  }, [guests, query, status, opened, sort]);

  const countOf = (s: GuestStatus) => guests.filter((g) => g.status === s).length;
  const openedCount = guests.filter((g) => g.opened_at).length;
  const unopenedCount = guests.filter(isUnopened).length;

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

        {guests.length > 0 ? (
          <div className="card card-pad space-y-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-semibold text-muted me-1">الحالة</span>
              <FilterChip active={status === 'all'} onClick={() => setStatus('all')} label="الكل" count={guests.length} />
              {STATUS_CHIPS.map((s) => (
                <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}
                  label={GUEST_STATUS_LABELS[s]} count={countOf(s)} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
              <span className="text-[12px] font-semibold text-muted me-1">فتح الدعوة</span>
              <FilterChip active={opened === 'all'} onClick={() => setOpened('all')} label="الكل" count={guests.length} />
              <FilterChip active={opened === 'opened'} onClick={() => setOpened('opened')} label="فتح الدعوة" count={openedCount} />
              <FilterChip active={opened === 'unopened'} onClick={() => setOpened('unopened')} label="لم يفتح" count={unopenedCount} />
              <label className="ms-auto flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                الترتيب
                <select className="field !w-auto !py-1 text-[12px]" value={sort}
                  onChange={(e) => setSort(e.target.value as UpdatedSort)}>
                  <option value="none">ترتيب الإضافة</option>
                  <option value="desc">الأحدث تحديثاً</option>
                  <option value="asc">الأقدم تحديثاً</option>
                </select>
              </label>
            </div>
          </div>
        ) : null}

        {!ready ? (
          <div className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn">
            اكتب نصّ دعوتك واختر قالبك من تبويب «دعوتي» قبل الإرسال.
          </div>
        ) : null}

        {manual && names ? (
          <ManualMessageEditor
            config={config}
            onConfigChange={setConfig}
            names={names}
            signBy={signBy}
            onSignByChange={setSignBy}
            sample={{
              guestName: sampleGuest?.name ?? 'خالد الفهد',
              occasion: manual.occasion,
              date: manual.date,
              venue: manual.venue,
              link: `${appUrl}/rsvp/${sampleGuest?.invite_token ?? '…'}`,
            }}
            save={(c, s) => saveInviterManualMessage(inviterId, c, s)}
            attachment={
              <AttachmentBox
                uid={manual.uid} folder={inviterId} initial={manual.attachment}
                save={(mode, path) => saveInviterAttachment(inviterId, mode, path)}
              />
            }
          />
        ) : null}

        {guests.length > 0 ? (
          <p className="px-1 text-[13px] text-muted">
            النتيجة: <span className="num text-[15px] font-bold text-ink">{visible.length}</span> مدعو
            {' · '}
            <span className="num text-[15px] font-bold text-ink">
              {visible.reduce((sum, g) => sum + (g.confirmed_seats ?? g.max_seats), 0)}
            </span> مقعد
            {visible.length !== guests.length ? <span> — من أصل <span className="num">{guests.length}</span></span> : null}
          </p>
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
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <GuestStatusBadge status={g.status} />
                        {g.reminded_at ? (
                          <span className="badge border border-line bg-panel text-muted">ذُكّر</span>
                        ) : null}
                        {g.opened_at ? (
                          <span className="badge bg-brand-soft text-brand" title={`فتح الرابط ${formatDateTime(g.opened_at)}`}>
                            فتح الدعوة
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="num text-[12px] text-muted">
                      {formatDateTime(lastUpdate(g))}
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
                        {manual && ((g.status === 'draft' && canSend && ready) || g.status === 'sent') ? (
                          <WhatsAppSendLink
                            href={buildWhatsAppUrl(g.phone, buildMessage(templateText(config), {
                              guestName: g.name, occasion: manual.occasion, date: manual.date,
                              venue: manual.venue, signature, link: `${appUrl}/rsvp/${g.invite_token}`,
                            }))}
                            markSent={g.status === 'draft' ? () => markInviterGuestManualSent(inviterId, g.id) : undefined}
                            label={g.status === 'sent' ? 'إرسال مرة أخرى' : 'واتساب'}
                          />
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
