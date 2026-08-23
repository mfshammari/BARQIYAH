import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, StatCard, Alert } from '@/components/ui';
import { formatCurrency, formatNumber } from '@/lib/format';
import { OCCASION_LABELS, type OccasionType } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Insights {
  events_total: number; events_active: number; clients_total: number;
  guests_total: number; messages_sent: number; accepted_total: number;
  declined_total: number; attended_total: number; seats_confirmed: number;
  avg_seats_per_invite: number | null;
  occasions: Record<string, number> | null;
  revenue_total: number;
}

export default async function InsightsPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc('platform_insights');
  const i = (data ?? {}) as Partial<Insights>;

  const sent = i.messages_sent ?? 0;
  const acceptRate = sent > 0 ? Math.round(((i.accepted_total ?? 0) / sent) * 100) : 0;
  const attendRate = (i.accepted_total ?? 0) > 0
    ? Math.round(((i.attended_total ?? 0) / (i.accepted_total ?? 1)) * 100) : 0;

  const occasions = Object.entries(i.occasions ?? {})
    .sort((a, b) => b[1] - a[1]);
  const maxOcc = occasions[0]?.[1] ?? 1;

  return (
    <>
      <PageHeader
        title="الرؤى"
        subtitle="إحصائيات مجمّعة بلا هوية — لا أسماء ولا أرقام جوال."
      />

      <div className="mb-5">
        <Alert tone="info">
          هذه الشاشة لا تعرض أي بيان يعرّف بمدعو. أرقام المدعوين بيانات أمانة جُمعت لإيصال دعوة
          فقط، والتسويق مسموح لعملاء المنصة المسجّلين ومن وافق طوعاً وحدهم.
        </Alert>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="مناسبات" value={formatNumber(i.events_total ?? 0)}
          sub={`${formatNumber(i.events_active ?? 0)} نشطة`} />
        <StatCard label="عملاء" value={formatNumber(i.clients_total ?? 0)} />
        <StatCard label="رسائل مرسلة" value={formatNumber(sent)} tone="brand" />
        <StatCard label="الإيراد" value={formatCurrency(i.revenue_total ?? 0)} tone="ok" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <div className="card card-pad">
          <h2 className="sec-title mb-4">سلوك المدعوين</h2>
          <div className="space-y-4">
            {[
              ['معدّل التأكيد', `${formatNumber(acceptRate)}٪`, `${formatNumber(i.accepted_total ?? 0)} من ${formatNumber(sent)}`, acceptRate],
              ['نسبة الحضور الفعلي', `${formatNumber(attendRate)}٪`, `${formatNumber(i.attended_total ?? 0)} حضروا من المؤكِّدين`, attendRate],
            ].map(([label, value, sub, pct]) => (
              <div key={String(label)}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold">{label}</span>
                  <span className="font-ui text-lg font-extrabold num text-brand">{value}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full border border-line bg-panel">
                  <div className="h-full bg-brand" style={{ width: `${Number(pct)}%` }} />
                </div>
                <p className="mt-1 text-[11.5px] text-muted num">{sub}</p>
              </div>
            ))}
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[12.5px]">
            <div>
              <dt className="text-muted">مقاعد مؤكّدة</dt>
              <dd className="font-ui text-lg font-extrabold num">{formatNumber(i.seats_confirmed ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-muted">متوسط المقاعد لكل دعوة</dt>
              <dd className="font-ui text-lg font-extrabold num">
                {i.avg_seats_per_invite != null ? formatNumber(Number(i.avg_seats_per_invite)) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted">اعتذارات</dt>
              <dd className="font-ui text-lg font-extrabold num">{formatNumber(i.declined_total ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-muted">إجمالي المدعوين</dt>
              <dd className="font-ui text-lg font-extrabold num">{formatNumber(i.guests_total ?? 0)}</dd>
            </div>
          </dl>
        </div>

        <div className="card card-pad">
          <h2 className="sec-title mb-4">أنواع المناسبات</h2>
          {occasions.length === 0 ? (
            <p className="text-[13px] text-muted">لا بيانات بعد.</p>
          ) : (
            <ul className="space-y-3">
              {occasions.map(([key, count]) => (
                <li key={key}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span>{OCCASION_LABELS[key as OccasionType] ?? key}</span>
                    <span className="num font-semibold">{formatNumber(count)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full border border-line bg-panel">
                    <div className="h-full bg-gold" style={{ width: `${(count / maxOcc) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 border-t border-line pt-3 text-[11.5px] text-muted">
            فرصة تسويقية مشروعة: استهدف عملاء المنصة المسجّلين حسب نوع مناسبتهم — لا مدعوّيهم.
          </p>
        </div>
      </div>
    </>
  );
}
