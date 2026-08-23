import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatNumber } from '@/lib/format';
import type { EventStatus, GuestStatus, TemplateStatus } from '@/lib/types';
import { EVENT_STATUS_LABELS, GUEST_STATUS_LABELS, TEMPLATE_STATUS_LABELS } from '@/lib/types';

const GUEST_BADGE: Record<GuestStatus, string> = {
  failed: 'bg-danger text-white',
  draft: 'bg-panel text-muted border border-line',
  sent: 'bg-info-soft text-info',
  accepted: 'bg-ok-soft text-ok',
  declined: 'bg-danger-soft text-danger',
  expired: 'bg-warn-soft text-warn',
  attended: 'bg-brand text-white',
};

export function GuestStatusBadge({ status }: { status: GuestStatus }) {
  return <span className={`badge ${GUEST_BADGE[status]}`}>{GUEST_STATUS_LABELS[status]}</span>;
}

const EVENT_BADGE: Record<EventStatus, string> = {
  unpaid: 'bg-danger-soft text-danger',
  pending: 'bg-warn-soft text-warn',
  active: 'bg-ok-soft text-ok',
  closed: 'bg-panel text-muted border border-line',
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <span className={`badge ${EVENT_BADGE[status]}`}>{EVENT_STATUS_LABELS[status]}</span>;
}

const TEMPLATE_BADGE: Record<TemplateStatus, string> = {
  draft: 'bg-panel text-muted border border-line',
  under_review: 'bg-warn-soft text-warn',
  approved: 'bg-ok-soft text-ok',
  rejected: 'bg-danger-soft text-danger',
};

export function TemplateStatusBadge({ status }: { status: TemplateStatus }) {
  return <span className={`badge ${TEMPLATE_BADGE[status]}`}>{TEMPLATE_STATUS_LABELS[status]}</span>;
}

export function StatCard({
  label, value, sub, tone = 'default',
}: {
  label: string; value: ReactNode; sub?: string;
  tone?: 'default' | 'ok' | 'warn' | 'danger' | 'brand';
}) {
  const tones = {
    default: 'text-ink',
    ok: 'text-ok',
    warn: 'text-warn',
    danger: 'text-danger',
    brand: 'text-brand',
  } as const;
  return (
    <div className="card card-pad">
      <div className={`font-display font-extrabold text-2xl leading-none num ${tones[tone]}`}>{value}</div>
      <div className="text-[12.5px] text-muted mt-2">{label}</div>
      {sub ? <div className="text-[11.5px] text-muted/80 mt-0.5">{sub}</div> : null}
    </div>
  );
}

