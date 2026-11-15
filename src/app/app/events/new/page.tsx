import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { loadPackageCatalog } from '@/lib/packagesData';
import { hasActiveExemption } from '@/lib/exemptions/server';
import { NewEventForm } from './NewEventForm';

export const dynamic = 'force-dynamic';

export default async function NewEventPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [catalog, hospitality] = await Promise.all([loadPackageCatalog(supabase), hasActiveExemption(supabase, user.id)]);

  return (
    <>
      <PageHeader
        title="مناسبة جديدة"
        subtitle={hospitality
          ? 'خطوتان: التفاصيل ← دعوتك. حسابك ضمن باقة الضيافة فتُفعَّل المناسبة فورًا بلا دفع.'
          : 'أربع خطوات: التفاصيل ← الباقة ← دعوتك ← الدفع. والمعاينة تتحدّث مع كل حرف.'}
      />
      <NewEventForm catalog={catalog} uid={user.id} hospitality={hospitality} />
    </>
  );
}
