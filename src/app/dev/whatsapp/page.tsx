import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/ui';
import { DevPreview } from './DevPreview';

export const dynamic = 'force-dynamic';

/**
 * معاينة تطويرية لشاشة الإرسال اليدوي عبر واتساب — ببيانات محاكاة ومفتاح
 * لعرض اللوحة بصفة صاحب المناسبة أو الداعي الفرعي.
 * مخفية في الإنتاج إلا بضبط NEXT_PUBLIC_DEV_PREVIEW=1.
 */
export default function DevWhatsAppPage() {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_DEV_PREVIEW !== '1') notFound();

  const nav = [{ href: '/dev/whatsapp', label: 'المدعوون', icon: '☰' }];
  return (
    <AppShell
      nav={nav}
      active="/dev/whatsapp"
      userName="معاينة تطويرية"
      userSub="حفل زواج فيصل العتيبي"
      host={{ label: 'المناسبة', name: 'حفل زواج فيصل العتيبي', sub: 'مساء الجمعة 15 يناير 2027 · قاعة الريم' }}
      backHref="/app"
      backLabel="كل مناسباتي"
    >
      <PageHeader
        title="المدعوون"
        subtitle="أرسل كل دعوة من واتساب جوالك، وتابع الردود هنا."
      />
      <DevPreview />
    </AppShell>
  );
}