export function EmptyState({
  title, description, action,
}: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="card card-pad text-center py-10">
      <div className="font-display font-bold text-ink">{title}</div>
      {description ? <p className="text-[13px] text-muted mt-1.5 max-w-md mx-auto">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Alert({
  tone = 'info', title, children,
}: { tone?: 'info' | 'ok' | 'warn' | 'danger'; title?: string; children?: ReactNode }) {
  const tones = {
    info: 'bg-info-soft text-info border-info/20',
    ok: 'bg-ok-soft text-ok border-ok/20',
    warn: 'bg-warn-soft text-warn border-warn/25',
    danger: 'bg-danger-soft text-danger border-danger/25',
  } as const;
  return (
    <div className={`rounded-xl border px-4 py-3 text-[13px] ${tones[tone]}`}>
      {title ? <div className="font-bold mb-0.5">{title}</div> : null}
      {children}
    </div>
  );
}

export function Tabs({
  items, active,
}: { items: { href: string; label: string }[]; active: string }) {
  return (
    <nav className="flex gap-1.5 overflow-x-auto pb-1 mb-5">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
            active === it.href
              ? 'bg-brand text-white'
              : 'bg-surface border border-line text-muted hover:text-ink'
          }`}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl' } as const;
  return (
    <span className={`font-cerem font-bold text-brand ${sizes[size]}`}>برقية</span>
  );
}

/* ============================================================
   لبنات الشاشات الداخلية — مطابقة لبنية النموذج
   ============================================================ */

/** عنوان قسم صغير فوق شبكة أو بطاقة. */
export function SecLabel({ children }: { children: ReactNode }) {
  return <div className="sec-label">{children}</div>;
}

/** فتات المسار: مناسباتي ← الوجهة الحالية. */
export function Crumb({ trail, current }: { trail: { href: string; label: string }[]; current: string }) {
  return (
    <div className="crumb">
      {trail.map((t) => (
        <span key={t.href}>
          <Link href={t.href}>{t.label}</Link>
          {' ← '}
        </span>
      ))}
      <b>{current}</b>
    </div>
  );
}

/** تمييز عربي سليم لعدد الأيام: يوم / يومان / أيام. */
function dayWord(n: number): string {
  if (n === 0) return 'اليوم';
  if (n === 1) return 'يوم متبقٍّ';
  if (n === 2) return 'يومان متبقيان';
  if (n <= 10) return 'أيام متبقية';
  return 'يوماً متبقياً';
}

/** شريط العدّ التنازلي: كم بقي على المناسبة وكم أكّد. */
export function Countdown({
  days, dateLine, note, action,
}: { days: number; dateLine: string; note?: string; action?: ReactNode }) {
  return (
    <div className="countdown">
      <div className="cd-n">
        <b className="num">{formatNumber(days)}</b>
        <span>{dayWord(days)}</span>
      </div>
      <div className="cd-t">
        <b>{dateLine}</b>
        {note ? <span className="block">{note}</span> : null}
      </div>
      {action}
    </div>
  );
}

/** بطاقة عمل مطلوب: رقم + وصف + زر. */
export function TodoCard({
  count, label, action,
}: { count: ReactNode; label: string; action?: ReactNode }) {
  return (
    <div className="todo">
      <div className="td-n num">{count}</div>
      <div className="td-l">{label}</div>
      {action}
    </div>
  );
}

/** الأرقام الثلاثة الكبيرة للرصيد: متاح / محجوز / مؤكّد. */
const STAT_TONE = { g: 'stat stat-g', d: 'stat stat-d', n: 'stat stat-n' } as const;

export function StatTriple({
  items,
}: { items: { tone: 'g' | 'd' | 'n'; label: string; value: ReactNode }[] }) {
  return (
    <div className="grid3">
      {items.map((it) => (
        <div key={it.label} className={STAT_TONE[it.tone]}>
          <div className="l">{it.label}</div>
          <div className="v num">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

/** صف أرقام مصغّرة (مُرسل، أكّد، اعتذر…). */
export function MiniStats({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {items.map((it) => (
        <div key={it.label} className="mini">
          <span className="v num">{it.value}</span>
          <span className="l">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/** شريط توزيع المقاعد بمفتاح ألوان. */
export function QuotaBar({
  total, totalLabel, segments,
}: {
  total: ReactNode;
  totalLabel: string;
  segments: { label: string; value: number; pct: number; color: string }[];
}) {
  return (
    <div className="quota-bar">
      <div className="qb-l">
        <b className="num">{total}</b> {totalLabel}
      </div>
      <div className="qb-track">
        {segments.map((s) => (
          <i key={s.label} style={{ width: `${s.pct}%`, background: s.color }} />
        ))}
      </div>
      <div className="qb-key">
        {segments.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** ملاحظة سياسة البيانات — تظهر أسفل أي شاشة تعرض أرقام المدعوين. */
export function PolicyNote({ children }: { children: ReactNode }) {
  return <div className="policy-note">{children}</div>;
}

/** شريط تنبيه بأيقونة دائرية وزر إجراء — كما في لوحة الإدارة بالنموذج. */
export function NoticeBar({
  tone = 'warn', title, children, action,
}: {
  tone?: 'warn' | 'info';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`alert-row ${tone === 'warn' ? 'alert-warn' : 'alert-info'}`}>
      <span className="a-ic" aria-hidden>{tone === 'warn' ? '!' : 'i'}</span>
      <div>
        <b>{title}</b>
        {children ? <div className="a-sub">{children}</div> : null}
      </div>
      {action ? <div className="a-act">{action}</div> : null}
    </div>
  );
}

/** بطاقة مهمة إدارية: رقم كبير، عنوان، سطر سياق، وزر. */
export function TaskCardBox({
  count, title, meta, action,
}: { count: ReactNode; title: string; meta?: string; action?: ReactNode }) {
  return (
    <div className="task">
      <div className="t-n num">{count}</div>
      <div className="t-l">{title}</div>
      {meta ? <div className="t-m">{meta}</div> : null}
      {action}
    </div>
  );
}
