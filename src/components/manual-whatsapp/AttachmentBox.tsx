'use client';

import { useRef, useState, useTransition } from 'react';
import { InviteImagePicker } from '@/components/InviteImagePicker';
import { isVideoPath } from '@/lib/inviteMedia';
import type { ImageMode } from '@/lib/types';

export interface AttachmentInitial {
  mode: ImageMode;
  /** مسار الملف المرفوع في Storage */
  path: string | null;
  publicUrl: string | null;
  generatedUrl: string | null;
}

/**
 * مرفق الدعوة داخل محرّر رسالة واتساب: يرفع الداعي صورة أو فيديو من مكان
 * القوالب نفسه، ويُحفظ فور اكتمال الرفع — بلا زر حفظ. الرسالة تبقى نصاً
 * ورابطاً؛ المرفق يراه المدعو حين يفتح رابطه.
 */
export function AttachmentBox({
  uid, folder, initial, save,
}: {
  uid: string;
  folder: string;
  initial: AttachmentInitial;
  save: (mode: ImageMode, path: string | null) => Promise<{ error?: string }>;
}) {
  const initialKey = initial.mode === 'uploaded' && initial.path ? initial.path : '';
  const savedKey = useRef(initialKey);
  const [current, setCurrent] = useState(initialKey);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ error?: string; ok?: boolean }>({});
  const [pending, startTransition] = useTransition();

  const label = !current ? 'بطاقة برقية (تلقائية)' : isVideoPath(current) ? 'فيديو' : 'صورة';

  function onChange(v: { mode: ImageMode; path: string | null }) {
    // «أرفع» بلا ملف بعد لا يغيّر المحفوظ — ننتظر اكتمال الرفع
    const key = v.mode === 'uploaded' && v.path ? v.path : '';
    if (v.mode === 'uploaded' && !v.path && savedKey.current === '') return;
    if (key === savedKey.current) return;
    setStatus({});
    startTransition(async () => {
      try {
        const r = await save(key ? 'uploaded' : 'generated', key || null);
        if (r.error) { setStatus({ error: r.error }); return; }
        savedKey.current = key;
        setCurrent(key);
        setStatus({ ok: true });
      } catch {
        setStatus({ error: 'تعذّر حفظ المرفق. حدّث الصفحة وحاول مرة أخرى.' });
      }
    });
  }

  return (
    <div className="rounded-xl border border-line px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px]">
          <span className="text-muted">مرفق الدعوة داخل الرابط: </span>
          <b className="text-ink">{label}</b>
          {pending ? <span className="text-muted"> · جارٍ الحفظ…</span> : null}
          {status.ok && !pending ? <span className="text-ok"> · حُفظ</span> : null}
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="btn-ghost btn-sm">
          {open ? 'إغلاق' : current ? 'تغيير المرفق' : 'إضافة صورة أو فيديو'}
        </button>
      </div>

      {status.error ? (
        <div className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{status.error}</div>
      ) : null}

      {open ? (
        <div className="mt-3">
          <InviteImagePicker
            uid={uid} folder={folder}
            initialMode={initial.mode} initialPath={initial.path}
            initialPublicUrl={initial.publicUrl} generatedUrl={initial.generatedUrl}
            onChange={onChange}
          />
          <p className="hint">يُحفظ تلقائياً بعد اكتمال الرفع، ويظهر للمدعو حين يفتح رابط دعوته.</p>
        </div>
      ) : null}
    </div>
  );
}
