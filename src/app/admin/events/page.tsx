import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState, EventStatusBadge } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { activateEvent, setEventStatus } from '../actions';
import { formatDate, formatNumber } from '@/lib/format';
import { OCCASION_LABELS, type EventRow, type Package } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface EventWithOwner extends EventRow {
  profiles: { full_name: string | null; phone: string | null } | null;
  packages: { name: string; seats: number } | null;
}

export default async function AdminEventsPage() {
  const supabase = await createClient();
  const [{ data: eventsData }, { data: packagesData }] = await Promise.all([
    supabase
      .from('events')
      .select('*, profiles:owner_id (full_name, phone), packages:package_id (name, seats)')
      .order('created_at', { ascending: false })
      .returns<EventWithOwner[]>(),
    supabase.from('packages').select('*').eq('active', true)
      .order('seats', { ascending: true }).returns<Package[]>(),
  ]);

  const events = eventsData ?? [];
  const packages = packagesData ?? [];

  return (
    <>
      <PageHeader
        title="كل المناسبات"
        subtitle="تفعيل الباقات يدوياً (بديل الدفع مؤقتاً) — كل تفعيل يُسجَّل في العمليات."
      />

      {events.length === 0 ? (
        <EmptyState title="لا توجد مناسبات" />
      ) : (
        <div className="space-y-4">
          {events.map((e) => (
            <div key={e.id} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold">{e.host_name}</span>
                    <EventStatusBadge status={e.status} />
                  </div>
                  <div className="text-[12.5px] text-muted mt-1">
                    {OCCASION_LABELS[e.occasion_type]} · <span className="num">{formatDate(e.event_date)}</span>
                    {' · '}العميل: {e.profiles?.full_name ?? e.buyer_name ?? '—'}
                    {e.buyer_phone ? <span className="num"> ({e.buyer_phone})</span> : null}
                  </div>
                  <div className="text-[12.5px] text-muted mt-0.5">
                    الرصيد: <b className="text-ink num">{formatNumber(e.seats_quota)}</b> مقعد
                    {e.packages ? ` · ${e.packages.name}` : ' · بلا باقة'}
                  </div>
                </div>

                <div className="flex gap-2">
                  {e.status !== 'closed' ? (
                    <form action={setEventStatus}>
                      <input type="hidden" name="event_id" value={e.id} />
                      <input type="hidden" name="status" value="closed" />
                      <button className="btn-ghost btn-sm" type="submit">إغلاق</button>
                    </form>
                  ) : (
                    <form action={setEventStatus}>
                      <input type="hidden" name="event_id" value={e.id} />
                      <input type="hidden" name="status" value="active" />
                      <button className="btn-ghost btn-sm" type="submit">إعادة فتح</button>
                    </form>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-line">
                <ActionForm action={activateEvent} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="event_id" value={e.id} />
                  <div className="min-w-[190px] flex-1">
                    <label className="label">الباقة</label>
                    <select name="package_id" className="field" defaultValue={e.package_id ?? ''} required>
                      <option value="" disabled>اختر باقة…</option>
                      {packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.seats} مقعد
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-[150px]">
                    <label className="label">نوع العملية</label>
                    <select name="type" className="field" defaultValue="manual_activation">
                      <option value="manual_activation">تفعيل يدوي</option>
                      <option value="upgrade">ترقية (إضافة مقاعد)</option>
                      <option value="purchase">شراء</option>
                    </select>
                  </div>
                  <div className="min-w-[170px] flex-1">
                    <label className="label">ملاحظة (اختياري)</label>
                    <input name="note" className="field" placeholder="تحويل بنكي بتاريخ…" />
                  </div>
                  <SubmitButton className="btn-primary" pendingLabel="جارٍ التفعيل…">
                    {e.status === 'active' ? 'تحديث الرصيد' : 'تفعيل المناسبة'}
                  </SubmitButton>
                </ActionForm>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
