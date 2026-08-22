import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState, TemplateStatusBadge } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { reviewTemplateRequest } from '../actions';
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
        <div className="space-y-4">
          {pending.map((r) => (
            <div key={r.id} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-display font-bold">{r.name}</div>
                  <div className="text-[12.5px] text-muted mt-0.5">
                    من: {r.profiles?.full_name ?? 'عميل'} · {formatDateTime(r.created_at)}
                  </div>
                </div>
                <TemplateStatusBadge status={r.status} />
              </div>

              <p className="mt-3 rounded-xl bg-panel border border-line px-3.5 py-3 text-[13px] leading-7">
                {r.body_text}
              </p>

              <div className="grid gap-4 md:grid-cols-2 mt-4">
                <ActionForm action={reviewTemplateRequest} className="space-y-3">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <div>
                    <label className="label">اسم القالب المعتمد في Meta</label>
                    <input name="meta_template_name" dir="ltr" className="field text-left"
                      placeholder="barqiyah_custom_0001" />
                  </div>
                  <SubmitButton className="btn-primary w-full" pendingLabel="جارٍ الاعتماد…">اعتماد القالب</SubmitButton>
                </ActionForm>

                <ActionForm action={reviewTemplateRequest} className="space-y-3">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <div>
                    <label className="label">سبب الرفض</label>
                    <input name="rejection_reason" className="field" placeholder="النص يخالف سياسة قوالب واتساب…" />
                  </div>
                  <SubmitButton className="btn-danger w-full" pendingLabel="جارٍ الرفض…">رفض مع السبب</SubmitButton>
                </ActionForm>
              </div>
            </div>
          ))}
        </div>
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
