import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { supabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { formatDate, formatHijri } from '@/lib/format';
import { OCCASION_LABELS, type EventRow, type Inviter } from '@/lib/types';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-ivory px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <Link href="/" className="font-cerem text-[32px] font-bold text-brand">
          برقية<span className="text-gold">.</span>
        </Link>
        <div className="mt-6 border border-gold-line bg-white p-6 text-right">{children}</div>
      </div>
    </main>
  );
}

/**
 * رابط انضمام الداعي: يربط حسابه بالمناسبة.
 * إن لم يكن له حساب أُرسل للتسجيل ثم عاد إلى هنا — وهو الحساب نفسه
 * الذي سيستخدمه لاحقاً لو أراد شراء باقة لمناسبته الخاصة (SPEC §8.4).
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  if (!supabaseConfigured) return <SetupNotice />;
  const { token } = await params;

  if (!UUID_RE.test(token)) {
    return <Shell><p className="text-[14px] font-semibold">رابط غير صالح.</p></Shell>;
  }
  if (!adminClientAvailable) {
    return <Shell><p className="text-[14px] font-semibold">الخدمة غير متاحة حالياً.</p></Shell>;
  }

  const admin = createAdminClient();
  const { data: inviter } = await admin
    .from('inviters').select('*').eq('invite_token', token).maybeSingle<Inviter>();

  if (!inviter) {
    return (
      <Shell>
        <p className="text-[14px] font-semibold">الدعوة غير موجودة</p>
        <p className="mt-2 text-[13px] text-muted">قد يكون الرابط منتهياً أو أُلغي الحساب.</p>
      </Shell>
    );
  }

  const { data: event } = await admin
    .from('events').select('*').eq('id', inviter.event_id).maybeSingle<EventRow>();

  const user = await getSessionUser();

  // غير مسجّل: نرسله للتسجيل ثم يعود
  if (!user) {
    return (
      <Shell>
        <p className="text-[13px] text-muted">دُعيت لتكون داعياً في</p>
        <h1 className="mt-1 font-ui text-lg font-bold">{event?.host_name ?? 'مناسبة'}</h1>
        {event ? (
          <p className="mt-1 text-[12.5px] text-muted num">
            {OCCASION_LABELS[event.occasion_type]} · {formatHijri(event.event_date)}
          </p>
        ) : null}
        <p className="mt-4 text-[13px] leading-7 text-muted">
          باسم <b className="text-ink">{inviter.name}</b>. أنشئ حسابك — وهو نفسه الذي تستخدمه
          لاحقاً لو أردت مناسبتك الخاصة.
        </p>
        <Link href={`/signup?next=/join/${token}`} className="btn-primary mt-5 w-full">إنشاء حساب</Link>
        <Link href={`/login?next=/join/${token}`} className="btn-ghost mt-2 w-full">لدي حساب</Link>
      </Shell>
    );
  }

  // مسجّل: نربط حسابه إن لم يكن مرتبطاً
  if (!inviter.profile_id) {
    await admin.from('inviters')
      .update({ profile_id: user.id, joined_at: new Date().toISOString() })
      .eq('id', inviter.id);
    redirect(`/inviter/${inviter.id}`);
  }

  if (inviter.profile_id === user.id) redirect(`/inviter/${inviter.id}`);

  // الرابط لشخص آخر
  const supabase = await createClient();
  await supabase.from('activity_logs').insert({
    actor_id: user.id, action: 'inviter.join_conflict',
    target_type: 'inviter', target_id: inviter.id,
  });

  return (
    <Shell>
      <p className="text-[14px] font-semibold">هذا الرابط مرتبط بحساب آخر</p>
      <p className="mt-2 text-[13px] leading-7 text-muted">
        سبق أن استُخدم هذا الرابط لحساب مختلف. راجع صاحب المناسبة ليرسل لك رابطاً جديداً.
      </p>
      <Link href="/app" className="btn-ghost mt-5 w-full">إلى مناسباتي</Link>
    </Shell>
  );
}
