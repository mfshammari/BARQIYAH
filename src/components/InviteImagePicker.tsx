'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ImageMode } from '@/lib/types';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * صورة الدعوة بخيارين: تُولَّد تلقائياً (افتراضي) أو يرفع المستخدم صورته
 * مباشرة إلى Storage من المتصفح. لا حقل «رابط صورة».
 *
 * يكتب حقلين مخفيين في نموذج الأب: image_mode وimage_url (مسار الملف).
 * `folder` = eventId أو inviterId (أو مؤقت قبل الإنشاء)، والمسار
 * {uid}/{folder}/{timestamp}.{ext} — سياسات Storage تقيّد الكتابة بـ {uid}.
 */
export function InviteImagePicker({
  uid, folder, initialMode = 'generated', initialPath = null, initialPublicUrl = null,
  generatedUrl = null, generatedFallback, onChange,
}: {
  uid: string;
  folder: string;
  initialMode?: ImageMode;
  /** مسار الملف المرفوع في Storage */
  initialPath?: string | null;
  /** الرابط العام للمسار المرفوع (للمعاينة) */
  initialPublicUrl?: string | null;
  /** رابط الصورة المولَّدة — فارغ قبل إنشاء المناسبة */
  generatedUrl?: string | null;
  /** ما يُعرض في الوضع المولَّد حين لا رابط بعد */
  generatedFallback?: React.ReactNode;
  onChange?: (v: { mode: ImageMode; path: string | null; publicUrl: string | null }) => void;
}) {
  const [mode, setMode] = useState<ImageMode>(initialMode);
  const [path, setPath] = useState<string | null>(initialPath);
  const [publicUrl, setPublicUrl] = useState<string | null>(initialPublicUrl);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const emit = (m: ImageMode, p: string | null, u: string | null) => onChange?.({ mode: m, path: p, publicUrl: u });

  const choose = (m: ImageMode) => { setMode(m); setError(null); emit(m, path, publicUrl); };

  const upload = async (file: File) => {
    setError(null);
    const ext = ALLOWED[file.type];
    if (!ext) { setError('نوع الملف غير مدعوم — استخدم JPG أو PNG أو WebP.'); return; }
    if (file.size > MAX_BYTES) { setError('حجم الصورة أكبر من ٥ ميغابايت.'); return; }

    setUploading(true);
    try {
      const supabase = createClient();
      const key = `${uid}/${folder}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('invite-images')
        .upload(key, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
      if (upErr) { setError('تعذّر رفع الصورة. حاول مرة أخرى.'); return; }

      const { data } = supabase.storage.from('invite-images').getPublicUrl(key);
      setPath(key);
      setPublicUrl(data.publicUrl);
      emit('uploaded', key, data.publicUrl);
    } finally {
      setUploading(false);
    }
  };

  const remove = () => {
    setPath(null);
    setPublicUrl(null);
    if (fileRef.current) fileRef.current.value = '';
    emit(mode, null, null);
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name="image_mode" value={mode} />
      <input type="hidden" name="image_url" value={mode === 'uploaded' ? (path ?? '') : ''} />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button" onClick={() => choose('generated')}
          className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
            mode === 'generated' ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:text-ink'
          }`}
        >
          تُولَّد تلقائياً
        </button>
        <button
          type="button" onClick={() => choose('uploaded')}
          className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
            mode === 'uploaded' ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:text-ink'
          }`}
        >
          أرفع صورتي
        </button>
      </div>

      {mode === 'generated' ? (
        <div>
          {generatedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={generatedUrl} alt="صورة الدعوة المولَّدة" className="w-full max-w-xs rounded-xl border border-line" />
          ) : (
            generatedFallback ?? (
              <div className="grid h-24 place-items-center rounded-xl bg-panel text-[12px] text-muted">
                تُولَّد بطاقة برقية الخضراء الذهبية من بيانات دعوتك بعد الحفظ.
              </div>
            )
          )}
          <p className="hint">بطاقة برقية بنصّ دعوتك وموعدها — تتحدّث مع كل حفظ.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {publicUrl ? (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={publicUrl} alt="صورتك" className="max-h-40 rounded-xl border border-line object-cover" />
              <button type="button" className="btn-ghost btn-sm" onClick={remove}>إزالة</button>
            </div>
          ) : null}
          <input
            ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
            className="block w-full text-[13px] file:me-3 file:rounded-lg file:border-0 file:bg-panel file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold"
            disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          />
          <p className={`hint ${error ? 'text-danger' : ''}`}>
            {error ?? (uploading ? 'جارٍ الرفع…' : 'JPG أو PNG أو WebP حتى ٥ ميغابايت. تظهر أعلى رسالة واتساب.')}
          </p>
        </div>
      )}
    </div>
  );
}
