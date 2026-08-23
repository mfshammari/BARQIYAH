import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const SECTIONS = [
  { href: '/admin/integration', title: 'تكامل واتساب', desc: 'مفاتيح Meta ورابط الـWebhook.' },
  { href: '/admin/packages', title: 'الباقات', desc: 'إنشاء وتسعير باقات المقاعد.' },
  { href: '/admin/templates', title: 'مكتبة القوالب', desc: 'القوالب العامة المعتمدة لدى Meta.' },
];

export default async function AdminSettingsPage() {
  const user = await requireUser();
  if (!can(user.profile.role, 'whatsapp_settings')) redirect('/admin');

  return (
    <>
      <PageHeader
        title="الإعدادات"
        subtitle="الشاشات نادرة الاستخدام مجمّعة هنا بدل إشغال القائمة الرئيسية."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="card card-pad transition-shadow hover:shadow-pop">
            <div className="font-ui font-bold text-ink">{s.title}</div>
            <p className="mt-1.5 text-[12.5px] text-muted">{s.desc}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
