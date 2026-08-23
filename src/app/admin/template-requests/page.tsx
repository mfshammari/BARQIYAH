import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState, TemplateStatusBadge } from '@/components/ui';
import { BulkReview } from './BulkReview';
import { formatDateTime } from '@/lib/format';
import type { Template } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RequestRow extends Template {
  profiles: { full_name: string | null; phone: string | null } | null;
}

export default async function TemplateRequestsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('templates')
    .select('*, profiles:owner_id (full_name, phone)')
    .not('owner_id', 'is', null)
    .order('created_at', { ascending: false })
    .returns<RequestRow[]>();

  const requests = data ?? [];
  const pending = requests.filter((r) => r.status === 'under_review');
  const settled = requests.filter((r) => r.status !== 'under_review');

  return (
    <>
      <PageHeader
        title="طلبات القوالب الخاصة"
        subtitle="راجع القوالب المقدَّمة من أصحاب المناسبات: اعتماد أو رفض مع ذكر السبب."
      />

      <h2 className="sec-title mb-3">
        قيد المراجعة <span className="text-muted font-normal num">({pending.length})</span>
      </h2>

      {pending.length === 0 ? (
        <EmptyState title="لا توجد طلبات معلّقة" description="كل الطلبات تمت مراجعتها." />
      ) : (
        <BulkReview
          requests={pending.map((r) => ({ ...r, ownerName: r.profiles?.full_name ?? null }))}
        />
      )}

      {settled.length > 0 ? (
        <>
          <h2 className="sec-title mt-8 mb-3">طلبات سابقة</h2>
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>القالب</th><th>العميل</th><th>الحالة</th><th>السبب</th><th>التاريخ</th></tr>
              </thead>
              <tbody>
                {settled.map((r) => (
                  <tr key={r.id}>
                    <td className="font-semibold">{r.name}</td>
                    <td className="text-muted">{r.profiles?.full_name ?? '—'}</td>
                    <td><TemplateStatusBadge status={r.status} /></td>
                    <td className="text-muted text-[12.5px]">{r.rejection_reason ?? '—'}</td>
                    <td className="text-muted num">{formatDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
