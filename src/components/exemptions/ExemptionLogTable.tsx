import { formatDateTime, formatNumber } from '@/lib/format';
import { ACTION_LABELS, REASON_LABELS, type ExemptionLogEntry } from '@/lib/exemptions/types';

const ACTION_TONE: Record<ExemptionLogEntry['action'], string> = {
  grant: 'bg-ok-soft text-ok',
  update: 'bg-info-soft text-info',
  revoke: 'bg-danger-soft text-danger',
  expire: 'bg-panel text-muted border border-line',
};

/** سجل الإعفاءات — يُضاف إليه فقط ولا يُحذف منه. */
export function ExemptionLogTable({
  rows, accountName, adminName,
}: {
  rows: ExemptionLogEntry[];
  accountName: (id: string) => string;
  adminName: (id: string) => string;
}) {
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <h2 className="sec-title">سجل الإعفاءات</h2>
        <span className="text-[12px] text-muted">يُضاف إليه ولا يُحذف منه</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="tbl-tight">
          <thead>
            <tr>
              <th>الحساب</th><th>الإجراء</th><th>السقف</th><th>السبب</th><th>الأدمن</th><th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-[13px] text-muted">لا إعفاءات بعد</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold">{accountName(r.accountId)}</td>
                <td><span className={`badge ${ACTION_TONE[r.action]}`}>{ACTION_LABELS[r.action]}</span></td>
                <td className="num">{formatNumber(r.cap)}</td>
                <td className="text-[12.5px] text-muted">{REASON_LABELS[r.reason]}</td>
                <td className="text-[12.5px]">{r.adminId === 'system' ? 'النظام' : adminName(r.adminId)}</td>
                <td className="num whitespace-nowrap text-[12px] text-muted">{formatDateTime(r.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
