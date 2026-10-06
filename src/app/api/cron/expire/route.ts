import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * cron يومي (vercel.json): الدعوات المُرسلة الأقدم من موعد المناسبة تصير
 * expired فتتحرّر مقاعدها. محمي بـ CRON_SECRET (Vercel ترسله في Authorization).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const provided = auth.replace(/^Bearer\s+/i, '').trim();

  if (!env.cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ ok: false, error: 'cron_secret_missing' }, { status: 503 });
    }
  } else if (provided !== env.cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  if (!adminClientAvailable) {
    return NextResponse.json({ ok: false, error: 'service_role_missing' }, { status: 503 });
  }

  const { data, error } = await createAdminClient().rpc('expire_stale_invites');
  if (error) {
    console.error('[cron:expire] فشل:', error.message);
    return NextResponse.json({ ok: false, error: 'rpc_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, expired: Number(data ?? 0), at: new Date().toISOString() });
}
