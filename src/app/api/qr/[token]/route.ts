import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { appUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * صورة الباركود (PNG) لرمز مدعو مؤكِّد.
 * الرابط عام لأن واتساب يجلب الصورة بدون جلسة — والرمز نفسه هو السر،
 * ولا يكشف أي بيانات عن المدعو أو المناسبة.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!UUID_RE.test(token)) {
    return new NextResponse('Not found', { status: 404 });
  }

  if (adminClientAvailable) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('guests').select('id').eq('qr_token', token).maybeSingle();
    if (!data) return new NextResponse('Not found', { status: 404 });
  }

  const png = await QRCode.toBuffer(appUrl(`/i/${token}`), {
    type: 'png',
    width: 600,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#153A2BFF', light: '#FFFFFFFF' },
  });

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
