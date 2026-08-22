// قراءة متغيّرات البيئة بأمان — الغياب يفعّل وضع المحاكاة بدل الانهيار.

/**
 * تطبيع رابط Supabase — يقبل الصيغ الشائعة التي يلصقها المستخدمون:
 *   qfzcokrmownqtlhybdjk        → https://qfzcokrmownqtlhybdjk.supabase.co
 *   xxxx.supabase.co            → https://xxxx.supabase.co
 *   https://xxxx.supabase.co/   → https://xxxx.supabase.co
 * الخطأ هنا يوقف المنصة كلها، فقبول الصيغة المختصرة أنفع من رفضها.
 */
export function normalizeSupabaseUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, '');
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  // معرّف المشروع وحده (٢٠ محرفاً من حروف وأرقام)
  if (/^[a-z0-9]{20}$/i.test(value)) return `https://${value}.supabase.co`;
  // اسم مضيف بلا بروتوكول
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value)) return `https://${value}`;
  return value;
}

export const env = {
  supabaseUrl: normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''),
  supabaseAnonKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
  supabaseServiceKey: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
  metaPhoneNumberId: process.env.META_PHONE_NUMBER_ID ?? '',
  metaWabaId: process.env.META_WABA_ID ?? '',
  metaAccessToken: process.env.META_ACCESS_TOKEN ?? '',
  metaVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN ?? '',
  appUrl: process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
};

/** هل إعدادات Supabase مكتملة؟ الواجهة تعرض شاشة إعداد إن لم تكن. */
export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

/** هل مفاتيح Meta مكتملة؟ إن لا → مزوّد واتساب يعمل بوضع Mock. */
export const metaConfigured = Boolean(env.metaPhoneNumberId && env.metaAccessToken);

export function appUrl(path = ''): string {
  const base = env.appUrl.replace(/\/$/, '');
  return path ? `${base}${path.startsWith('/') ? path : `/${path}`}` : base;
}
