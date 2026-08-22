import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { ScannerScreen } from './ScannerScreen';
import { scannerSignOut } from './logout';
import { OCCASION_LABELS, type EventRow, type Scanner } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface ScannerAssignment extends Scanner {
  events: Pick<EventRow, 'id' | 'host_name' | 'occasion_type' | 'status'> | null;
}

export default async function ScanPage() {
  if (!supabaseConfigured) return <SetupNotice />;

  // المالك والأدمن يمكنهما المسح أيضاً (اختبار وإشراف)
  const user = await requireRole(['scanner', 'owner', 'admin'], '/scan/login');
  const supabase = await createClient();

  const { data } = await supabase
    .from('scanners')
    .select('*, events:event_id (id, host_name, occasion_type, status)')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: false })
    .returns<ScannerAssignment[]>();

  const assignment = (data ?? [])[0];

  if (!assignment && user.profile.role === 'scanner') {
    return (
      <main className="min-h-screen bg-brand text-white grid place-items-center px-4">
        <div className="max-w-sm text-center">
          <div className="font-cerem text-2xl mb-3">برقية</div>
          <p className="text-[14px] font-semibold">لا توجد مناسبة مرتبطة بحسابك</p>
          <p className="text-[13px] text-white/70 mt-2">
            تواصل مع صاحب المناسبة ليربط حسابك بالبوابة المطلوبة.
          </p>
          <form action={scannerSignOut} className="mt-5">
            <button type="submit" className="btn-gold">تسجيل الخروج</button>
          </form>
        </div>
      </main>
    );
  }

  const eventLabel = assignment?.events
    ? `${assignment.events.host_name} — ${OCCASION_LABELS[assignment.events.occasion_type]}`
    : 'كل المناسبات المصرّح بها';

  return (
    <ScannerScreen
      eventLabel={eventLabel}
      scannerLabel={assignment?.label ?? user.profile.full_name ?? 'ماسح'}
      logoutAction={scannerSignOut}
    />
  );
}
