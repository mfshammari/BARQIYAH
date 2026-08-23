'use client';

import { useState } from 'react';
import { formatNumber } from '@/lib/format';

/**
 * شريط الإجراءات الجماعية — يظهر عند التحديد فقط (SPEC §9.1).
 * الإجراءات الخطيرة تمرّ بنافذة تأكيد تشرح الأثر (§9.2): «الإيقاف
 * الخاطئ قبل حفل بيوم يعطّل العميل بالكامل».
 */
export function BulkBar({
  count, children,
}: { count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-3 z-20 mx-auto flex w-fit flex-wrap items-center gap-3
                    rounded-2xl border border-brand/20 bg-brand px-4 py-2.5 text-white shadow-pop">
      <span className="text-[13px] font-semibold num">{formatNumber(count)} محدَّد</span>
      <span className="h-4 w-px bg-white/25" />
      {children}
    </div>
  );
}

/** زر يفتح نافذة تأكيد تشرح الأثر قبل التنفيذ. */
export function ConfirmButton({
  label, title, description, className = 'btn-danger btn-sm', onConfirm, disabled,
}: {
  label: string;
  title: string;
  description: string;
  className?: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4"
             onClick={() => setOpen(false)}>
          <div className="card w-full max-w-sm card-pad text-ink" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-ui text-base font-bold">{title}</h3>
            <p className="mt-2 text-[13px] leading-7 text-muted">{description}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-danger flex-1"
                onClick={() => { setOpen(false); onConfirm(); }}
              >
                تأكيد
              </button>
              <button type="button" className="btn-ghost flex-1" onClick={() => setOpen(false)}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
