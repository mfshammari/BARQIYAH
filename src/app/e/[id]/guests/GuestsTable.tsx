'use client';

import { useActionState, useMemo, useState } from 'react';
import { GuestStatusBadge, EmptyState } from '@/components/ui';
import { SubmitButton } from '@/components/ActionForm';
import { formatDateTime } from '@/lib/format';
import { GUEST_STATUS_LABELS, type Guest, type GuestStatus, type Inviter } from '@/lib/types';
import { WhatsAppSendLink } from '@/components/WhatsAppSendLink';
import { buildWhatsAppUrl } from '@/lib/manualInvite';
import { buildMessage } from '@/lib/manualMessage';
import { deleteGuest, markGuestManualSent, sendGuestInvitations, updateGuest, type ActionState } from '../actions';

const FILTERS: { key: GuestStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'draft', label: GUEST_STATUS_LABELS.draft },
  { key: 'sent', label: GUEST_STATUS_LABELS.sent },
  { key: 'accepted', label: GUEST_STATUS_LABELS.accepted },
  { key: 'declined', label: GUEST_STATUS_LABELS.declined },
  { key: 'attended', label: GUEST_STATUS_LABELS.attended },
  { key: 'expired', label: GUEST_STATUS_LABELS.expired },
];

/** تصفية فتح الدعوة: «لم يفتح» = أُرسلت له ولم يفتح رابطه (المسودة لم تُرسل أصلاً) */
type OpenedFilter = 'all' | 'opened' | 'unopened';
/** ترتيب «آخر تحديث»: none = ترتيب القائمة الأصلي */
type UpdatedSort = 'none' | 'desc' | 'asc';

/** آخر ما جرى على الدعوة: حضور، ردّ، فتح، تذكير، إرسال — وإلا تاريخ الإضافة */
function lastUpdate(g: Guest): string {
  const stamps = [g.attended_at, g.responded_at, g.opened_at, g.reminded_at, g.sent_at, g.created_at]
    .filter(Boolean) as string[];
  return stamps.reduce((latest, t) => (Date.parse(t) > Date.parse(latest) ? t : latest), g.created_at);
}

function isUnopened(g: Guest): boolean {
  return g.status !== 'draft' && !g.opened_at;
}

/** قيمة تصفية «بلا تقسيمة» — لا تتعارض مع اسم تقسيمة حقيقي */
const NO_SECTION = '\u0000none';

