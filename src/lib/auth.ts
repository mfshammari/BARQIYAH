import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile, UserRole } from '@/lib/types';

export interface SessionUser {
  id: string;
  email: string | null;
  profile: Profile;
}

/** المستخدم الحالي مع ملفه الشخصي، أو null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<Profile>();

  if (profile) return { id: user.id, email: user.email ?? null, profile };

  // شبكة أمان: مستخدم بلا ملف شخصي (تريغر لم يعمل مثلاً) يبقى عالقاً
  // خارج المنصة إلى الأبد. ensure_profile ينشئه بدور owner فقط.
  const { data: created } = await supabase.rpc('ensure_profile', {
    p_full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
  });

  const ensured = (Array.isArray(created) ? created[0] : created) as Profile | null;
  if (!ensured) return null;
  return { id: user.id, email: user.email ?? null, profile: ensured };
}

/** أدوار الفريق الإداري (SPEC §3). */
export const ADMIN_ROLES: UserRole[] = [
  'admin', 'admin_owner', 'admin_support', 'admin_reviewer', 'admin_finance',
];

/** أدوار العميل — حساب واحد دائم، وكونه مالكاً أو داعياً صفة تُشتق من
 *  علاقته بالمناسبة لا من الدور (SPEC §3). */
export const CLIENT_ROLES: UserRole[] = ['user', 'owner'];

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isClientRole(role: UserRole): boolean {
  return CLIENT_ROLES.includes(role);
}

/** المسار الافتراضي لكل دور بعد تسجيل الدخول. */
export function homePathForRole(role: UserRole): string {
  if (isAdminRole(role)) return '/admin';
  if (role === 'scanner') return '/scan';
  return '/app';   // «مناسباتي» — نقطة دخول العميل (SPEC §8.2)
}

/** يشترط تسجيل الدخول. */
export async function requireUser(loginPath = '/login'): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(loginPath);
  return user;
}

/** يشترط دوراً محدداً، وإلا يحوّل المستخدم إلى لوحته. */
export async function requireRole(
  roles: UserRole | UserRole[],
  loginPath = '/login',
): Promise<SessionUser> {
  const user = await requireUser(loginPath);
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(user.profile.role)) {
    redirect(homePathForRole(user.profile.role));
  }
  return user;
}

/** يشترط ملكية المناسبة (أو صلاحية الأدمن). */
export async function requireEventAccess(eventId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();

  if (!event) redirect('/events');
  if (user.profile.role !== 'admin' && event.owner_id !== user.id) {
    redirect(homePathForRole(user.profile.role));
  }
  return { user, event, supabase };
}
