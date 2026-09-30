import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { loadPackageCatalog } from '@/lib/packagesData';
import { NewEventForm } from './NewEventForm';

export const dynamic = 'force-dynamic';

export default async function NewEventPage() {
  await requireUser();
  const supabase = await createClient();

  const catalog = await loadPackageCatalog(supabase);

  return (
    <>
      <PageHeader
        title="مناسبة جديدة"
        subtitle="أربع خطوات: التفاصيل ← الباقة ← دعوتك ← الدفع. والمعاينة تتحدّث مع كل حرف."
      />
      <NewEventForm catalog={catalog} />
    </>
  );
}
