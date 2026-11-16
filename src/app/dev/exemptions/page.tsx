import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/ui';
import { GROUP_LABELS } from '@/lib/permissions';
import { AdminPreview } from './AdminPreview';

export const dynamic = 'force-dynamic';

/**
 * معاينة تطويرية للوحة الأدمن: الإعفاء من الدفع (قائمة الحسابات، الحوار، السجل)
 * ببيانات محاكاة ومفتاح للتبديل بين سوبر أدمن وأدمن دعم.
 * مخفية في الإنتاج إلا بضبط NEXT_PUBLIC_DEV_PREVIEW=1.
 */
export default function DevExemptionsPage() {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_DEV_PREVIEW !== '1') notFound();

  const nav = [
    { href: '/dev/exemptions', label: 'العملاء', icon: '◑', group: 'management' },
    { href: '/dev/exemptions/client', label: 'عرض كالعميل المعفى', icon: '▧', group: 'management' },
  ];
  return (
    <AppShell
      nav={nav}
      active="/dev/exemptions"
      userName="معاينة تطويرية"
      userSub="لوحة الإدارة"
      host={{ label: 'لوحة الإدارة', name: 'الإعفاء من الدفع', sub: 'بيانات محاكاة' }}
      groupLabels={GROUP_LABELS}
    >
      <PageHeader title="العملاء" subtitle="حساباتهم الدائمة، ومن منهم معفى من الدفع ضمن باقة الضيافة." />
      <AdminPreview />
    </AppShell>
  );
}
