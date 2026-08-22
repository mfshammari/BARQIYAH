import { redirect } from 'next/navigation';
import { getSessionUser, homePathForRole } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/env';
import { LoginForm } from './LoginForm';
import { Logo } from '@/components/ui';
import { SetupNotice } from '@/components/SetupNotice';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ next?: string }> }) {
  if (!supabaseConfigured) return <SetupNotice />;

  const { next } = await searchParams;
  const user = await getSessionUser();
  if (user) redirect(next || homePathForRole(user.profile.role));

  return (
    <main className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Logo size="lg" />
          <p className="text-[13px] text-muted mt-2">لوحة إدارة دعوات المناسبات</p>
        </div>
        <div className="card card-pad">
          <LoginForm next={next ?? ''} />
        </div>
        <p className="text-center text-[12px] text-muted mt-5">
          حساب الماسح؟{' '}
          <a href="/scan/login" className="text-brand font-semibold">دخول الماسحين</a>
        </p>
      </div>
    </main>
  );
}
