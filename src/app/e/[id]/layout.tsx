import { requireEventAccess } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { EventNav } from './EventNav';
import { formatHijri } from '@/lib/format';
import { OCCASION_LABELS, type EventRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EventLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  if (!supabaseConfigured) return <SetupNotice />;
  const { id } = await params;
  const { user, event } = await requireEventAccess(id);
  const e = event as EventRow;

  return (
    <EventNav
      eventId={id}
      userName={user.profile.full_name ?? user.email ?? 'صاحب المناسبة'}
      userSub={`${e.host_name} · ${OCCASION_LABELS[e.occasion_type]}`}
      hostName={e.host_name}
      eventLine={[e.internal_name || OCCASION_LABELS[e.occasion_type], formatHijri(e.event_date)]
        .filter(Boolean).join(' · ')}
    >
      {children}
    </EventNav>
  );
}
