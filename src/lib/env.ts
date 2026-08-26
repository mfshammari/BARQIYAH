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
  moyasarSecretKey: process.env.MOYASAR_SECRET_KEY ?? '',
  moyasarWebhookSecret: process.env.MOYASAR_WEBHOOK_SECRET ?? '',
  /** الرمز الموحّد في وضع المحاكاة — يعمل حتى تُربط Meta */
  mockOtpCode: (process.env.MOCK_OTP_CODE ?? '123456').trim(),
};

/** هل إعدادات Supabase مكتملة؟ الواجهة تعرض شاشة إعداد إن لم تكن. */
export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

/** هل مفاتيح Meta مكتملة؟ إن لا → مزوّد واتساب يعمل بوضع Mock. */
export const metaConfigured = Boolean(env.metaPhoneNumberId && env.metaAccessToken);

/**
 * وضع الرمز الموحّد: ما دامت Meta غير مربوطة فلا سبيل لإيصال رمز
 * عبر واتساب، فيُقبل رمز واحد معروف (MOCK_OTP_CODE) ويُعرض في الشاشة.
 * بمجرد ضبط مفاتيح Meta يتحوّل تلقائياً إلى رمز عشوائي يُرسَل فعلاً.
 */
export const otpUnified = !metaConfigured;

/** هل بوابة الدفع مضبوطة؟ إن لا → تفعيل يدوي من الفريق. */
export const paymentConfigured = Boolean(env.moyasarSecretKey);

export function appUrl(path = ''): string {
  const base = env.appUrl.replace(/\/$/, '');
  return path ? `${base}${path.startsWith('/') ? path : `/${path}`}` : base;
}
