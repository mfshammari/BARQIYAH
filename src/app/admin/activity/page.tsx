import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { ActivityLog } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Row extends ActivityLog {
  profiles: { full_name: string | null } | null;
}

const ACTION_LABELS: Record<string, string> = {
  'event.created': 'أنشأ مناسبة',
  'event.activated': 'فعّل مناسبة يدوياً',
  'event.activated_by_payment': 'فُعّلت مناسبة بعد السداد',
  'payment.failed': 'فشل سداد',
  'client.sending_paused': 'أوقف إرسال عميل',
  'client.sending_resumed': 'استأنف إرسال عميل',
  'team.role_changed': 'غيّر دور عضو',
  'contacts.purged': 'حذف دفتر عناوينه',
  'inviter.join_conflict': 'رابط انضمام لحساب آخر',
};

export default async function ActivityPage() {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('activity_logs')
    .select('*, profiles:actor_id (full_name)')
    .order('created_at', { ascending: false })
    .limit(300)
    .returns<Row[]>();

  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="سجل النشاط"
        subtitle="كل إجراء إداري باسم منفّذه — والنظام منفّذاً للتفعيل التلقائي بعد السداد."
      />

      {rows.length === 0 ? (
        <EmptyState title="لا نشاط مسجّل بعد" />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>المنفّذ</th><th>الإجراء</th><th>الهدف</th><th>الوقت</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.actor_id ? (
                      <span className="font-semibold">{r.profiles?.full_name ?? r.actor_id.slice(0, 8)}</span>
                    ) : (
                      <span className="badge bg-info-soft text-info">النظام</span>
                    )}
                  </td>
                  <td className="text-[12.5px]">{ACTION_LABELS[r.action] ?? r.action}</td>
                  <td className="text-[12px] text-muted">
                    {r.target_type ?? '—'}
                    {r.target_id ? <span className="num"> · {r.target_id.slice(0, 8)}</span> : null}
                  </td>
                  <td className="num text-[12px] text-muted">{formatDateTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
