import { createHash } from 'node:crypto';
import { appUrl, env } from '@/lib/env';
import type { ImageMode } from '@/lib/types';

export const INVITE_IMAGES_BUCKET = 'invite-images';

/** الرابط العام لملف مرفوع في Storage (أو الرابط كما هو إن كان كاملاً). */
export function publicImageUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${env.supabaseUrl}/storage/v1/object/public/${INVITE_IMAGES_BUCKET}/${pathOrUrl}`;
}

/** بصمة قصيرة لكسر كاش الصورة المولَّدة كلما تغيّرت بياناتها. */
export function imageVersion(parts: unknown[]): string {
  return createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 10);
}

/** يقرأ حقلي InviteImagePicker من النموذج: الوضع ومسار الملف (للمرفوعة فقط). */
export function readImageFields(formData: FormData): { imageMode: ImageMode; imageUrl: string | null } {
  const imageMode: ImageMode = String(formData.get('image_mode') ?? '') === 'uploaded' ? 'uploaded' : 'generated';
  const raw = String(formData.get('image_url') ?? '').trim();
  // المسار داخل bucket فقط (أو رابط كامل قديم) — لا نصّ حرّ
  const safe = /^[\w./-]+$/.test(raw) || /^https?:\/\//i.test(raw) ? raw : '';
  return { imageMode, imageUrl: imageMode === 'uploaded' && safe ? safe : null };
}

export interface HeaderImageSource {
  kind: 'event' | 'inviter';
  id: string;
  imageMode: ImageMode | null | undefined;
  imageUrl: string | null | undefined;
  /** ما تُبنى منه البطاقة — لتغيير رابط الكاش عند تغيّره */
  version: unknown[];
}

/**
 * صورة رأس الرسالة: المرفوعة رابط Storage العام، والمولَّدة مسار التوليد.
 * الداعي بصورته، والمالك بصورته — لا fallback إلى صورة قالب.
 */
export function resolveHeaderImage(src: HeaderImageSource): string | null {
  if (src.imageMode === 'uploaded') {
    return src.imageUrl ? publicImageUrl(src.imageUrl) : null;
  }
  return appUrl(`/api/invite-card/${src.kind}/${src.id}?v=${imageVersion(src.version)}`);
}
