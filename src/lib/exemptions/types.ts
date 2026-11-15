/**
 * الإعفاء من الدفع — سوبر أدمن يمنح حساباً سقفاً من الدعوات المجانية،
 * فتُفعَّل مناسباته بلا دفع ويُخصم من السقف كل ما يرسله في جميع مناسباته.
 */
import type { UserRole } from '../types';

export type ExemptionReason = 'trial' | 'partner' | 'compensation' | 'personal' | 'other';

export type ExemptionAction = 'grant' | 'update' | 'revoke' | 'expire';

export interface Exemption {
  accountId: string;
  cap: number;
  used: number;
  reason: ExemptionReason;
  note: string | null;
  /** ISO — فارغ يعني يبقى حتى يُسحب */
  expiresAt: string | null;
  /** معرّف الأدمن المانح */
  grantedBy: string;
  grantedAt: string;
  revokedAt: string | null;
}

export interface ExemptionLogEntry {
  id: string;
  accountId: string;
  action: ExemptionAction;
  cap: number;
  reason: ExemptionReason;
  adminId: string;
  at: string;
}

export type SendBlockReason = 'no_package' | 'cap_reached' | 'revoked' | 'expired';

export interface CanSendResult {
  ok: boolean;
  reason?: SendBlockReason;
}

export interface GrantInput {
  cap: number;
  reason: ExemptionReason;
  note?: string;
  expiresAt?: string;
}

/** حالة الإعفاء كما تُقرأ الآن */
export type ExemptionStatus = 'active' | 'cap_reached' | 'revoked' | 'expired';

/** من ينفّذ الطلب — على الخادم يُستمدّ من الجلسة لا من العميل */
export interface Actor {
  id: string;
  name: string;
  role: UserRole;
}

export const REASON_LABELS: Record<ExemptionReason, string> = {
  trial: 'تجربة',
  partner: 'شريك',
  compensation: 'تعويض',
  personal: 'علاقة شخصية',
  other: 'أخرى',
};

export const ACTION_LABELS: Record<ExemptionAction, string> = {
  grant: 'منح',
  update: 'تعديل',
  revoke: 'سحب',
  expire: 'انتهاء',
};

export const HOSPITALITY_PACKAGE_NAME = 'باقة ضيافة';

export const CAP_REACHED_MESSAGE = 'انتهى رصيد باقة الضيافة. اختر باقة لمتابعة الإرسال.';

export const REVOKE_CONFIRM_TEXT =
  'سيتوقف الإرسال الجديد لهذا الحساب. الدعوات المرسلة سابقًا لا تتأثر.';
