/**
 * معاينة رابط المدعو في واتساب (Open Graph) — منطق خالص بلا بيئة.
 *
 * واتساب يجلب og:title وog:description وog:image عند لصق الرابط في المحادثة.
 * الصورة JPEG مضغوطة نحو ١٢٠٠ بكسل وأقل من ٣٠٠ KB (حدّ واتساب للمعاينة)،
 * ولا يُوضع اسم المدعو في العنوان — الرابط قد يُعاد توجيهه.
 */

/** og:description الثابت — لا يكشف شيئاً عن المدعو. */
export const OG_DESCRIPTION = 'دعوة خاصة';
/** أكبر ضلع لصورة المعاينة */
export const OG_MAX_EDGE = 1200;
/** حدّ حجم صورة المعاينة بالبايت — واتساب يتجاهل ما فوقه */
export const OG_MAX_BYTES = 300 * 1024;

/** عنوان المناسبة لمعاينة الرابط: وصف الداعي إن كتبه، وإلا نوع المناسبة والجهة الداعية. */
export function inviteTitle(input: { occasionText?: string | null; occasionLabel: string; hostName: string }): string {
  const custom = input.occasionText?.trim();
  if (custom) return custom;
  return `${input.occasionLabel} — ${input.hostName}`.trim();
}

/** مسار صورة المعاينة (JPEG) — ?v= بصمة البيانات لكسر الكاش. */
export function ogImagePath(kind: 'event' | 'inviter', id: string, version: string): string {
  return `/api/invite-og/${kind}/${id}?v=${version}`;
}

const BOT_RE = /whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|slackbot|discordbot|linkedinbot|skypeuripreview|googlebot|bingbot|applebot|iMessage|snapchat|pinterest|vkshare|embedly|quora link preview|bot\b|crawler|spider|preview/i;

/**
 * هل الطالب زاحف معاينة (واتساب وأشباهه)؟ فتح الزاحف للرابط ليس فتحاً من
 * المدعو، فلا يُسجَّل opened_at له.
 */
export function isPreviewBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // بلا هوية متصفح: غالباً أداة لا مدعو
  return BOT_RE.test(userAgent);
}

/** حالات المدعو التي يُسجَّل فيها أول فتح — المسودة لم تُرسل أصلاً. */
export function shouldRecordOpen(input: {
  status: string; openedAt: string | null; userAgent: string | null | undefined; viewerIsAccount: boolean;
}): boolean {
  if (input.openedAt) return false;
  if (input.status === 'draft') return false;
  if (input.viewerIsAccount) return false;
  return !isPreviewBot(input.userAgent);
}

/** درجات ضغط JPEG تُجرَّب تنازلياً حتى يقلّ الحجم عن الحدّ. */
export const OG_JPEG_QUALITIES = [82, 74, 66, 58, 50, 42, 35] as const;
