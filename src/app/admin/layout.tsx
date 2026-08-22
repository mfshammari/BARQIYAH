import { requireRole } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { AdminNav } from './AdminNav';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured) return <SetupNotice />;
  const user = await requireRole('admin');

  return (
    <AdminNav userName={user.profile.full_name ?? user.email ?? 'الأدمن'}>
      {children}
    </AdminNav>
  );
}
