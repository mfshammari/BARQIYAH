import type { Metadata } from 'next';
import { GuestInvitation } from '@/components/manual-whatsapp/GuestInvitation';
import { TOKEN_RE } from '@/lib/manual-whatsapp/message';
import { LegacyPass, UUID_RE } from './LegacyPass';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'دعوة — برقية',
  robots: { index: false, follow: false },
};

/**
 * صفحة المدعو العامة /i/[token] — بلا تسجيل دخول، للجوال أولاً.
 *   - رمز قصير (٨ محارف فأكثر): دعوة الإرسال اليدوي عبر واتساب وتأكيد الحضور.
 *   - رمز UUID: بطاقة الباركود الأصلية المرتبطة بـSupabase (تبقى كما هي).
 */
export default async function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (UUID_RE.test(token)) return <LegacyPass token={token} />;
  if (!TOKEN_RE.test(token)) {
    return (
      <main className="min-h-screen grid place-items-center px-4 py-8">
        <div className="card rounded-[2px] p-6 max-w-sm w-full text-center">
          <div className="font-display font-bold text-lg">رابط غير صالح</div>
        </div>
      </main>
    );
  }
  return <GuestInvitation token={token} />;
}
