import 'server-only';
import { randomInt, randomBytes } from 'node:crypto';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWhatsAppProvider } from '@/lib/whatsapp';
import { env, otpUnified } from '@/lib/env';
import { formatOtp, formatRecoveryCode, phoneToEmail } from '@/lib/otpCodes';

/**
 * دخول العميل بجواله عبر رمز تحقّق يصله على واتساب.
 *
 * الفريق يبقى على البريد وكلمة المرور — مسار موثوق لا يتعطّل بتعطّل
 * قناة خارجية، ولا يُقفل الباب على الإدارة إن انخفض تقييم الرقم.
 *
 * **الرمز الموحّد:** ما دامت مفاتيح Meta غير مضبوطة فلا سبيل لإيصال
 * رمز فعلاً، فيُقبل رمز واحد معروف ويُعرض في الشاشة ليعمل التدفّق
 * كاملاً. بضبط المفاتيح يتحوّل تلقائياً إلى رمز عشوائي يُرسَل.
 */

export { phoneToEmail, isPhoneEmail, PHONE_EMAIL_DOMAIN } from '@/lib/otpCodes';

/** رمز من ست خانات. في وضع المحاكاة رمز موحّد معروف. */
export function generateOtp(): string {
  if (otpUnified) return env.mockOtpCode;
  return formatOtp(randomInt(0, 1_000_000));
}

/** رمز استرجاع بصيغة XXXX-XXXX-XXXX من حروف وأرقام بلا ملتبسات. */
export function generateRecoveryCode(): string {
  return formatRecoveryCode(randomBytes(12));
}

export type RequestOtpResult =
  | { ok: true; expiresAt: string; unifiedCode?: string }
  | { ok: false; error: 'RATE_LIMITED' | 'INVALID_PHONE' | 'SEND_FAILED' | 'UNAVAILABLE' };

/**
 * يولّد رمزاً، يخزّن بصمته وحدها في القاعدة (مع حد ٣ طلبات/ساعة)،
 * ثم يرسله على واتساب. في وضع المحاكاة يُرجع الرمز الموحّد ليُعرض.
 */
export async function requestOtp(phoneE164: string): Promise<RequestOtpResult> {
  if (!adminClientAvailable) return { ok: false, error: 'UNAVAILABLE' };

  const admin = createAdminClient();
  const code = generateOtp();

  const { data, error } = await admin.rpc('request_otp', {
    p_phone: phoneE164,
    p_code: code,
    p_ttl_seconds: 300,
  });

  if (error) return { ok: false, error: 'UNAVAILABLE' };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; reason: string | null; expires_at: string | null }
    | undefined;

  if (!row?.ok) {
    const reason = row?.reason;
    if (reason === 'RATE_LIMITED') return { ok: false, error: 'RATE_LIMITED' };
    if (reason === 'INVALID_PHONE') return { ok: false, error: 'INVALID_PHONE' };
    return { ok: false, error: 'SEND_FAILED' };
  }

  if (otpUnified) {
    // لا إرسال حقيقي بلا مفاتيح Meta — الرمز يُعرض في الشاشة
    return { ok: true, expiresAt: row.expires_at!, unifiedCode: code };
  }

  const provider = await getWhatsAppProvider();
  const sent = await provider.sendText({
    to: phoneE164,
    text: `رمز الدخول إلى برقية: ${code}\nصالح لخمس دقائق. لا تشاركه مع أحد.`,
  });

  if (!sent.ok) return { ok: false, error: 'SEND_FAILED' };
  return { ok: true, expiresAt: row.expires_at! };
}

export type VerifyOtpResult =
  | { ok: true; userId: string; isNewUser: boolean; recoveryCode?: string }
  | {
      ok: false;
      error: 'INVALID_CODE' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS' | 'UNAVAILABLE' | 'NO_ACCOUNT';
      attemptsLeft: number;
    };

/** هل لهذا الجوال حساب في المنصة؟ يُستخدم قبل إرسال رمز دخول. */
export async function phoneHasAccount(phoneE164: string): Promise<boolean> {
  if (!adminClientAvailable) return false;
  const admin = createAdminClient();
  const target = phoneToEmail(phoneE164).toLowerCase();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return Boolean(data?.users.some((u) => u.email?.toLowerCase() === target));
}

/**
 * يتحقّق من الرمز، ثم ينشئ الحساب إن كان جديداً ويفتح الجلسة.
 *
 * فتح الجلسة يتم برابط سحري يُولَّد بمفتاح الخدمة ولا يُرسل لأحد،
 * ثم يُستهلك في الخادم مباشرةً — فلا نحتاج بريداً حقيقياً ولا كلمة مرور.
 */
export async function verifyOtpAndSignIn(
  phoneE164: string,
  code: string,
  fullName?: string,
  email?: string,
  /** الدخول لا يُنشئ حساباً: رقم بلا حساب يُوجَّه للتسجيل */
  options: { createIfMissing?: boolean } = { createIfMissing: true },
): Promise<VerifyOtpResult> {
  if (!adminClientAvailable) return { ok: false, error: 'UNAVAILABLE', attemptsLeft: 0 };

  const admin = createAdminClient();

  const { data, error } = await admin.rpc('verify_otp', {
    p_phone: phoneE164,
    p_code: code,
  });
  if (error) return { ok: false, error: 'UNAVAILABLE', attemptsLeft: 0 };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; reason: string | null; attempts_left: number }
    | undefined;

  if (!row?.ok) {
    const reason = (row?.reason ?? 'INVALID_CODE') as 'INVALID_CODE' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS';
    return { ok: false, error: reason, attemptsLeft: row?.attempts_left ?? 0 };
  }

  // الحساب: بريد اصطناعي يمثّل الجوال
  const authEmail = phoneToEmail(phoneE164);
  let userId: string | null = null;
  let isNewUser = false;

  if (options.createIfMissing) {
    const created = await admin.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      phone_confirm: false,
      user_metadata: { full_name: fullName ?? null, phone: phoneE164, contact_email: email ?? null },
    });

    if (created.data?.user) {
      userId = created.data.user.id;
      isNewUser = true;
    }
  }

  if (!userId) {
    // موجود مسبقاً، أو الدخول لا يُنشئ
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === authEmail)?.id ?? null;
  }

  if (!userId) {
    return {
      ok: false,
      error: options.createIfMissing ? 'UNAVAILABLE' : 'NO_ACCOUNT',
      attemptsLeft: 0,
    };
  }

  // الملف الشخصي عند التسجيل وحده. الدور لا يُمرَّر أبداً من هنا.
  if (isNewUser) {
    await admin.from('profiles').upsert(
      { id: userId, full_name: fullName ?? undefined, phone: phoneE164 },
      { onConflict: 'id' },
    );
  }

  // فتح الجلسة: رابط سحري يُولَّد ويُستهلك في الخادم بلا إرسال
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: authEmail,
  });

  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return { ok: false, error: 'UNAVAILABLE', attemptsLeft: 0 };

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  });
  if (verifyError) return { ok: false, error: 'UNAVAILABLE', attemptsLeft: 0 };

  // رمز الاسترجاع للحسابات الجديدة — يُعرض مرة واحدة وتُخزَّن بصمته
  let recoveryCode: string | undefined;
  if (isNewUser) {
    recoveryCode = generateRecoveryCode();
    await admin.rpc('set_recovery_code', { p_user_id: userId, p_code: recoveryCode });
  }

  return { ok: true, userId, isNewUser, recoveryCode };
}
