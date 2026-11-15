'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  cacheSecondsFor, checkInviteMedia, checkVideoDuration, formatDuration,
  INVITE_MEDIA_ACCEPT, isQuickTimePath, isVideoPath,
} from '@/lib/inviteMedia';
import type { ImageMode } from '@/lib/types';

/**
 * مرفق الدعوة بخيارين: بطاقة تُولَّد تلقائياً (افتراضي) أو يرفع المستخدم
 * صورته أو فيديو مباشرة إلى Storage من المتصفح. لا حقل «رابط صورة».
 *
 * الصورة المرفوعة تظهر أعلى رسالة واتساب. الفيديو لا يُرفق في الرسالة:
 * يُعرض داخل رابط الدعوة، ورأس الرسالة يبقى البطاقة المولَّدة.
 *
 * قبل رفع الفيديو تُقرأ مدته وأبعاده من عنصر <video> مؤقت: ما زاد على
 * ثلاث دقائق يُرفض برسالة واضحة قبل أن يستهلك الرفع شيئاً.
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
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isVideo = isVideoPath(path);
  const isQuickTime = isQuickTimePath(path);

  const emit = (m: ImageMode, p: string | null, u: string | null) => onChange?.({ mode: m, path: p, publicUrl: u });

  const choose = (m: ImageMode) => { setMode(m); setError(null); emit(m, path, publicUrl); };

  const upload = async (file: File) => {
    setError(null);
    const check = checkInviteMedia(file);
    if (!check.ok) { setError(check.error); return; }
    const { ext, kind } = check;

    setUploading(true);
    try {
      let meta: VideoMeta | null = null;
      if (kind === 'video') {
        meta = await probeVideo(file);
        const duration = checkVideoDuration(meta?.duration ?? NaN);
        if (!duration.ok) { setError(duration.error); return; }
      }

      const supabase = createClient();
      const key = `${uid}/${folder}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('invite-images')
        .upload(key, file, {
          contentType: file.type, upsert: false,
          // المسار يحمل طابعاً زمنياً فلا يتكرر: الفيديو يُخزَّن سنة، والصورة ساعة
          cacheControl: String(cacheSecondsFor(kind)),
        });
      if (upErr) { setError('تعذّر رفع الملف. حاول مرة أخرى.'); return; }

      const { data } = supabase.storage.from('invite-images').getPublicUrl(key);
      setPath(key);
      setPublicUrl(data.publicUrl);
      setVideoMeta(meta);
      emit('uploaded', key, data.publicUrl);
    } finally {
      setUploading(false);
    }
  };

  const remove = () => {
    setPath(null);
    setPublicUrl(null);
    setVideoMeta(null);
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
          أرفع صورة أو فيديو
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
              {isVideo ? (
                <video
                  src={publicUrl} controls playsInline preload="metadata"
                  className="max-h-56 max-w-[70%] rounded-xl border border-line bg-black"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={publicUrl} alt="صورتك" className="max-h-40 rounded-xl border border-line object-cover" />
              )}
              <button type="button" className="btn-ghost btn-sm" onClick={remove}>إزالة</button>
            </div>
          ) : null}
          <input
            ref={fileRef} type="file" accept={INVITE_MEDIA_ACCEPT}
            className="block w-full text-[13px] file:me-3 file:rounded-lg file:border-0 file:bg-panel file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold"
            disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          />
          <p className={`hint ${error ? 'text-danger' : ''}`}>
            {error ?? (uploading
              ? 'جارٍ الرفع… لا تغلق الصفحة.'
              : 'صورة (JPG أو PNG أو WebP حتى ٥ ميغابايت) تظهر أعلى رسالة واتساب، أو فيديو (MP4 أو MOV حتى ٥٠ ميغابايت وثلاث دقائق).')}
          </p>
          {isVideo ? (
            <p className="rounded-xl bg-brand-soft px-3 py-2 text-[12.5px] leading-6 text-brand">
              الفيديو معتمد
              {videoMeta ? (
                <span className="num"> ({formatDuration(videoMeta.duration)} · {videoMeta.width}×{videoMeta.height})</span>
              ) : null}
              : لا يُرفق في رسالة واتساب، بل يشاهده المدعو داخل رابط دعوته. أعلى الرسالة تبقى بطاقة برقية.
            </p>
          ) : null}
          {isQuickTime ? (
            <p className="rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] leading-6 text-warn">
              هذا الملف بصيغة MOV: بعض جوالات أندرويد قد لا تشغّله داخل الرابط. يُفضَّل تصديره MP4 (H.264) قبل الرفع.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

interface VideoMeta { duration: number; width: number; height: number }

/**
 * يقرأ مدة الفيديو وأبعاده من عنصر <video> مؤقت دون رفع شيء.
 * null إن لم يستطع المتصفح قراءة البيانات (يبقى الحجم هو الحاجز).
 */
function probeVideo(file: File, timeoutMs = 8000): Promise<VideoMeta | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    let settled = false;
    const finish = (meta: VideoMeta | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    video.onloadedmetadata = () =>
      finish({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
    video.onerror = () => finish(null);
    video.src = url;
  });
}
