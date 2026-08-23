import { requireUser, isAdminRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { navFor, ROLE_LABELS } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { AdminNav } from './AdminNav';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured) return <SetupNotice />;

  const user = await requireUser();
  if (!isAdminRole(user.profile.role)) redirect('/app');

  // عدّادات الشريط الجانبي: ما ينتظر تدخّل الفريق الآن
  const supabase = await createClient();
  const counted = async (run: () => PromiseLike<{ count: number | null }>) => {
    try {
      const { count } = await run();
      return count ?? 0;
    } catch {
      return 0;
    }
  };

  const [waiting, templateReqs, openTickets] = await Promise.all([
    counted(() => supabase.from('events').select('id', { count: 'exact', head: true })
      .in('status', ['unpaid', 'pending'])),
    counted(() => supabase.from('templates').select('id', { count: 'exact', head: true })
      .eq('status', 'under_review')),
    counted(() => supabase.from('support_tickets').select('id', { count: 'exact', head: true })
      .eq('status', 'open')),
  ]);

  return (
    <AdminNav
      userName={user.profile.full_name ?? user.email ?? 'الفريق'}
      roleLabel={ROLE_LABELS[user.profile.role] ?? 'الفريق'}
      nav={navFor(user.profile.role)}
      pills={{
        '/admin': waiting,
        '/admin/template-requests': templateReqs,
        '/admin/support': openTickets,
      }}
    >
      {children}
    </AdminNav>
  );
}
