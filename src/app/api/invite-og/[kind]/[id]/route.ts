import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { inviteCardSvg, loadInviteCardSource } from '@/lib/inviteCardData';
import { renderInviteCardPng } from '@/lib/inviteCardRender';
import { toOgJpeg } from '@/lib/inviteOgImage';
import { publicImageUrl } from '@/lib/inviteImage';
import { isVideoPath } from '@/lib/inviteMedia';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * صورة معاينة رابط المدعو في واتساب: /api/invite-og/{event|inviter}/{id}?v=…
 * JPEG نحو ١٢٠٠ بكسل وأقل من ٣٠٠ KB: الصورة المرفوعة مضغوطة، وإلا (مولَّدة
 * أو فيديو) بطاقة برقية. `?v=` بصمة البيانات والمسار لكسر الكاش.
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
    let input: Buffer | null = null;
    if (src.imageMode === 'uploaded' && src.imageUrl && !isVideoPath(src.imageUrl)) {
      const res = await fetch(publicImageUrl(src.imageUrl), { cache: 'no-store' });
      if (res.ok) input = Buffer.from(await res.arrayBuffer());
    }
    if (!input) input = renderInviteCardPng(inviteCardSvg(src));

    const jpeg = await toOgJpeg(input);
    return new NextResponse(new Uint8Array(jpeg), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(jpeg.length),
        // الرابط يحمل بصمة البيانات — يُخزَّن طويلاً على الحافة وساعةً عند الزاحف
        'Cache-Control': 'public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    console.error('[invite-og] فشل التوليد:', err);
    return new NextResponse('Render failed', { status: 500 });
  }
}
