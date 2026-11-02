import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile, UserRole } from '@/lib/types';
import type { Permission } from '@/lib/permissions';
import {
  ADMIN_ROLES, CLIENT_ROLES, canAccessEvent, hasAdminPermission,
  homePathForRole, isAdminRole, isClientRole, isScannerRole,
} from '@/lib/roles';

export {
  ADMIN_ROLES, CLIENT_ROLES, homePathForRole, isAdminRole, isClientRole, isScannerRole,
};

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
  // خارج المنصة إلى الأبد. ensure_profile ينشئه بدور العميل فقط.
  const { data: created } = await supabase.rpc('ensure_profile', {
    p_full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
  });

  const ensured = (Array.isArray(created) ? created[0] : created) as Profile | null;
  if (!ensured) return null;
  return { id: user.id, email: user.email ?? null, profile: ensured };
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

/** يشترط عضو فريق (أي دور إداري). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdminRole(user.profile.role)) redirect(homePathForRole(user.profile.role));
  return user;
}

/**
 * يشترط صلاحية بعينها من مصفوفة SPEC §10 — وإلا يحوّل إلى /admin مع
 * ?denied=1 (غير عضو الفريق يُحوَّل إلى لوحته هو).
 */
export async function requireAdminPermission(permission: Permission): Promise<SessionUser> {
  const user = await requireAdmin();
  if (!hasAdminPermission(user.profile.role, permission)) redirect('/admin?denied=1');
  return user;
}

/** يشترط ملكية المناسبة (أو عضوية الفريق). */
export async function requireEventAccess(eventId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();

  if (!event) redirect('/app');
  if (!canAccessEvent({ role: user.profile.role, userId: user.id }, event.owner_id)) {
    redirect(homePathForRole(user.profile.role));
  }
  return { user, event, supabase };
}
