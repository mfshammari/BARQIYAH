'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatNumber } from '@/lib/format';
import { MiniStats, NoticeBar, StatTriple } from '@/components/ui';
import {
  TEMPLATE_VARIABLES, buildMessage, buildWhatsAppUrl, computeSeatBalance,
  defaultTemplateText, guestLink, isValidE164, joinNames, resolveInviterNames, resolveSignature,
} from '@/lib/manual-whatsapp/message';
import {
  getEvent, getSettings, listGuests, listTemplates, markSent, saveSettings, saveTemplate,
} from '@/lib/manual-whatsapp/mock';
import {
  SIGN_BY_LABELS, type EventInfo, type Guest, type MessageTemplate, type SignBy, type Viewer,
} from '@/lib/manual-whatsapp/types';
import { StatusBadge } from './StatusBadge';

const SIGN_OPTIONS: SignBy[] = ['both', 'owner', 'sub'];

/**
 * شاشة المدعوين للإرسال اليدوي عبر واتساب.
 * كل الاتصالات عبر stubs المحاكاة في lib/manual-whatsapp/mock.ts.
 */
export function ManualWhatsAppDashboard({ eventId, viewer }: { eventId: string; viewer: Viewer }) {
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateId, setTemplateId] = useState('formal');
  const [subChoice, setSubChoice] = useState<SignBy>('sub');
  const [previewGuestId, setPreviewGuestId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<MessageTemplate | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setBaseUrl(window.location.origin);
    let alive = true;
    (async () => {
      const [ev, gs, ts, st] = await Promise.all([
        getEvent(eventId), listGuests(eventId), listTemplates(eventId), getSettings(eventId),
      ]);
      if (!alive) return;
      setEvent(ev); setGuests(gs); setTemplates(ts);
      setTemplateId(st.templateId); setSubChoice(st.signBy);
      setPreviewGuestId(gs[0]?.id ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [eventId]);

  // تعديل لم يُحفظ بعد (المؤقّت لم يُطلق) يُحفظ عند مغادرة الشاشة
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (pendingSave.current) void saveTemplate(eventId, pendingSave.current);
  }, [eventId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // من حساب صاحب المناسبة تصدر الدعوة باسمه فقط؛ من حساب الداعي الفرعي يُطبَّق اختياره
  const signBy: SignBy = viewer === 'owner' ? 'owner' : subChoice;
  const template = templates.find((t) => t.id === templateId) ?? templates[0];
  const balance = useMemo(() => computeSeatBalance(guests, event?.packageSeats ?? 0), [guests, event]);
  const previewGuest = guests.find((g) => g.id === previewGuestId) ?? guests[0];

  const messageFor = useCallback((g: Guest) => {
    if (!event || !template) return '';
    return buildMessage(template.text, g, event, signBy, guestLink(baseUrl, g.token));
  }, [event, template, signBy, baseUrl]);

  function selectTemplate(id: string) {
    setTemplateId(id);
    void saveSettings(eventId, { templateId: id });
  }

  function chooseSign(v: SignBy) {
    setSubChoice(v);
    void saveSettings(eventId, { signBy: v });
  }

  function updateTemplateText(text: string) {
    if (!template) return;
    const next = { ...template, text };
    setTemplates((prev) => prev.map((t) => (t.id === next.id ? next : t)));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pendingSave.current = next;
    saveTimer.current = setTimeout(() => {
      pendingSave.current = null;
      void saveTemplate(eventId, next);
    }, 400);
  }

  function insertVariable(v: string) {
    const el = textareaRef.current;
    if (!template) return;
    if (!el) { updateTemplateText(`${template.text}${v}`); return; }
    const start = el.selectionStart ?? template.text.length;
    const end = el.selectionEnd ?? start;
    const text = template.text.slice(0, start) + v + template.text.slice(end);
    updateTemplateText(text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + v.length, start + v.length);
    });
  }

  async function onWhatsAppClick(g: Guest) {
    // تفاؤلي: المسودة تصير «بانتظار» فور الضغط وتُحجز مقاعدها
    if (g.status === 'draft') {
      setGuests((prev) => prev.map((x) => (x.id === g.id ? { ...x, status: 'pending' } : x)));
    }
    const updated = await markSent(g.id);
    setGuests((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  }

  async function copyLink(g: Guest) {
    const link = guestLink(baseUrl, g.token);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = link; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setToast('نُسخ الرابط');
  }

  if (loading || !event || !template) {
    return <div className="card card-pad text-center text-[13px] text-muted">جارٍ تحميل المدعوين…</div>;
  }

  const pct = (n: number) => (event.packageSeats ? Math.min(100, (n / event.packageSeats) * 100) : 0);
  const inviterNames = resolveInviterNames(event, signBy);
  const previewMessage = previewGuest ? messageFor(previewGuest) : '';
  const previewLink = previewGuest ? guestLink(baseUrl, previewGuest.token) : '';

  return (
    <div className="space-y-5">
      <NoticeBar tone="info" title="الإرسال الآلي عبر واتساب قيد الربط">
        إلى أن يكتمل، أرسل كل دعوة من واتساب جوالك بضغطة واحدة. المدعو يفتح رابطه الخاص ويؤكد حضوره منه.
      </NoticeBar>

      {/* رصيد المقاعد */}
      <section className="card card-pad">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="sec-title">رصيد المقاعد</h2>
          <span className="text-[12.5px] text-muted">
            من أصل <b className="num text-ink">{formatNumber(event.packageSeats)}</b> مقعد
          </span>
        </div>
        <StatTriple items={[
          { tone: 'g', label: 'متاح', value: formatNumber(balance.available) },
          { tone: 'd', label: 'محجوز', value: formatNumber(balance.reserved) },
          { tone: 'n', label: 'مؤكّد', value: formatNumber(balance.confirmed) },
        ]} />
        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full border border-line bg-panel" aria-hidden>
          <div className="h-full bg-ok" style={{ width: `${pct(balance.confirmed)}%` }} />
          <div className="h-full bg-warn" style={{ width: `${pct(balance.reserved)}%` }} />
        </div>
        <div className="mt-4">
          <MiniStats items={[
            { label: 'مدعو', value: formatNumber(balance.invited) },
            { label: 'مُرسل', value: formatNumber(balance.sent) },
            { label: 'أكّد', value: formatNumber(balance.confirmedCount) },
            { label: 'اعتذر', value: formatNumber(balance.declinedCount) },
          ]} />
        </div>
      </section>

      {/* جدول المدعوين */}
      <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
            <h2 className="sec-title">المدعوون</h2>
            <span className="text-[12.5px] text-muted">القالب: <b className="text-ink">{template.name}</b></span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="tbl-tight">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>المقاعد</th>
                  <th>الحالة</th>
                  <th>الدعوة</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => {
                  const valid = isValidE164(g.phoneE164);
                  const sent = g.status !== 'draft';
                  const answered = g.status === 'confirmed' || g.status === 'attended';
                  return (
                    <tr key={g.id}>
                      <td>
                        <div className="font-semibold text-ink">{g.name}</div>
                        <div dir="ltr" className="text-left text-[12px] text-muted">{g.phoneE164}</div>
                      </td>
                      <td className="num whitespace-nowrap">
                        {answered
                          ? <><b>{formatNumber(g.attendees)}</b> <span className="text-muted">من {formatNumber(g.maxSeats)}</span></>
                          : formatNumber(g.maxSeats)}
                      </td>
                      <td><StatusBadge status={g.status} /></td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
                          {valid ? (
                            <a
                              href={buildWhatsAppUrl(g.phoneE164, messageFor(g))}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => { void onWhatsAppClick(g); }}
                              className={sent ? 'btn-soft btn-sm' : 'btn-primary btn-sm'}
                            >
                              {sent ? 'إعادة إرسال' : 'واتساب'}
                            </a>
                          ) : (
                            <button type="button" disabled className="btn-ghost btn-sm">رقم غير صحيح</button>
                          )}
                          <button type="button" onClick={() => { void copyLink(g); }} className="btn-ghost btn-sm">
                            نسخ الرابط
                          </button>
                          <a
                            href={guestLink('', g.token)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-ghost btn-sm"
                          >
                            معاينة
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 pb-4 pt-3 text-[12.5px] leading-7 text-muted sm:px-5">
            «بانتظار» تعني أن زر واتساب ضُغط لهذا المدعو وحُجزت مقاعده، وليست تأكيد وصول.
          </p>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
          {/* الدعوة باسم */}
          <section className="card card-pad">
            <h2 className="sec-title mb-3">الدعوة باسم</h2>
            {viewer === 'owner' ? (
              <>
                <div className="rounded-xl bg-brand-soft px-3.5 py-3">
                  <div className="text-[11.5px] text-brand/80">صاحب المناسبة</div>
                  <div className="text-[15px] font-bold text-brand">{event.ownerName}</div>
                </div>
                <p className="hint mt-2">من حساب صاحب المناسبة تصدر الدعوة باسمه فقط.</p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="الدعوة باسم">
                  {SIGN_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      role="radio"
                      aria-checked={subChoice === opt}
                      onClick={() => chooseSign(opt)}
                      className={subChoice === opt ? 'tab-on' : 'tab'}
                    >
                      {SIGN_BY_LABELS[opt]}
                    </button>
                  ))}
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-2 text-[13px]">
                  <div className="rounded-xl border border-line bg-paper px-3.5 py-2.5">
                    <dt className="text-[11.5px] text-muted">صاحب المناسبة</dt>
                    <dd className="font-semibold text-ink">{event.ownerName}</dd>
                  </div>
                  <div className="rounded-xl border border-line bg-paper px-3.5 py-2.5">
                    <dt className="text-[11.5px] text-muted">الداعي الفرعي</dt>
                    <dd className="font-semibold text-ink">{event.subInviterName ?? '—'}</dd>
                  </div>
                </dl>
                <p className="hint mt-2">من حساب الداعي الفرعي يختار الاسم الذي تصدر به الدعوة.</p>
              </>
            )}
            <div className="mt-3 border-t border-line pt-3 text-[12.5px] text-muted">
              تصدر الدعوة باسم <b className="text-brand">{joinNames(inviterNames)}</b>
              <span className="mx-1">·</span>
              <span className="text-ink">{resolveSignature(event, signBy)}</span>
            </div>
          </section>

          {/* قالب رسالة واتساب */}
          <section className="card card-pad">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="sec-title">قالب رسالة واتساب</h2>
              <button type="button" onClick={() => setEditing((v) => !v)} className="btn-ghost btn-sm">
                {editing ? 'إغلاق التعديل' : 'تعديل القالب'}
              </button>
            </div>

            <div className="tabs-row !mb-3">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTemplate(t.id)}
                  className={t.id === template.id ? 'tab-on' : 'tab'}
                >
                  {t.name}
                </button>
              ))}
            </div>

            {editing ? (
              <div className="mb-4 space-y-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="rounded-lg border border-gold-line bg-paper px-2 py-1 text-[12px] font-semibold text-brand hover:border-gold"
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  value={template.text}
                  onChange={(e) => updateTemplateText(e.target.value)}
                  rows={10}
                  className="field min-h-[220px] resize-y leading-7"
                  aria-label={`نص قالب ${template.name}`}
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => updateTemplateText(defaultTemplateText(template.id))}
                    className="text-[12.5px] font-semibold text-brand hover:underline"
                  >
                    استرجاع نص القالب الأصلي
                  </button>
                  {!template.text.includes('{الرابط}') ? (
                    <span className="badge bg-warn-soft text-warn">سيُضاف الرابط آخر الرسالة</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {previewGuest ? (
              <>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
                  <span>الرسالة كما تصل إلى {previewGuest.name}</span>
                  {guests.length > 1 ? (
                    <select
                      value={previewGuest.id}
                      onChange={(e) => setPreviewGuestId(e.target.value)}
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-[12px] text-ink"
                      aria-label="معاينة باسم"
                    >
                      {guests.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  ) : null}
                </div>
                <WhatsAppBubble message={previewMessage} link={previewLink} />
              </>
            ) : null}

            <p className="hint mt-3 leading-6">
              كل قالب ينتهي برابط المدعو الخاص في برقية، وفيه تفاصيل الزواج وتأكيد الحضور. إن حُذف الرابط من النص يُضاف تلقائيًا في آخر الرسالة.
            </p>
          </section>
      </div>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 start-1/2 z-50 -translate-x-1/2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white shadow-pop"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

/** فقاعة بأسلوب واتساب — الرابط مميّز ويبقى LTR */
function WhatsAppBubble({ message, link }: { message: string; link: string }) {
  const parts = link ? message.split(link) : [message];
  return (
    <div className="rounded-2xl bg-panel p-3">
      <div className="relative me-6 rounded-xl rounded-tr-sm bg-brand-soft px-3.5 py-2.5 text-[13.5px] leading-7 text-ink shadow-card">
        <span className="absolute -top-px -right-1.5 h-0 w-0 border-[7px] border-transparent border-t-brand-soft" aria-hidden
          style={{ borderTopColor: 'rgb(var(--brand-soft))' }} />
        <p className="whitespace-pre-wrap break-words">
          {parts.map((p, i) => (
            <span key={i}>
              {p}
              {i < parts.length - 1 ? (
                <span dir="ltr" className="inline-block rounded bg-info-soft px-1 font-semibold text-info break-all">{link}</span>
              ) : null}
            </span>
          ))}
        </p>
        <div className="mt-1 text-left text-[10.5px] text-muted" dir="ltr">✓✓</div>
      </div>
    </div>
  );
}