export function GuestsTable({
  eventId, guests, inviters, appUrl, canSend, manual,
}: {
  /** رسالة واتساب اليدوية: المتغيّرات ونصّ القالب المختار — null إن لم يكتب المالك دعوته بعد */
  manual: { occasion: string; date: string; venue: string; signature: string; text: string } | null;
  eventId: string;
  guests: Guest[];
  inviters: Inviter[];
  appUrl: string;
  canSend: boolean;
}) {
  const [filter, setFilter] = useState<GuestStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  /** '' = كل التقسيمات */
  const [section, setSection] = useState('');
  /** '' = كل فروع التقسيمة المختارة */
  const [branch, setBranch] = useState('');
  const [opened, setOpened] = useState<OpenedFilter>('all');
  const [sort, setSort] = useState<UpdatedSort>('none');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Guest | null>(null);
  const [sendState, sendAction] = useActionState<ActionState, FormData>(sendGuestInvitations, {});

  const inviterName = useMemo(
    () => new Map(inviters.map((i) => [i.id, i.name])),
    [inviters],
  );

  // التقسيمات من الأكبر إلى الأصغر، مع عدد المدعوين والمقاعد وفروع كل تقسيمة
  const sections = useMemo(() => {
    const map = new Map<string, { name: string; count: number; seats: number; branches: Map<string, number> }>();
    let none = 0;
    for (const g of guests) {
      if (!g.section) { none++; continue; }
      let s = map.get(g.section);
      if (!s) { s = { name: g.section, count: 0, seats: 0, branches: new Map() }; map.set(g.section, s); }
      s.count++;
      s.seats += g.confirmed_seats ?? g.max_seats;
      if (g.branch) s.branches.set(g.branch, (s.branches.get(g.branch) ?? 0) + 1);
    }
    return { list: Array.from(map.values()).sort((a, b) => b.count - a.count), none };
  }, [guests]);

  const activeSection = sections.list.find((s) => s.name === section);
  const sectionNames = sections.list.map((s) => s.name);
  const branchNames = useMemo(
    () => Array.from(new Set(guests.map((g) => g.branch).filter(Boolean) as string[])),
    [guests],
  );

  function chooseSection(next: string) {
    setSection(next);
    setBranch('');
    setSelected(new Set());
  }

  const visible = useMemo(() => {
    const q = query.trim();
    const rows = guests.filter((g) => {
      if (filter !== 'all' && g.status !== filter) return false;
      if (opened === 'opened' && !g.opened_at) return false;
      if (opened === 'unopened' && !isUnopened(g)) return false;
      if (section === NO_SECTION ? g.section : section && g.section !== section) return false;
      if (branch && g.branch !== branch) return false;
      if (!q) return true;
      return g.name.includes(q) || g.phone.includes(q)
        || (g.section ?? '').includes(q) || (g.branch ?? '').includes(q);
    });
    if (sort === 'none') return rows;
    const dir = sort === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const x = Date.parse(lastUpdate(a)), y = Date.parse(lastUpdate(b));
      return x === y ? 0 : (x > y ? dir : -dir);
    });
  }, [guests, filter, query, section, branch, opened, sort]);

  const openedCount = useMemo(() => guests.filter((g) => g.opened_at).length, [guests]);
  const unopenedCount = useMemo(() => guests.filter(isUnopened).length, [guests]);

  const selectableIds = visible.filter((g) => g.status === 'draft').map((g) => g.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  const draftCount = guests.filter((g) => g.status === 'draft').length;
  const selectedCount = selected.size;

  return (
    <div className="space-y-4">
      {sendState.error ? (
        <div className="rounded-xl bg-danger-soft text-danger px-3.5 py-2.5 text-[13px]">{sendState.error}</div>
      ) : null}
      {sendState.notice ? (
        <div className="rounded-xl bg-ok-soft text-ok px-3.5 py-2.5 text-[13px]">{sendState.notice}</div>
      ) : null}

      <div className="card card-pad space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const count = f.key === 'all' ? guests.length : guests.filter((g) => g.status === f.key).length;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  filter === f.key ? 'bg-brand text-white' : 'bg-panel text-muted hover:text-ink border border-line'
                }`}
              >
                {f.label} <span className="num opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        {sections.list.length > 0 ? (
          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-semibold text-muted me-1">التقسيمات</span>
              <SectionChip active={section === ''} onClick={() => chooseSection('')}
                label="الكل" count={guests.length} />
              {sections.list.map((s) => (
                <SectionChip key={s.name} active={section === s.name} onClick={() => chooseSection(s.name)}
                  label={s.name} count={s.count} />
              ))}
              {sections.none > 0 ? (
                <SectionChip active={section === NO_SECTION} onClick={() => chooseSection(NO_SECTION)}
                  label="بلا تقسيمة" count={sections.none} />
              ) : null}
            </div>

            {activeSection ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {activeSection.branches.size > 0 ? (
                  <>
                    <span className="text-[12px] font-semibold text-muted me-1">الفروع</span>
                    <SectionChip active={branch === ''} onClick={() => setBranch('')}
                      label="كل الفروع" count={activeSection.count} />
                    {Array.from(activeSection.branches).map(([name, count]) => (
                      <SectionChip key={name} active={branch === name} onClick={() => setBranch(name)}
                        label={name} count={count} />
                    ))}
                  </>
                ) : null}
                <span className="text-[12px] text-muted ms-auto">
                  {activeSection.name}: <span className="num font-semibold text-ink">{activeSection.count}</span> مدعو
                  {' · '}<span className="num font-semibold text-ink">{activeSection.seats}</span> مقعد
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <span className="text-[12px] font-semibold text-muted me-1">فتح الدعوة</span>
          <SectionChip active={opened === 'all'} onClick={() => { setOpened('all'); setSelected(new Set()); }}
            label="الكل" count={guests.length} />
          <SectionChip active={opened === 'opened'} onClick={() => { setOpened('opened'); setSelected(new Set()); }}
            label="فتح الدعوة" count={openedCount} />
          <SectionChip active={opened === 'unopened'} onClick={() => { setOpened('unopened'); setSelected(new Set()); }}
            label="لم يفتح" count={unopenedCount} />

          <label className="ms-auto flex items-center gap-1.5 text-[12px] font-semibold text-muted">
            الترتيب
            <select
              className="field !w-auto !py-1 text-[12px]"
              value={sort}
              onChange={(e) => setSort(e.target.value as UpdatedSort)}
            >
              <option value="none">ترتيب الإضافة</option>
              <option value="desc">الأحدث تحديثاً</option>
              <option value="asc">الأقدم تحديثاً</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="field flex-1 min-w-[180px]"
            placeholder="بحث بالاسم أو الجوال أو التقسيمة…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {canSend ? (
            <>
              <form action={sendAction}>
                <input type="hidden" name="event_id" value={eventId} />
                <input type="hidden" name="scope" value="selected" />
                {Array.from(selected).map((id) => (
                  <input key={id} type="hidden" name="guest_ids" value={id} />
                ))}
                <SubmitButton
                  className={`btn-primary ${selectedCount === 0 ? 'pointer-events-none opacity-50' : ''}`}
                  pendingLabel="جارٍ الإرسال…"
                >
                  إرسال المحدَّد <span className="num">({selectedCount})</span>
                </SubmitButton>
              </form>

              <form action={sendAction}>
                <input type="hidden" name="event_id" value={eventId} />
                <input type="hidden" name="scope" value="all_drafts" />
                <SubmitButton
                  className={`btn-gold ${draftCount === 0 ? 'pointer-events-none opacity-50' : ''}`}
                  pendingLabel="جارٍ الإرسال…"
                >
                  إرسال كل المسودّات <span className="num">({draftCount})</span>
                </SubmitButton>
              </form>
            </>
          ) : null}
        </div>

        {!canSend ? (
          <p className="text-[12.5px] text-warn bg-warn-soft rounded-xl px-3 py-2">
            الإرسال متوقف حتى تُفعّل الإدارة الباقة ويُضاف رصيد المقاعد.
          </p>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="لا يوجد مدعوون مطابقون"
          description={guests.length === 0 ? 'أضف مدعوين يدوياً أو ارفع ملف Excel.' : 'جرّب تغيير التصفية أو البحث.'}
        />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox" checked={allSelected} onChange={toggleAll}
                    disabled={selectableIds.length === 0}
                    className="accent-brand" aria-label="تحديد الكل"
                  />
                </th>
                <th>الاسم</th>
                <th>التقسيمة</th>
                <th>الجوال</th>
                <th>المقاعد</th>
                <th>الداعي</th>
                <th>الحالة</th>
                <th>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold hover:text-ink"
                    title="رتّب بتاريخ آخر تحديث"
                    onClick={() => setSort(sort === 'desc' ? 'asc' : sort === 'asc' ? 'none' : 'desc')}
                  >
                    آخر تحديث
                    <span className="num text-[10px]">{sort === 'desc' ? '▼' : sort === 'asc' ? '▲' : '↕'}</span>
                  </button>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((g) => (
                <tr key={g.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(g.id)}
                      onChange={() => toggle(g.id)}
                      disabled={g.status !== 'draft'}
                      className="accent-brand"
                      aria-label={`تحديد ${g.name}`}
                    />
                  </td>
                  <td className="font-semibold">{g.name}</td>
                  <td className="text-[12.5px]">
                    {g.section ? (
                      <>
                        <span className="badge bg-brand-soft text-brand">{g.section}</span>
                        {g.branch ? <span className="text-muted ms-1.5">{g.branch}</span> : null}
                      </>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="num text-muted" dir="ltr">{g.phone}</td>
                  <td>
                    <span className="num font-semibold">
                      {g.confirmed_seats ?? g.max_seats}
                    </span>
                    <span className="text-[11.5px] text-muted">
                      {g.confirmed_seats != null ? ` مؤكّد / ${g.max_seats} حد أقصى` : ' حد أقصى'}
                    </span>
                    {g.status === 'attended' || g.scans_used > 0 ? (
                      <div className="text-[11px] text-brand num">مُسح {g.scans_used} من {g.confirmed_seats ?? 0}</div>
                    ) : null}
                  </td>
                  <td className="text-muted text-[12.5px]">{g.inviter_id ? inviterName.get(g.inviter_id) ?? '—' : '—'}</td>
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
                  <td className="text-muted text-[12px] num">
                    {formatDateTime(lastUpdate(g))}
                  </td>
                  <td>
                    <div className="flex gap-1.5 justify-end">
                      {g.status === 'draft' && canSend ? (
                        <form action={sendAction}>
                          <input type="hidden" name="event_id" value={eventId} />
                          <input type="hidden" name="scope" value="selected" />
                          <input type="hidden" name="guest_ids" value={g.id} />
                          <SubmitButton className="btn-soft btn-sm" pendingLabel="…">إرسال</SubmitButton>
                        </form>
                      ) : null}

                      {manual && ((g.status === 'draft' && canSend) || g.status === 'sent') ? (
                        <WhatsAppSendLink
                          href={buildWhatsAppUrl(g.phone, buildMessage(manual.text, {
                            guestName: g.name, occasion: manual.occasion, date: manual.date,
                            venue: manual.venue, signature: manual.signature,
                            link: `${appUrl}/rsvp/${g.invite_token}`,
                          }))}
                          markSent={g.status === 'draft' ? () => markGuestManualSent(eventId, g.id) : undefined}
                          label={g.status === 'sent' ? 'إرسال مرة أخرى' : 'واتساب'}
                        />
                      ) : null}

                      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(g)}>
                        تعديل
                      </button>

                      {g.status === 'accepted' || g.status === 'attended' ? (
                        <a
                          href={`${appUrl}/i/${g.qr_token}`}
                          target="_blank" rel="noreferrer"
                          className="btn-ghost btn-sm"
                        >
                          الباركود
                        </a>
                      ) : (
                        <a
                          href={`${appUrl}/rsvp/${g.invite_token}`}
                          target="_blank" rel="noreferrer"
                          className="btn-ghost btn-sm"
                        >
                          صفحة الرد
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <EditGuestDialog
          eventId={eventId}
          guest={editing}
          inviters={inviters}
          sectionNames={sectionNames}
          branchNames={branchNames}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function SectionChip({
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

function EditGuestDialog({
  eventId, guest, inviters, sectionNames, branchNames, onClose,
}: {
  eventId: string; guest: Guest; inviters: Inviter[];
  sectionNames: string[]; branchNames: string[]; onClose: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(updateGuest, {});

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 grid place-items-center p-4" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <h3 className="sec-title">تعديل المدعو</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-lg leading-none">×</button>
        </div>

        <form action={action} className="card-pad space-y-4">
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="guest_id" value={guest.id} />

          {state.error ? (
            <div className="rounded-xl bg-danger-soft text-danger px-3.5 py-2.5 text-[13px]">{state.error}</div>
          ) : null}
          {state.notice ? (
            <div className="rounded-xl bg-ok-soft text-ok px-3.5 py-2.5 text-[13px]">{state.notice}</div>
          ) : null}

          <div>
            <label className="label">الاسم</label>
            <input name="name" className="field" defaultValue={guest.name} required />
          </div>
          <div>
            <label className="label">الجوال</label>
            <input className="field num text-left" dir="ltr" defaultValue={guest.phone} disabled />
            <p className="hint">لا يمكن تغيير الرقم بعد الإضافة — احذف المدعو وأضفه من جديد.</p>
          </div>
          <div>
            <label className="label">عدد الأشخاص (الحد الأقصى في الدعوة)</label>
            <input name="max_seats" type="number" min={1} max={50} className="field num" defaultValue={guest.max_seats} required />
            {guest.status === 'sent' ? (
              <p className="hint text-warn">هذه الدعوة محجوزة بالحد الأقصى الحالي — تغييره يغيّر الحجز.</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">التقسيمة</label>
              <input name="section" className="field" list="edit-guest-sections"
                defaultValue={guest.section ?? ''} maxLength={60} />
              <datalist id="edit-guest-sections">
                {sectionNames.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="label">الفرع</label>
              <input name="branch" className="field" list="edit-guest-branches"
                defaultValue={guest.branch ?? ''} maxLength={60} />
              <datalist id="edit-guest-branches">
                {branchNames.map((b) => <option key={b} value={b} />)}
              </datalist>
            </div>
          </div>
          <div>
            <label className="label">الداعي</label>
            <select name="inviter_id" className="field" defaultValue={guest.inviter_id ?? ''}>
              <option value="">— بدون —</option>
              {inviters.map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.role_label})</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 justify-between pt-1">
            <SubmitButton className="btn-primary">حفظ التعديل</SubmitButton>
            <button
              type="submit"
              formAction={deleteGuest}
              className="btn-danger"
              onClick={(e) => {
                if (!confirm(`حذف «${guest.name}» نهائياً؟`)) e.preventDefault();
              }}
            >
              حذف المدعو
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
