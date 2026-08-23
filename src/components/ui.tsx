import Link from 'next/link';
import type { ReactNode } from 'react';
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
