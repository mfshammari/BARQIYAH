import { notFound } from 'next/navigation';
import { AccountShell } from '@/components/AccountShell';
import { PageHeader } from '@/components/ui';
import { ClientPreview } from './ClientPreview';

export const dynamic = 'force-dynamic';

/** معاينة تطويرية لجانب العميل المعفى من الدفع — مخفية في الإنتاج إلا بـNEXT_PUBLIC_DEV_PREVIEW=1. */
export default function DevExemptClientPage() {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_DEV_PREVIEW !== '1') notFound();
  return (
    <AccountShell userName="معاينة تطويرية" userSub="حساب عميل">
      <PageHeader title="مناسباتي" subtitle="إنشاء مناسبة وإرسال الدعوات — كما يراها الحساب المعفى." />
      <ClientPreview />
    </AccountShell>
  );
}
