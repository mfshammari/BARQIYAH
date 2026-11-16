'use client';

import { useEffect, useRef, useState } from 'react';
import * as tus from 'tus-js-client';
import { createClient } from '@/lib/supabase/client';
import { env } from '@/lib/env';
import {
  cacheSecondsFor, checkInviteMedia, checkVideoDuration, formatDuration, formatMegabytes,
  INVITE_MEDIA_ACCEPT, isQuickTimePath, isVideoPath, MAX_VIDEO_MB_LABEL, resumableEndpoint,
  TUS_CHUNK_BYTES, uploadPercent,
} from '@/lib/inviteMedia';
import type { ImageMode } from '@/lib/types';

const BUCKET = 'invite-images';

/**
 * مرفق الدعوة بخيارين: بطاقة تُولَّد تلقائياً (افتراضي) أو يرفع المستخدم
 * صورته أو فيديو مباشرة إلى Storage من المتصفح. لا حقل «رابط صورة».
 *
 * الصورة المرفوعة تظهر أعلى رسالة واتساب. الفيديو لا يُرفق في الرسالة:
 * يُعرض داخل رابط الدعوة، ورأس الرسالة يبقى البطاقة المولَّدة.
 *
 * قبل رفع الفيديو تُقرأ مدته وأبعاده من عنصر <video> مؤقت: ما زاد على
 * ثلاث دقائق يُرفض قبل أن يستهلك الرفع شيئاً. الفيديو يُرفع ببروتوكول TUS
 * القابل للاستئناف (قطع ٦ MB) مع شريط تقدّم وزر إلغاء، ويُستأنف تلقائياً
 * عند انقطاع الشبكة وعودتها؛ الصور تبقى على الرفع العادي.
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
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<tus.Upload | null>(null);
  const isVideo = isVideoPath(path);
  const isQuickTime = isQuickTimePath(path);
  const uploading = progress !== null;

  // ترك الصفحة أثناء الرفع يوقفه (البصمة تبقى في المتصفح فيُستأنف عند إعادة اختيار الملف)
  useEffect(() => () => { void uploadRef.current?.abort(); }, []);

  const emit = (m: ImageMode, p: string | null, u: string | null) => onChange?.({ mode: m, path: p, publicUrl: u });

  const choose = (m: ImageMode) => { setMode(m); setError(null); emit(m, path, publicUrl); };

  const finish = (key: string, meta: VideoMeta | null) => {
    const { data } = createClient().storage.from(BUCKET).getPublicUrl(key);
    setPath(key);
    setPublicUrl(data.publicUrl);
    setVideoMeta(meta);
    emit('uploaded', key, data.publicUrl);
  };

  const upload = async (file: File) => {
    setError(null);
    const check = checkInviteMedia(file);
    if (!check.ok) { setError(check.error); return; }
    const { ext, kind } = check;
    const key = `${uid}/${folder}/${Date.now()}.${ext}`;

    if (kind === 'image') {
      setProgress({ phase: 'simple' });
      try {
        const { error: upErr } = await createClient().storage.from(BUCKET).upload(key, file, {
          contentType: file.type, upsert: false, cacheControl: String(cacheSecondsFor('image')),
        });
        if (upErr) { setError('تعذّر رفع الملف. حاول مرة أخرى.'); return; }
        finish(key, null);
      } finally {
        setProgress(null);
      }
      return;
    }

    // فيديو: المدة أولاً ثم الرفع القابل للاستئناف
    setProgress({ phase: 'probing' });
    const meta = await probeVideo(file);
    const duration = checkVideoDuration(meta?.duration ?? NaN);
    if (!duration.ok) { setError(duration.error); setProgress(null); return; }

    try {
      const outcome = await uploadResumable(file, key, {
        upload: uploadRef,
        onProgress: (uploaded, total) => setProgress({ phase: 'tus', uploaded, total, waitingNetwork: false }),
        onWaitingNetwork: (uploaded, total) => setProgress({ phase: 'tus', uploaded, total, waitingNetwork: true }),
        onFailed: (message, uploaded, total) => setProgress({ phase: 'failed', message, uploaded, total }),
      });
      if (outcome === 'done') finish(key, meta);
      else if (outcome === 'cancelled') { if (fileRef.current) fileRef.current.value = ''; }
    } catch {
      setError('تعذّر بدء الرفع. تأكد من الاتصال وحدّث الصفحة.');
    } finally {
      uploadRef.current = null;
      setProgress(null);
    }
  };

  const retry = () => {
    const u = uploadRef.current;
    if (!u) return;
    setProgress((p) => (p && p.phase === 'failed' ? { phase: 'tus', uploaded: p.uploaded, total: p.total, waitingNetwork: false } : p));
    void refreshAuth(u).then(() => u.start());
  };

  const cancel = () => { void uploadRef.current?.abort(true); cancelResolver.current?.(); };
  const cancelResolver = useRef<(() => void) | null>(null);

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
          {publicUrl && !uploading ? (
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

          {progress && progress.phase !== 'simple' && progress.phase !== 'probing' ? (
            <UploadProgressBar progress={progress} onCancel={cancel} onRetry={retry} />
          ) : null}

          <input
            ref={fileRef} type="file" accept={INVITE_MEDIA_ACCEPT}
            className="block w-full text-[13px] file:me-3 file:rounded-lg file:border-0 file:bg-panel file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold"
            disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          />
          <p className={`hint ${error ? 'text-danger' : ''}`}>
            {error ?? (progress?.phase === 'probing'
              ? 'جارٍ قراءة مدة الفيديو…'
              : progress?.phase === 'simple'
                ? 'جارٍ الرفع… لا تغلق الصفحة.'
                : uploading
                  ? 'الرفع قابل للاستئناف: إن انقطعت الشبكة يتابع من حيث توقّف.'
                  : `صورة (JPG أو PNG أو WebP حتى ٥ ميغابايت) تظهر أعلى رسالة واتساب، أو فيديو (MP4 أو MOV حتى ${MAX_VIDEO_MB_LABEL} ميغابايت وثلاث دقائق).`)}
          </p>
          {isVideo && !uploading ? (
            <p className="rounded-xl bg-brand-soft px-3 py-2 text-[12.5px] leading-6 text-brand">
              الفيديو معتمد
              {videoMeta ? (
                <span className="num"> ({formatDuration(videoMeta.duration)} · {videoMeta.width}×{videoMeta.height})</span>
              ) : null}
              : لا يُرفق في رسالة واتساب، بل يشاهده المدعو داخل رابط دعوته. أعلى الرسالة تبقى بطاقة برقية.
            </p>
          ) : null}
          {isQuickTime && !uploading ? (
            <p className="rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] leading-6 text-warn">
              هذا الملف بصيغة MOV: بعض جوالات أندرويد قد لا تشغّله داخل الرابط. يُفضَّل تصديره MP4 (H.264) قبل الرفع.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );

  /* ---------- الرفع القابل للاستئناف ---------- */

  async function uploadResumable(
    file: File, key: string,
    h: {
      upload: React.MutableRefObject<tus.Upload | null>;
      onProgress: (uploaded: number, total: number) => void;
      onWaitingNetwork: (uploaded: number, total: number) => void;
      onFailed: (message: string, uploaded: number, total: number) => void;
    },
  ): Promise<'done' | 'cancelled'> {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('NO_SESSION');

    return new Promise((resolve) => {
      let uploaded = 0;
      let total = file.size;
      let onlineHandler: (() => void) | null = null;
      const clearOnline = () => { if (onlineHandler) { window.removeEventListener('online', onlineHandler); onlineHandler = null; } };
      const settle = (v: 'done' | 'cancelled') => { clearOnline(); cancelResolver.current = null; resolve(v); };
      cancelResolver.current = () => settle('cancelled');

      const u = new tus.Upload(file, {
        endpoint: resumableEndpoint(env.supabaseUrl),
        // إعادة المحاولة تلقائياً على الأخطاء العابرة قبل اعتبار الرفع متوقفاً
        retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
        headers: { authorization: `Bearer ${session.access_token}`, 'x-upsert': 'false' },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: TUS_CHUNK_BYTES,
        metadata: {
          bucketName: BUCKET,
          objectName: key,
          contentType: file.type,
          // المسار يحمل طابعاً زمنياً فلا يتكرر: الفيديو يُخزَّن سنة
          cacheControl: String(cacheSecondsFor('video')),
        },
        onProgress(bytesUploaded, bytesTotal) {
          uploaded = bytesUploaded; total = bytesTotal;
          h.onProgress(bytesUploaded, bytesTotal);
        },
        onError(err) {
          // انقطاع الشبكة: ننتظر عودتها ثم نستأنف من آخر قطعة مكتملة
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            h.onWaitingNetwork(uploaded, total);
            clearOnline();
            onlineHandler = () => { clearOnline(); void refreshAuth(u).then(() => u.start()); };
            window.addEventListener('online', onlineHandler, { once: true });
            return;
          }
          const status = (err as tus.DetailedError).originalResponse?.getStatus?.();
          const message = status === 413
            ? `الخادم رفض الحجم — حدّ الملف في إعدادات Storage أقل من ${MAX_VIDEO_MB_LABEL} ميغابايت.`
            : status === 401 || status === 403
              ? 'انتهت الجلسة أو لا صلاحية للرفع — حدّث الصفحة وادخل من جديد.'
              : 'توقّف الرفع. يمكنك المتابعة من حيث توقّف.';
          h.onFailed(message, uploaded, total);
        },
        onSuccess() { settle('done'); },
      });
      h.upload.current = u;

      // ملف اختير سابقاً وتوقّف رفعه (تحديث صفحة مثلاً): نتابع من بصمته
      u.findPreviousUploads()
        .then((prev) => { if (prev.length) u.resumeFromPreviousUpload(prev[0]); })
        .catch(() => undefined)
        .finally(() => { h.onProgress(0, file.size); u.start(); });
    });
  }
}

