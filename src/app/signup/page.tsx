import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser, homePathForRole } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { SignupForm } from './SignupForm';

export const dynamic = 'force-dynamic';

export default async function SignupPage({
  searchParams,
}: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!supabaseConfigured) return <SetupNotice />;

  const user = await getSessionUser();
  if (user) redirect(homePathForRole(user.profile.role));

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
          <SignupForm next={next ?? ''} />
        </div>

        <p className="mt-5 text-center text-[12.5px] text-muted">
          لديك حساب؟{' '}
          <Link href="/login" className="font-semibold text-brand">تسجيل الدخول</Link>
        </p>
      </div>
    </main>
  );
}
