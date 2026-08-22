import Link from 'next/link';
import { requireEventAccess } from '@/lib/auth';
import { fetchEventBalance } from '@/lib/balance';
import { BalancePanel } from '@/components/BalancePanel';
import { PageHeader, StatCard, Alert, EventStatusBadge } from '@/components/ui';
import { formatDate, formatNumber } from '@/lib/format';
import { metaConfigured } from '@/lib/env';
import { OCCASION_LABELS, type EventRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EventDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event, supabase } = await requireEventAccess(id);
  const e = event as EventRow;
  const balance = await fetchEventBalance(supabase, id);

  return (
    <>
      <PageHeader
        title="لوحة المعلومات"
        subtitle={`${OCCASION_LABELS[e.occasion_type]} — ${formatDate(e.event_date)}`}
        action={<EventStatusBadge status={e.status} />}
      />

      {e.status === 'pending' ? (
        <div className="mb-5">
          <Alert tone="warn" title="المناسبة بانتظار التفعيل">
            لا يمكن إرسال الدعوات قبل أن تفعّل الإدارة الباقة ويُضاف رصيد المقاعد.
            يمكنك الآن تجهيز قائمة المدعوين والدعاة والقالب.
          </Alert>
        </div>
      ) : null}

      {e.status === 'active' && !metaConfigured ? (
        <div className="mb-5">
          <Alert tone="info" title="وضع المحاكاة">
            مفاتيح Meta غير مضبوطة بعد، فالإرسال يُسجَّل ويُحدّث الحالات والرصيد دون إرسال فعلي عبر واتساب.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px] items-start">
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label="مُرسل (بانتظار الرد)" value={formatNumber(balance.cnt_sent)} tone="warn" />
            <StatCard label="أكّد الحضور" value={formatNumber(balance.cnt_accepted)} tone="ok" />
            <StatCard label="اعتذر" value={formatNumber(balance.cnt_declined)} tone="danger" />
            <StatCard label="لم يرد" value={formatNumber(balance.cnt_expired)} />
            <StatCard label="حضر فعلياً" value={formatNumber(balance.cnt_attended)} tone="brand" />
            <StatCard label="مسودّات" value={formatNumber(balance.cnt_draft)} />
          </div>

          <div className="card card-pad">
            <h2 className="sec-title mb-3">الخطوات التالية</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <Link href={`/e/${id}/guests`} className="rounded-xl border border-line p-3.5 hover:bg-panel transition-colors">
                <div className="font-semibold text-[14px]">إدارة المدعوين</div>
                <div className="text-[12.5px] text-muted mt-0.5">إضافة يدوية أو رفع Excel، ثم الإرسال.</div>
              </Link>
              <Link href={`/e/${id}/template`} className="rounded-xl border border-line p-3.5 hover:bg-panel transition-colors">
                <div className="font-semibold text-[14px]">قالب الدعوة</div>
                <div className="text-[12.5px] text-muted mt-0.5">اختر قالباً معتمداً أو اطلب قالباً خاصاً.</div>
              </Link>
              <Link href={`/e/${id}/scanners`} className="rounded-xl border border-line p-3.5 hover:bg-panel transition-colors">
                <div className="font-semibold text-[14px]">حسابات المسح</div>
                <div className="text-[12.5px] text-muted mt-0.5">أنشئ حساباً لكل بوابة قبل يوم الحفل.</div>
              </Link>
              <Link href={`/e/${id}/inviters`} className="rounded-xl border border-line p-3.5 hover:bg-panel transition-colors">
                <div className="font-semibold text-[14px]">الدعاة</div>
                <div className="text-[12.5px] text-muted mt-0.5">وزّع الدعوات على الدعاة وتابع نصيب كل واحد.</div>
              </Link>
            </div>
          </div>
        </div>

        <BalancePanel balance={balance} />
      </div>
    </>
  );
}
