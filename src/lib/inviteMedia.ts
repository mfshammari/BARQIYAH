/**
 * مرفق الدعوة المرفوع: صورة أو فيديو — منطق خالص يصلح للخادم والمتصفح.
 *
 * الفيديو لا يُرفق في رسالة واتساب: رأس القالب الموحّد صورة، ورابط wa.me نصّ
 * فقط. فالفيديو يُعرض داخل رابط الدعوة (صفحة المدعو)، ورأس الرسالة يبقى
 * بطاقة برقية المولَّدة. النوع يُعرف من امتداد المسار المخزَّن في image_url.
 */

export type InviteMediaKind = 'image' | 'video';

export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/**
 * الحدّ في مكان واحد: يطابق file_size_limit للـbucket في الترحيل 0024 (٢٠٠ MB).
 * يفترض خطة Pro مع Global file size limit ≥ هذا الرقم في Storage ← Settings؛
 * الخطة المجانية تقف عند ٥٠ MB مهما كان حدّ الـbucket.
 */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
/** عرض الحدّ في الرسائل والتلميحات */
export const MAX_VIDEO_MB_LABEL = '٢٠٠';
/** حجم القطعة في الرفع القابل للاستئناف (TUS) — ٦ MB كما يطلبه Supabase. */
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
/** فوق هذا الحجم لا يصلح الرفع العادي على شبكة الجوال — الفيديو كله يُرفع بـTUS. */
export const RESUMABLE_MIN_BYTES = TUS_CHUNK_BYTES;
/** أقصى مدة للفيديو بالثواني — ٣ دقائق؛ ما زاد يُرفض قبل الرفع (حجم + egress). */
export const MAX_VIDEO_SECONDS = 3 * 60;
/** كاش الفيديو المرفوع سنة كاملة — المسار يحمل طابعاً زمنياً فلا يتكرر. */
export const VIDEO_CACHE_SECONDS = 365 * 24 * 60 * 60;
/** كاش الصورة المرفوعة — ساعة (كما كان). */
export const IMAGE_CACHE_SECONDS = 60 * 60;

export const INVITE_MEDIA_ACCEPT = [...Object.keys(IMAGE_TYPES), ...Object.keys(VIDEO_TYPES)].join(',');

const VIDEO_EXT_RE = /\.(mp4|mov|webm)$/i;
const QUICKTIME_EXT_RE = /\.mov$/i;

/** هل المسار (أو الرابط الكامل) فيديو؟ يتجاهل ?query و#hash. */
export function isVideoPath(pathOrUrl: string | null | undefined): boolean {
  if (!pathOrUrl) return false;
  return VIDEO_EXT_RE.test(pathOrUrl.split(/[?#]/)[0]);
}

/** هل المرفوع MOV (QuickTime)؟ بعض جوالات أندرويد لا تشغّله — يُفضَّل MP4. */
export function isQuickTimePath(pathOrUrl: string | null | undefined): boolean {
  if (!pathOrUrl) return false;
  return QUICKTIME_EXT_RE.test(pathOrUrl.split(/[?#]/)[0]);
}

export type DurationCheck = { ok: true } | { ok: false; error: string };

/**
 * يتحقق من مدة الفيديو قبل الرفع. مدة غير معروفة (NaN/∞ — بعض ملفات MOV
 * لا يقرأ المتصفح بياناتها) لا تُرفض: الحجم يبقى الحاجز الأخير.
 */
export function checkVideoDuration(seconds: number): DurationCheck {
  if (!Number.isFinite(seconds) || seconds <= 0) return { ok: true };
  if (seconds > MAX_VIDEO_SECONDS) {
    return {
      ok: false,
      error: `مدة الفيديو ${formatDuration(seconds)} — الحدّ ثلاث دقائق. قصّره ثم أعد الرفع.`,
    };
  }
  return { ok: true };
}

/** «٢:٣٥» بالأرقام العربية — لرسائل التلميح والخطأ. */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const ar = (n: number, pad = false) =>
    String(n).padStart(pad ? 2 : 1, '0').replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
  return `${ar(m)}:${ar(s, true)}`;
}

/** نقطة الرفع القابل للاستئناف (TUS) في Supabase Storage. */
export function resumableEndpoint(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/upload/resumable`;
}

/** نسبة التقدّم ٠–١٠٠ عدداً صحيحاً — لا تتجاوز ١٠٠ ولا تنزل عن ٠. */
export function uploadPercent(bytesUploaded: number, bytesTotal: number): number {
  if (!Number.isFinite(bytesTotal) || bytesTotal <= 0) return 0;
  return Math.min(100, Math.max(0, Math.floor((bytesUploaded / bytesTotal) * 100)));
}

/** «٤٢٫٥ م.ب» — حجم الملف بالأرقام العربية. */
export function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${new Intl.NumberFormat('ar-SA', { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb)} م.ب`;
}

/** كاش الملف المرفوع بالثواني: الفيديو سنة، والصورة ساعة. */
export function cacheSecondsFor(kind: InviteMediaKind): number {
  return kind === 'video' ? VIDEO_CACHE_SECONDS : IMAGE_CACHE_SECONDS;
}

export type MediaCheck =
  | { ok: true; kind: InviteMediaKind; ext: string }
  | { ok: false; error: string };

/** يتحقق من نوع الملف وحجمه قبل الرفع — الصورة ≤ ٥ م.ب والفيديو ≤ MAX_VIDEO_BYTES. */
export function checkInviteMedia(file: { type: string; size: number }): MediaCheck {
  const imageExt = IMAGE_TYPES[file.type];
  if (imageExt) {
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: 'حجم الصورة أكبر من ٥ ميغابايت.' };
    return { ok: true, kind: 'image', ext: imageExt };
  }
  const videoExt = VIDEO_TYPES[file.type];
  if (videoExt) {
    if (file.size > MAX_VIDEO_BYTES) {
      return { ok: false, error: `حجم الفيديو أكبر من ${MAX_VIDEO_MB_LABEL} ميغابايت — اضغطه أو قصّره ثم أعد الرفع.` };
    }
    return { ok: true, kind: 'video', ext: videoExt };
  }
  return { ok: false, error: 'نوع الملف غير مدعوم — صورة JPG أو PNG أو WebP، أو فيديو MP4 أو MOV.' };
}
