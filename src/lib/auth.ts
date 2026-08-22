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

  if (!profile) return null;
  return { id: user.id, email: user.email ?? null, profile };
}

/** المسار الافتراضي لكل دور بعد تسجيل الدخول. */
export function homePathForRole(role: UserRole): string {
  if (role === 'admin') return '/admin';
  if (role === 'scanner') return '/scan';
  return '/events';
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
