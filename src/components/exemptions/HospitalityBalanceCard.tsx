import Link from 'next/link';
import { formatNumber } from '@/lib/format';
import { remainingOf } from '@/lib/exemptions/logic';
import { CAP_REACHED_MESSAGE, HOSPITALITY_PACKAGE_NAME, type Exemption } from '@/lib/exemptions/types';

/**
 * بطاقة الرصيد للحساب المعفى: اسم الباقة «باقة ضيافة» بلا سعر، والمستخدم من
 * السقف. عند بلوغ السقف أو سحب الإعفاء أو انتهائه تظهر رسالة الحجب وزر الباقات.
 * لا تعرض أي أداة تحكّم بالإعفاء — فتلك للأدمن وحده.
 */
export function HospitalityBalanceCard({
  exemption, blocked, packagesHref = '/app/events/new',
}: {
  exemption: Exemption;
  blocked: boolean;
  packagesHref?: string;
}) {
  const pct = Math.min(100, (exemption.used / exemption.cap) * 100);
  return (
    <div className="card card-pad">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="sec-title">{HOSPITALITY_PACKAGE_NAME}</h2>
        <span className="badge bg-gold-soft text-brand">ضيافة برقية</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-brand-soft px-3 py-3">
          <div className="font-display text-xl font-extrabold leading-none text-brand num">
            {formatNumber(blocked ? 0 : remainingOf(exemption))}
          </div>
          <div className="mt-1.5 text-[11.5px] text-brand/70">متبقٍ</div>
        </div>
        <div className="rounded-xl bg-panel px-3 py-3">
          <div className="font-display text-xl font-extrabold leading-none text-ink num">
            {formatNumber(exemption.used)}
          </div>
          <div className="mt-1.5 text-[11.5px] text-muted">مُستخدم من <span className="num">{formatNumber(exemption.cap)}</span></div>
        </div>
      </div>

      <div className="mt-4 flex h-2 overflow-hidden rounded-full border border-line bg-panel">
        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
      </div>

      {blocked ? (
        <div className="mt-4 rounded-xl bg-warn-soft px-3.5 py-3">
          <p className="text-[13px] leading-7 text-warn">{CAP_REACHED_MESSAGE}</p>
          <Link href={packagesHref} className="btn-gold btn-sm mt-2">عرض الباقات</Link>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-muted">تُخصم الدعوات المرسلة من رصيد الضيافة في كل مناسباتك.</p>
      )}
    </div>
  );
}
