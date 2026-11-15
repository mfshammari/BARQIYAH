'use client';

import { useRef, useState, useTransition } from 'react';
import {
  DEFAULT_TEMPLATES, LINK_VAR, SIGN_BY, SIGN_BY_LABELS, TEMPLATE_IDS, TEMPLATE_VARIABLES,
  buildMessage, resolveSignature, templateText, validateTemplateText, withTemplateText,
  type ManualMessageConfig, type MessageTemplateId, type SignBy, type SignatureNames,
} from '@/lib/manualMessage';

export interface ManualMessageSample {
  guestName: string;
  occasion: string;
  date: string;
  venue: string;
  link: string;
}

interface SaveResult { error?: string; notice?: string }

/**
 * محرّر نصّ رسالة واتساب اليدوية (الحل المؤقّت): ثلاثة قوالب، تعديل النص
 * بمتغيّرات، التوقيع، ومعاينة الرسالة كما تصل. الحفظ صريح بزر، والتعديل
 * غير المحفوظ يُستخدم فوراً في أزرار «واتساب» بالجدول.
 *
 * التوقيع: من حساب صاحب المناسبة باسمه فقط (لا خيار)؛ من حساب الداعي الفرعي
 * خيار الاثنين / صاحب المناسبة / الداعي الفرعي — يُمرَّر onSignByChange.
 */
export function ManualMessageEditor({
  config, onConfigChange, names, signBy, onSignByChange, sample, save,
}: {
  config: ManualMessageConfig;
  onConfigChange: (c: ManualMessageConfig) => void;
  names: SignatureNames;
  /** التوقيع الحالي — للداعي الفرعي فقط؛ صاحب المناسبة ثابت على 'owner' */
  signBy?: SignBy;
  onSignByChange?: (s: SignBy) => void;
  sample: ManualMessageSample;
  save: (config: ManualMessageConfig, signBy: SignBy) => Promise<SaveResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<SaveResult>({});
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const effectiveSign: SignBy = onSignByChange ? (signBy ?? 'both') : 'owner';
  const text = templateText(config);
  const signature = resolveSignature(names, effectiveSign);
  const issue = validateTemplateText(text);
  const preview = buildMessage(text, { ...sample, signature });

  function update(next: ManualMessageConfig) {
    onConfigChange(next);
    setDirty(true);
    setResult({});
  }

  function selectTemplate(id: MessageTemplateId) {
    update({ ...config, template: id });
  }

  function setText(value: string) {
    update(withTemplateText(config, config.template, value));
  }

  function insertVariable(v: string) {
    const el = textareaRef.current;
    if (!el) { setText(`${text}${v}`); return; }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? start;
    setText(text.slice(0, start) + v + text.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + v.length, start + v.length);
    });
  }

  function onSave() {
    if (issue) { setResult({ error: issue }); return; }
    startTransition(async () => {
      try {
        const r = await save(config, effectiveSign);
        setResult(r);
        if (!r.error) setDirty(false);
      } catch {
        setResult({ error: 'تعذّر الحفظ. حدّث الصفحة وحاول مرة أخرى.' });
      }
    });
  }

  return (
    <section className="card card-pad space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="sec-title">رسالة واتساب</h2>
          <p className="text-[12.5px] text-muted">
            النص الذي يفتح جاهزاً عند ضغط «واتساب» بجانب كل مدعو — وكل رسالة تحمل رابط المدعو الخاص.
          </p>
        </div>
        <button type="button" onClick={() => setEditing((v) => !v)} className="btn-ghost btn-sm">
          {editing ? 'إغلاق التعديل' : 'تعديل النص'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="قالب الرسالة">
        {TEMPLATE_IDS.map((id) => (
          <button
            key={id} type="button" role="tab" aria-selected={id === config.template}
            onClick={() => selectTemplate(id)}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              id === config.template ? 'bg-brand text-white' : 'bg-panel text-muted hover:text-ink border border-line'
            }`}
          >
            {DEFAULT_TEMPLATES[id].name}
            {config.texts[id] ? <span className="opacity-70"> · معدَّل</span> : null}
          </button>
        ))}
      </div>

      {onSignByChange ? (
        <div>
          <span className="label">تصدر الدعوة باسم</span>
          <div className="flex flex-wrap gap-1.5">
            {SIGN_BY.map((s) => (
              <button
                key={s} type="button"
                onClick={() => { onSignByChange(s); setDirty(true); setResult({}); }}
                className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  s === effectiveSign ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:text-ink'
                }`}
              >
                {SIGN_BY_LABELS[s]}
              </button>
            ))}
          </div>
          <p className="hint">الأسماء من الحسابات: صاحب المناسبة <b>{names.ownerName}</b>{names.subName ? <> والداعي الفرعي <b>{names.subName}</b></> : null}.</p>
        </div>
      ) : (
        <p className="text-[12.5px] text-muted">
          تصدر الدعوة باسم حسابك: <b className="text-ink">{names.ownerName}</b>
        </p>
      )}

      {editing ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v} type="button" onClick={() => insertVariable(v)}
                className="rounded-lg border border-line bg-paper px-2 py-1 text-[12px] font-semibold text-brand hover:border-brand"
              >
                {v}
              </button>
            ))}
          </div>
          <textarea
            ref={textareaRef} value={text} onChange={(e) => setText(e.target.value)}
            rows={10} dir="auto"
            className="field min-h-[200px] resize-y leading-7"
            aria-label={`نص قالب ${DEFAULT_TEMPLATES[config.template].name}`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setText(DEFAULT_TEMPLATES[config.template].text)}
              className="text-[12.5px] font-semibold text-brand hover:underline"
              disabled={!config.texts[config.template]}
            >
              استرجاع النص الأصلي
            </button>
            {!text.includes(LINK_VAR) ? (
              <span className="badge bg-warn-soft text-warn">سيُضاف الرابط آخر الرسالة تلقائياً</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-1 text-[12px] text-muted">المعاينة كما تصل إلى {sample.guestName}</div>
        <div
          dir="auto"
          className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-[#e7ffdb] px-3.5 py-2.5 text-[13px] leading-6 text-[#111b21]"
        >
          {preview}
        </div>
      </div>

      {result.error ? (
        <div className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{result.error}</div>
      ) : null}
      {result.notice ? (
        <div className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-[13px] text-ok">{result.notice}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button" onClick={onSave} disabled={pending || !dirty}
          className={`btn-primary btn-sm ${!dirty ? 'opacity-50' : ''}`}
          aria-busy={pending}
        >
          {pending ? 'جارٍ الحفظ…' : 'حفظ الرسالة'}
        </button>
        {dirty && !pending ? <span className="text-[12px] text-warn">تعديلات غير محفوظة — تُستخدم في الأزرار الآن وتُفقد بتحديث الصفحة.</span> : null}
      </div>
    </section>
  );
}
