/**
 * توليد الرموز وصياغتها — منطق نقي بلا شبكة ولا قاعدة، ليُختبر وحده.
 * (الإرسال وفتح الجلسة في lib/otp.ts.)
 */

/** بريد اصطناعي يمثّل الجوال داخل Supabase Auth — لا يُرسل إليه شيء. */
export const PHONE_EMAIL_DOMAIN = 'phone.barqiyah.local';

export function phoneToEmail(phoneE164: string): string {
  return `${phoneE164}@${PHONE_EMAIL_DOMAIN}`;
}

/** هل هذا حساب جوال (لا بريد حقيقي)؟ يميّز العميل عن عضو الفريق. */
export function isPhoneEmail(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith(`@${PHONE_EMAIL_DOMAIN}`));
}

/** حروف رمز الاسترجاع: بلا I و O و 0 و 1 و L تفادياً للالتباس عند النسخ. */
export const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** يصوغ ١٢ بايتاً في صيغة XXXX-XXXX-XXXX. */
export function formatRecoveryCode(bytes: Uint8Array): string {
  const chars = Array.from(bytes.slice(0, 12), (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)]
    .map((g) => g.join(''))
    .join('-');
}

/** هل الرمز بالصيغة المتوقّعة؟ */
export function isValidRecoveryCode(code: string): boolean {
  return /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)
    && [...code.replace(/-/g, '')].every((c) => RECOVERY_ALPHABET.includes(c));
}

/** رمز التحقّق: ست خانات بأصفار بادئة محفوظة. */
export function formatOtp(n: number): string {
  return String(Math.abs(Math.trunc(n)) % 1_000_000).padStart(6, '0');
}
