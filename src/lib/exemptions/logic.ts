/**
 * منطق الإعفاء الخالص — بلا شبكة ولا React ليُختبر في Node مباشرة.
 * القاعدة على الخادم: التفعيل والإرسال يفحصان الإعفاء والمتبقي من السقف،
 * ولا يُوثق بالعميل.
 */
import type { UserRole } from '../types';
import {
  REASON_LABELS, type CanSendResult, type Exemption, type ExemptionReason,
  type ExemptionStatus, type GrantInput,
} from './types';

/** الإعفاء يمنحه ويسحبه سوبر أدمن وحده (admin القديم يُعامل كـ admin_owner). */
export function isSuperAdmin(role: UserRole): boolean {
  return role === 'admin_owner' || role === 'admin';
}

export const REASONS = Object.keys(REASON_LABELS) as ExemptionReason[];

export function isReason(v: unknown): v is ExemptionReason {
  return typeof v === 'string' && (REASONS as string[]).includes(v);
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1;
}

/** تحقّق مدخلات المنح: سقف صحيح ≥ ١، سبب من القائمة، تاريخ انتهاء صالح إن وُجد. */
export function validateGrantInput(input: GrantInput): string | null {
  if (!isPositiveInt(input.cap)) return 'عدد الدعوات المجانية يجب أن يكون رقمًا صحيحًا لا يقل عن ١';
  if (!isReason(input.reason)) return 'اختر السبب';
  if (input.expiresAt) {
    const t = Date.parse(input.expiresAt);
    if (Number.isNaN(t)) return 'تاريخ الانتهاء غير صالح';
    if (t <= Date.now()) return 'تاريخ الانتهاء يجب أن يكون في المستقبل';
  }
  return null;
}

/** السقف الجديد لا يقلّ عن المستخدم. */
export function validateNewCap(ex: Pick<Exemption, 'used'>, cap: number): string | null {
  if (!isPositiveInt(cap)) return 'السقف يجب أن يكون رقمًا صحيحًا لا يقل عن ١';
  if (cap < ex.used) return `لا يمكن أن يقلّ السقف عن المستخدم (${ex.used})`;
  return null;
}

export function isExpired(ex: Pick<Exemption, 'expiresAt'>, now = Date.now()): boolean {
  return Boolean(ex.expiresAt) && Date.parse(ex.expiresAt as string) <= now;
}

/** الحالة بترتيب الأسبقية: مسحوب ← منتهٍ ← بلغ السقف ← نشط */
export function exemptionStatus(ex: Exemption, now = Date.now()): ExemptionStatus {
  if (ex.revokedAt) return 'revoked';
  if (isExpired(ex, now)) return 'expired';
  if (ex.used >= ex.cap) return 'cap_reached';
  return 'active';
}

/** هل الإعفاء يسمح بتفعيل مناسبة جديدة بلا دفع؟ */
export function isExemptionActive(ex: Exemption | null, now = Date.now()): boolean {
  return Boolean(ex) && exemptionStatus(ex as Exemption, now) === 'active';
}

export function remainingOf(ex: Exemption): number {
  return Math.max(0, ex.cap - ex.used);
}

/**
 * قرار الإرسال على الخادم:
 *  - باقة مدفوعة للمناسبة ← مسموح بغضّ النظر عن الإعفاء.
 *  - وإلا يُقيَّم الإعفاء: مسحوب / منتهٍ / السقف لا يكفي العدد المطلوب.
 *  - بلا باقة وبلا إعفاء ← no_package.
 */
export function decideSend(
  ex: Exemption | null,
  count: number,
  hasPaidPackage: boolean,
  now = Date.now(),
): CanSendResult {
  if (hasPaidPackage) return { ok: true };
  if (!ex) return { ok: false, reason: 'no_package' };
  const status = exemptionStatus(ex, now);
  if (status === 'revoked') return { ok: false, reason: 'revoked' };
  if (status === 'expired') return { ok: false, reason: 'expired' };
  if (!isPositiveInt(count) || remainingOf(ex) < count) return { ok: false, reason: 'cap_reached' };
  return { ok: true };
}
