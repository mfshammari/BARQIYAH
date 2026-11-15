import { GUEST_STATUS_LABELS, type GuestStatus } from '@/lib/manual-whatsapp/types';

/** شارات الحالة: مسودة (محايد) / بانتظار (معلومة) / فتح الدعوة (تنبيه) / أكّد وحضر (نجاح) / اعتذر (خطر) */
const TONE: Record<GuestStatus, string> = {
  draft: 'bg-panel text-muted border border-line',
  pending: 'bg-info-soft text-info',
  opened: 'bg-warn-soft text-warn',
  confirmed: 'bg-ok-soft text-ok',
  declined: 'bg-danger-soft text-danger',
  attended: 'bg-ok-soft text-ok',
};

export function StatusBadge({ status }: { status: GuestStatus }) {
  return <span className={`badge ${TONE[status]}`}>{GUEST_STATUS_LABELS[status]}</span>;
}
