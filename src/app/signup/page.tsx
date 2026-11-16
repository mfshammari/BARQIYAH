import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser, homePathForRole } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { PhoneSignup, type SignupPrefill } from './PhoneSignup';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/format';
import { isSafeNextPath, safeNextPath } from '@/lib/safeNext';

export const dynamic = 'force-dynamic';

const JOIN_RE = /^\/join\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const DIALS = ['966', '971', '965', '974', '973', '968'];

/**
 * القادم من رابط انضمام داعٍ: بياناته موجودة عند صاحب المناسبة، فتُعرض عليه
 * جاهزة ليؤكّدها أو يعدّلها بدل كتابتها من جديد. الرابط نفسه هو الإذن — وصل
 * إلى رقمه — والصفّ المرتبط بحساب مسبقاً لا يُكشف.
 */
async function inviterPrefill(next: string): Promise<SignupPrefill | null> {
  const token = JOIN_RE.exec(next)?.[1];
  if (!token || !adminClientAvailable) return null;

  const { data } = await createAdminClient()
    .from('inviters').select('name, phone, profile_id').eq('invite_token', token)
    .maybeSingle<{ name: string; phone: string | null; profile_id: string | null }>();
  if (!data || data.profile_id) return null;

  const full = data.phone ? normalizePhone(data.phone) : '';
  const dial = DIALS.find((d) => full.startsWith(d)) ?? '966';
  return { name: data.name.trim(), dial, phone: full.startsWith(dial) ? full.slice(dial.length) : '' };
}

export default async function SignupPage({
  searchParams,
}: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!supabaseConfigured) return <SetupNotice />;

  const user = await getSessionUser();
  if (user) redirect(isSafeNextPath(next) ? safeNextPath(next) : homePathForRole(user.profile.role));

  const safeNext = isSafeNextPath(next) ? safeNextPath(next) : '';
  const prefill = safeNext ? await inviterPrefill(safeNext) : null;

  return (
    <main className="grid min-h-screen place-items-center bg-ivory px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Link href="/" className="font-cerem text-[32px] font-bold text-brand">
            برقية<span className="text-gold">.</span>
          </Link>
          <p className="mt-2 text-[13px] text-muted">حساب واحد يجمع كل مناسباتك</p>
        </div>

        <div className="border border-gold-line bg-white p-6">
          <PhoneSignup next={safeNext} prefill={prefill} />
        </div>

        <p className="mt-5 text-center text-[12.5px] text-muted">
          لديك حساب؟{' '}
          <Link href={isSafeNextPath(next) ? `/login?next=${encodeURIComponent(safeNextPath(next))}` : '/login'} className="font-semibold text-brand">تسجيل الدخول</Link>
        </p>
      </div>
    </main>
  );
}
