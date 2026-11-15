import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { inviteCardSvg, loadInviteCardSource } from '@/lib/inviteCardData';
import { renderInviteCardPng } from '@/lib/inviteCardRender';

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

  const src = await loadInviteCardSource(createAdminClient(), kind, id);
  if (!src) return new NextResponse('Not found', { status: 404 });

  try {
    const png = renderInviteCardPng(inviteCardSvg(src));
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
