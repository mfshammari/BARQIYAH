import { requireEventAccess } from '@/lib/auth';
import { fetchEventBalance } from '@/lib/balance';
import { BalancePanel } from '@/components/BalancePanel';
import { PageHeader, EventStatusBadge, Alert } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { updateEventInfo, requestUpgrade } from '../actions';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import { TRANSACTION_TYPE_LABELS, type EventRow, type Package, type Transaction } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EventInfoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event, supabase } = await requireEventAccess(id);
  const e = event as EventRow;

  const [{ data: packagesData }, { data: txData }, balance] = await Promise.all([
    supabase.from('packages').select('*').eq('active', true)
      .order('seats', { ascending: true }).returns<Package[]>(),
    supabase.from('transactions').select('*').eq('event_id', id)
      .order('created_at', { ascending: false }).returns<Transaction[]>(),
    fetchEventBalance(supabase, id),
  ]);

  const packages = packagesData ?? [];
  const transactions = txData ?? [];

  return (
    <>
      <PageHeader
        title="بيانات المناسبة"
        subtitle="تعديل التفاصيل ومتابعة الرصيد وطلب مقاعد إضافية."
        action={<EventStatusBadge status={e.status} />}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
        <div className="space-y-5">
          <div className="card card-pad">
            <h2 className="sec-title mb-4">التفاصيل</h2>
            <ActionForm action={updateEventInfo}>
              <input type="hidden" name="event_id" value={id} />
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="occ">نوع المناسبة</label>
                  <select id="occ" name="occasion_type" className="field" defaultValue={e.occasion_type}>
                    <option value="wedding">حفل زواج</option>
                    <option value="engagement">حفل خطوبة</option>
                    <option value="graduation">حفل تخرّج</option>
                    <option value="other">مناسبة أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="date">التاريخ</label>
                  <input id="date" name="event_date" type="date" className="field num"
                    defaultValue={e.event_date} required />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="host">الدعوة باسم</label>
                <input id="host" name="host_name" className="field" defaultValue={e.host_name} required />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="bn">اسم المشتري</label>
                  <input id="bn" name="buyer_name" className="field" defaultValue={e.buyer_name ?? ''} />
                </div>
                <div>
                  <label className="label" htmlFor="bp">جوال المشتري</label>
                  <input id="bp" name="buyer_phone" dir="ltr" className="field text-left num"
                    defaultValue={e.buyer_phone ?? ''} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="img">رابط صورة الدعوة</label>
                <input id="img" name="image_url" dir="ltr" className="field text-left"
                  defaultValue={e.image_url ?? ''} placeholder="https://…" />
              </div>
              <SubmitButton className="btn-primary">حفظ البيانات</SubmitButton>
            </ActionForm>
          </div>

          <div className="card card-pad">
            <h2 className="sec-title mb-2">طلب مقاعد إضافية</h2>
            <p className="text-[12.5px] text-muted mb-4">
              عند نفاد الرصيد اطلب باقة إضافية — تُضاف مقاعدها فوق رصيدك الحالي بعد التفعيل.
            </p>
            {balance.available <= 0 ? (
              <div className="mb-4">
                <Alert tone="danger" title="نفد الرصيد">
                  لا يمكن إرسال دعوات جديدة حتى تُضاف مقاعد.
                </Alert>
              </div>
            ) : null}
            <ActionForm action={requestUpgrade} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="event_id" value={id} />
              <div className="flex-1 min-w-[200px]">
                <label className="label" htmlFor="pkg">الباقة</label>
                <select id="pkg" name="package_id" className="field" defaultValue="" required>
                  <option value="" disabled>اختر باقة…</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatNumber(p.seats)} مقعد — {formatCurrency(p.price)}
                    </option>
                  ))}
                </select>
              </div>
              <SubmitButton className="btn-gold" pendingLabel="جارٍ الإرسال…">طلب الترقية</SubmitButton>
            </ActionForm>
          </div>

          <div className="card">
            <div className="px-4 sm:px-5 py-3.5 border-b border-line">
              <h2 className="sec-title">سجل العمليات</h2>
            </div>
            {transactions.length === 0 ? (
              <p className="card-pad text-[13px] text-muted">لا توجد عمليات بعد.</p>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>النوع</th><th>المقاعد</th><th>المبلغ</th><th>الحالة</th><th>التاريخ</th></tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id}>
                        <td className="font-semibold">{TRANSACTION_TYPE_LABELS[t.type]}</td>
                        <td className="num">+{formatNumber(t.seats_added)}</td>
                        <td className="num">{formatCurrency(t.amount)}</td>
                        <td>
                          <span className={`badge ${t.status === 'paid' ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
                            {t.status === 'paid' ? 'مكتملة' : 'معلّقة'}
                          </span>
                        </td>
                        <td className="text-muted num text-[12.5px]">{formatDateTime(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <BalancePanel balance={balance} />
      </div>
    </>
  );
}
