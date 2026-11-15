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
/** يطابق file_size_limit للـbucket في الترحيل 0021 */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export const INVITE_MEDIA_ACCEPT = [...Object.keys(IMAGE_TYPES), ...Object.keys(VIDEO_TYPES)].join(',');

const VIDEO_EXT_RE = /\.(mp4|mov|webm)$/i;

/** هل المسار (أو الرابط الكامل) فيديو؟ يتجاهل ?query و#hash. */
export function isVideoPath(pathOrUrl: string | null | undefined): boolean {
  if (!pathOrUrl) return false;
  return VIDEO_EXT_RE.test(pathOrUrl.split(/[?#]/)[0]);
}

export type MediaCheck =
  | { ok: true; kind: InviteMediaKind; ext: string }
  | { ok: false; error: string };

/** يتحقق من نوع الملف وحجمه قبل الرفع — الصورة ≤ ٥ م.ب والفيديو ≤ ٥٠ م.ب. */
export function checkInviteMedia(file: { type: string; size: number }): MediaCheck {
  const imageExt = IMAGE_TYPES[file.type];
  if (imageExt) {
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: 'حجم الصورة أكبر من ٥ ميغابايت.' };
    return { ok: true, kind: 'image', ext: imageExt };
  }
  const videoExt = VIDEO_TYPES[file.type];
  if (videoExt) {
    if (file.size > MAX_VIDEO_BYTES) {
      return { ok: false, error: 'حجم الفيديو أكبر من ٥٠ ميغابايت — اضغطه أو قصّره ثم أعد الرفع.' };
    }
    return { ok: true, kind: 'video', ext: videoExt };
  }
  return { ok: false, error: 'نوع الملف غير مدعوم — صورة JPG أو PNG أو WebP، أو فيديو MP4 أو MOV.' };
}
