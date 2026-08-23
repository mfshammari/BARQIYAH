import { requireUser, isAdminRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { navFor, ROLE_LABELS } from '@/lib/permissions';
import { AdminNav } from './AdminNav';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured) return <SetupNotice />;

  const user = await requireUser();
  if (!isAdminRole(user.profile.role)) redirect('/app');

  return (
    <AdminNav
      userName={user.profile.full_name ?? user.email ?? 'الفريق'}
      roleLabel={ROLE_LABELS[user.profile.role] ?? 'الفريق'}
      nav={navFor(user.profile.role)}
    >
      {children}
    </AdminNav>
  );
}
