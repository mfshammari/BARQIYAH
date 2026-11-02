import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { buildInviteCardSvg } from '@/lib/inviteCard';
import { renderInviteCardPng } from '@/lib/inviteCardRender';
import { formatHijri, formatTime, formatWeekday } from '@/lib/format';
import type { EventRow, Inviter } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * صورة الدعوة المولَّدة: /api/invite-card/{event|inviter}/{id}?v=…
 * تُقرأ بـ service role (المسار عام لكن المعرّف uuid)، وتُخزَّن ساعةً.
 * `?v=` بصمة البيانات لكسر الكاش عند التعديل.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if ((kind !== 'event' && kind !== 'inviter') || !UUID_RE.test(id)) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (!adminClientAvailable) {
    return new NextResponse('Service unavailable', { status: 503 });
  }

  const admin = createAdminClient();
  let event: EventRow | null = null;
  let vars: { host?: string; occasion?: string } = {};

  if (kind === 'event') {
    const { data } = await admin.from('events').select('*').eq('id', id).maybeSingle<EventRow>();
    event = data ?? null;
    vars = (event?.invite_vars ?? {}) as typeof vars;
  } else {
    const { data: inviter } = await admin.from('inviters').select('*').eq('id', id).maybeSingle<Inviter>();
    if (inviter) {
      const { data } = await admin.from('events').select('*').eq('id', inviter.event_id).maybeSingle<EventRow>();
      event = data ?? null;
      vars = (inviter.invite_vars ?? {}) as typeof vars;
    }
  }

  if (!event) return new NextResponse('Not found', { status: 404 });

  const weekday = event.event_weekday || formatWeekday(event.event_date);
  const hijri = event.event_date_hijri || formatHijri(event.event_date);

  const svg = buildInviteCardSvg({
    host: vars.host?.trim() || event.host_name,
    occasion: vars.occasion?.trim() || '',
    dateLine: [weekday, hijri].filter(Boolean).join(' '),
    venue: event.venue,
    time: formatTime(event.event_time) || null,
  });

  try {
    const png = renderInviteCardPng(svg);
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(png.length),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('[invite-card] فشل التوليد:', err);
    return new NextResponse('Render failed', { status: 500 });
  }
}
