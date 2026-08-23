'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { BulkBar, ConfirmButton } from '@/components/BulkBar';
import { TemplateStatusBadge } from '@/components/ui';
import { bulkReviewTemplates, type ActionState } from './actions';
import { formatDateTime } from '@/lib/format';
import type { Template } from '@/lib/types';

interface Row extends Template {
  ownerName: string | null;
}

export function BulkReview({ requests }: { requests: Row[] }) {
  const [state, action] = useActionState<ActionState, FormData>(bulkReviewTemplates, {});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [pendingDecision, setPendingDecision] = useState<'approve' | 'reject' | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // الإرسال بعد أن يلتقط الحقل المخفي القرار — لا نعتمد على activeElement
  // فالنافذة تُغلق قبل ذلك وقد يصير null.
  useEffect(() => {
    if (!pendingDecision) return;
    formRef.current?.requestSubmit();
    setPendingDecision(null);
    setSelected(new Set());
  }, [pendingDecision]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allSelected = requests.length > 0 && requests.every((r) => selected.has(r.id));

  return (
    <form ref={formRef} action={action} className="space-y-4">
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name="template_ids" value={id} />
      ))}
      <input type="hidden" name="decision" value={pendingDecision ?? ''} />
      <input type="hidden" name="rejection_reason" value={reason} />

      {state.error ? (
        <div className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{state.error}</div>
      ) : null}
      {state.notice ? (
        <div className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-[13px] text-ok">{state.notice}</div>
      ) : null}

      <div className="card card-pad flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox" className="accent-brand" checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(requests.map((r) => r.id)))}
          />
          تحديد الكل
        </label>
        <div className="min-w-[200px] flex-1">
          <input
            className="field" placeholder="سبب الرفض (يصل لصاحب القالب)"
            value={reason} onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        {requests.map((r) => (
          <div key={r.id} className={`card card-pad ${selected.has(r.id) ? 'ring-2 ring-brand' : ''}`}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox" className="mt-1 accent-brand"
                checked={selected.has(r.id)} onChange={() => toggle(r.id)}
                aria-label={`تحديد ${r.name}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-ui font-bold">{r.name}</span>
                  <TemplateStatusBadge status={r.status} />
                </div>
                <div className="mt-0.5 text-[12.5px] text-muted">
                  {r.ownerName ?? 'عميل'} · <span className="num">{formatDateTime(r.created_at)}</span>
                </div>
                <p className="mt-2 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-[13px] leading-7">
                  {r.body_text}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <BulkBar count={selected.size}>
        <ConfirmButton
          label="اعتماد"
          className="btn-gold btn-sm"
          title={`اعتماد ${selected.size} قالباً`}
          description="ستصبح القوالب متاحة للاستخدام فوراً. تأكّد أنها مطابقة لسياسة قوالب واتساب — الرفض المتكرر لدى Meta يضرّ تقييم الرقم المشترك."
          onConfirm={() => setPendingDecision('approve')}
        />
        <ConfirmButton
          label="رفض"
          className="btn-danger btn-sm"
          title={`رفض ${selected.size} قالباً`}
          description={reason
            ? `سيصل السبب لأصحاب القوالب: «${reason}»`
            : 'اكتب سبب الرفض أولاً — يصل لأصحاب القوالب ليصحّحوا.'}
          disabled={!reason}
          onConfirm={() => setPendingDecision('reject')}
        />
      </BulkBar>

      {/* زر إرسال مخفي يُستدعى بعد التأكيد */}
      <button type="submit" className="sr-only" aria-hidden tabIndex={-1}>إرسال</button>
    </form>
  );
}