/** توكن الجلسة قد ينتهي أثناء انتظار الشبكة — نجدّده قبل الاستئناف. */
async function refreshAuth(u: tus.Upload) {
  try {
    const { data: { session } } = await createClient().auth.getSession();
    if (session) u.options.headers = { ...(u.options.headers ?? {}), authorization: `Bearer ${session.access_token}` };
  } catch { /* نستأنف بالتوكن الحالي */ }
}

type UploadProgress =
  | { phase: 'simple' }
  | { phase: 'probing' }
  | { phase: 'tus'; uploaded: number; total: number; waitingNetwork: boolean }
  | { phase: 'failed'; message: string; uploaded: number; total: number };

function UploadProgressBar({
  progress, onCancel, onRetry,
}: {
  progress: Extract<UploadProgress, { phase: 'tus' | 'failed' }>;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const percent = uploadPercent(progress.uploaded, progress.total);
  const ar = new Intl.NumberFormat('ar-SA').format(percent);
  const failed = progress.phase === 'failed';
  const waiting = progress.phase === 'tus' && progress.waitingNetwork;
  return (
    <div className="space-y-1.5 rounded-xl border border-line bg-panel px-3 py-2.5" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-[12.5px]">
        <span className={failed ? 'text-danger' : waiting ? 'text-warn' : 'text-ink'}>
          {failed ? progress.message
            : waiting ? 'انقطع الاتصال — سيُستأنف الرفع تلقائياً عند عودة الشبكة.'
            : 'جارٍ رفع الفيديو…'}
        </span>
        <span className="num font-semibold">{ar}٪</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-line" aria-hidden>
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${failed ? 'bg-danger' : waiting ? 'bg-warn' : 'bg-brand'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="num text-[11.5px] text-muted">
          {formatMegabytes(progress.uploaded)} من {formatMegabytes(progress.total)}
        </span>
        <span className="flex gap-1.5">
          {failed ? <button type="button" className="btn-soft btn-sm" onClick={onRetry}>متابعة الرفع</button> : null}
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>إلغاء</button>
        </span>
      </div>
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
