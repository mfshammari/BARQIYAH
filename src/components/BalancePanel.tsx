import { formatNumber } from '@/lib/format';
import { usageRatio } from '@/lib/balance';
import type { EventBalance } from '@/lib/types';

/**
 * الرصيد بالمقاعد بثلاث حالات: مؤكّد / محجوز بانتظار الرد / متاح.
 * ويعرض بوضوح رقمين منفصلين: الرسائل المستخدمة، وإجمالي الحضور المتوقع.
 */
export function BalancePanel({ balance }: { balance: EventBalance }) {
  const ratio = usageRatio(balance);
  const expected = balance.confirmed + balance.held;

  return (
    <div className="card card-pad">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="sec-title">رصيد المقاعد</h2>
        <span className="text-[12.5px] text-muted">
          من أصل <b className="text-ink num">{formatNumber(balance.seats_quota)}</b> مقعد
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-ok-soft px-3 py-3">
          <div className="font-display font-extrabold text-xl text-ok num leading-none">
            {formatNumber(balance.confirmed)}
          </div>
          <div className="text-[11.5px] text-ok/80 mt-1.5">مؤكّد</div>
        </div>
        <div className="rounded-xl bg-warn-soft px-3 py-3">
          <div className="font-display font-extrabold text-xl text-warn num leading-none">
            {formatNumber(balance.held)}
          </div>
          <div className="text-[11.5px] text-warn/80 mt-1.5">محجوز بانتظار الرد</div>
        </div>
        <div className={`rounded-xl px-3 py-3 ${balance.available > 0 ? 'bg-brand-soft' : 'bg-danger-soft'}`}>
          <div className={`font-display font-extrabold text-xl num leading-none ${balance.available > 0 ? 'text-brand' : 'text-danger'}`}>
            {formatNumber(balance.available)}
          </div>
          <div className={`text-[11.5px] mt-1.5 ${balance.available > 0 ? 'text-brand/70' : 'text-danger/80'}`}>متاح</div>
        </div>
      </div>

      <div className="mt-4 h-2 rounded-full bg-panel border border-line overflow-hidden flex">
        <div className="h-full bg-ok" style={{ width: `${balance.seats_quota ? (balance.confirmed / balance.seats_quota) * 100 : 0}%` }} />
        <div className="h-full bg-warn" style={{ width: `${balance.seats_quota ? (balance.held / balance.seats_quota) * 100 : 0}%` }} />
      </div>
      <p className="text-[12px] text-muted mt-2">
        استُهلك <span className="num">{ratio}%</span> من الباقة (مؤكّد + محجوز).
      </p>

      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-line">
        <div>
          <div className="font-display font-extrabold text-lg num">{formatNumber(balance.messages_used)}</div>
          <div className="text-[11.5px] text-muted">الدعوات/الرسائل المستخدمة</div>
        </div>
        <div>
          <div className="font-display font-extrabold text-lg num">{formatNumber(expected)}</div>
          <div className="text-[11.5px] text-muted">إجمالي الحضور المتوقع (مقاعد)</div>
        </div>
      </div>

      {balance.held > 0 ? (
        <p className="mt-3 rounded-xl bg-warn-soft text-warn text-[12.5px] px-3 py-2.5">
          <b className="num">{formatNumber(balance.held)}</b> مقعداً محجوزة لدعوات لم يُردّ عليها بعد.
          تُحرَّر تلقائياً عند الاعتذار، وتُخصم بالعدد الفعلي عند التأكيد.
        </p>
      ) : null}
    </div>
  );
}
