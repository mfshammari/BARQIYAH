import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { EventsView, type AdminEventRow } from './EventsView';
import type { EventRow, Guest } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Row extends EventRow {
  profiles: { full_name: string | null } | null;
  guests: Pick<Guest, 'status'>[];
}

export default async function AdminEventsPage({
  searchParams,
}: { searchParams: Promise<{ tab?: string }> }) {
  await requireUser();
  const { tab } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from('events')
    .select('*, profiles:owner_id (full_name), guests (status)')
    .order('event_date', { ascending: true })
    .returns<Row[]>();

  const events: AdminEventRow[] = (data ?? []).map((e) => ({
    ...e,
    ownerName: e.profiles?.full_name ?? e.buyer_name ?? null,
    guestCount: e.guests?.length ?? 0,
    sentCount: (e.guests ?? []).filter((g) => g.status !== 'draft').length,
    draftCount: (e.guests ?? []).filter((g) => g.status === 'draft').length,
  }));

  const initialTab = (['all', 'unpaid', 'active', 'soon', 'past'] as const)
    .find((t) => t === tab) ?? 'all';

  return (
    <>
      <PageHeader
        title="المناسبات"
        subtitle="بتبويبات وبحث، وبمبدّل عرض جدول ⇄ تقويم يبرز الأيام المزدحمة."
      />
      <EventsView events={events} initialTab={initialTab} />
    </>
  );
}
