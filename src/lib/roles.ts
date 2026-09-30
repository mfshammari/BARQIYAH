/**
 * منطق الأدوار الخالص — بلا اعتماد على Next أو Supabase ليُختبر مستقلاً.
 *
 * أدوار الفريق: admin_owner | admin_support | admin_reviewer | admin_finance
 * (و`admin` القديم يُعامل كـ admin_owner). العميل دوره `user` (و`owner`
 * القديم يُعامل كـ user). لا فحص حرفي على 'admin' أو 'owner' خارج هذا الملف.
 */
import type { UserRole } from '@/lib/types';
import { can, type Permission } from './permissions';

/** أدوار الفريق الإداري (SPEC §3). */
export const ADMIN_ROLES: UserRole[] = [
  'admin', 'admin_owner', 'admin_support', 'admin_reviewer', 'admin_finance',
];

/** أدوار العميل — حساب واحد دائم، وكونه مالكاً أو داعياً صفة تُشتق من
 *  علاقته بالمناسبة لا من الدور (SPEC §3). */
export const CLIENT_ROLES: UserRole[] = ['user', 'owner'];

/** الدور الافتراضي لأي حساب جديد. */
export const DEFAULT_CLIENT_ROLE: UserRole = 'user';

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isClientRole(role: UserRole): boolean {
  return CLIENT_ROLES.includes(role);
}

export function isScannerRole(role: UserRole): boolean {
  return role === 'scanner';
}

/** المسار الافتراضي لكل دور بعد تسجيل الدخول. */
export function homePathForRole(role: UserRole): string {
  if (isAdminRole(role)) return '/admin';
  if (isScannerRole(role)) return '/scan';
  return '/app';   // «مناسباتي» — نقطة دخول العميل (SPEC §8.2)
}

/** هل يصل هذا المستخدم إلى لوحة مناسبة بعينها؟ مالكها أو أي عضو فريق. */
export function canAccessEvent(
  { role, userId }: { role: UserRole; userId: string },
  eventOwnerId: string | null | undefined,
): boolean {
  if (isAdminRole(role)) return true;
  return Boolean(eventOwnerId) && eventOwnerId === userId;
}

/** هل يملك هذا الدور صلاحية إدارية بعينها؟ يشترط أن يكون عضو فريق أصلاً. */
export function hasAdminPermission(role: UserRole, permission: Permission): boolean {
  return isAdminRole(role) && can(role, permission);
}

/** من يفتح شاشة المسح: الماسح، والعميل لمناسباته، والأدمن لأي مناسبة. */
export function canOpenScanner(role: UserRole): boolean {
  return isScannerRole(role) || isClientRole(role) || isAdminRole(role);
}
