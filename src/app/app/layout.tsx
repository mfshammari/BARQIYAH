import { requireUser, isAdminRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { AccountShell } from '@/components/AccountShell';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured) return <SetupNotice />;
  const user = await requireUser();

  // الماسح لا مكان له هنا؛ الأدمن له لوحته
  if (user.profile.role === 'scanner') redirect('/scan');
  if (isAdminRole(user.profile.role)) redirect('/admin');

  return (
    <AccountShell
      userName={user.profile.full_name ?? user.email ?? 'حسابي'}
      userSub="حساب شخصي"
    >
      {children}
    </AccountShell>
  );
}
