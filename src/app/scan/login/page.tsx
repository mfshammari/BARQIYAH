import { redirect } from 'next/navigation';
import { getSessionUser, homePathForRole } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { LoginForm } from '@/app/login/LoginForm';
import { Logo } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ScannerLoginPage() {
  if (!supabaseConfigured) return <SetupNotice />;

  const user = await getSessionUser();
  if (user) redirect(homePathForRole(user.profile.role));

  return (
    <main className="min-h-screen grid place-items-center px-4 py-10 bg-brand">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <span className="font-cerem font-bold text-3xl text-white">برقية</span>
          <p className="text-[13px] text-white/70 mt-2">دخول الماسحين — تسجيل الحضور عند البوابة</p>
        </div>
        <div className="card card-pad">
          <LoginForm next="/scan" label="دخول" />
        </div>
      </div>
    </main>
  );
}
