'use server';

import { requireUser, isAdminRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export interface SearchHit {
  kind: 'client' | 'event' | 'guest';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/**
 * بحث عام (⌘K) يغطي العملاء والمناسبات والمدعوين (SPEC §9.6).
 * أرقام المدعوين تُعرض للدعم التشغيلي فقط ولا تُصدَّر.
 */
export async function globalSearch(query: string): Promise<SearchHit[]> {
  const user = await requireUser();
  if (!isAdminRole(user.profile.role)) return [];

  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const like = `%${q}%`;

  const [clients, events, guests] = await Promise.all([
    supabase.from('profiles').select('id, full_name, phone, role')
      .in('role', ['user', 'owner'])
      .or(`full_name.ilike.${like},phone.ilike.${like}`)
      .limit(5),
    supabase.from('events').select('id, host_name, internal_name, event_date, status')
      .or(`host_name.ilike.${like},internal_name.ilike.${like}`)
      .limit(6),
    supabase.from('guests').select('id, name, phone, event_id, status')
      .or(`name.ilike.${like},phone.ilike.${like}`)
      .limit(6),
  ]);

  const hits: SearchHit[] = [];

  for (const c of clients.data ?? []) {
    hits.push({
      kind: 'client', id: c.id,
      title: c.full_name ?? 'عميل',
      subtitle: c.phone ?? '—',
      href: `/admin/clients`,
    });
  }
  for (const e of events.data ?? []) {
    hits.push({
      kind: 'event', id: e.id,
      title: e.internal_name || e.host_name,
      subtitle: `مناسبة · ${e.event_date}`,
      href: `/admin/events/${e.id}`,
    });
  }
  for (const g of guests.data ?? []) {
    hits.push({
      kind: 'guest', id: g.id,
      title: g.name,
      subtitle: `مدعو · ${g.phone}`,
      href: `/admin/events/${g.event_id}`,
    });
  }

  return hits;
}
