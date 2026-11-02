/**
 * مسار العودة بعد الدخول/التسجيل (`?next=`): داخلي فقط.
 * يُقبل ما يبدأ بـ `/` وليس `//` ولا يحوي بروتوكولاً — وإلا المسار الافتراضي.
 * الرابط المفتوح للتحويل الخارجي ثغرة تصيّد، فالتحقق هنا إلزامي.
 */
export const NEXT_COOKIE = 'barqiyah_next';
export const NEXT_COOKIE_MAX_AGE = 15 * 60;   // ١٥ دقيقة

export function safeNextPath(raw: string | null | undefined, fallback = '/app'): string {
  const v = (raw ?? '').trim();
  if (!v) return fallback;
  if (!v.startsWith('/')) return fallback;
  if (v.startsWith('//') || v.startsWith('/\\')) return fallback;
  if (/[\r\n]/.test(v)) return fallback;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(v)) return fallback;   // /javascript: ونحوه
  if (v.length > 512) return fallback;
  return v;
}

/** هل هذا مسار داخلي صالح أصلاً (لا الافتراضي)؟ */
export function isSafeNextPath(raw: string | null | undefined): boolean {
  return safeNextPath(raw, '') !== '';
}
