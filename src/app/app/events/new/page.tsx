import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { NewEventForm } from './NewEventForm';
import type { Package, Template } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function NewEventPage() {
  await requireUser();
  const supabase = await createClient();

  const [{ data: packages }, { data: templates }] = await Promise.all([
    supabase.from('packages').select('*').eq('active', true)
      .order('seats', { ascending: true }).returns<Package[]>(),
    supabase.from('templates').select('*').is('owner_id', null).eq('status', 'approved')
      .order('created_at', { ascending: true }).returns<Template[]>(),
  ]);

  return (
    <>
      <PageHeader
        title="مناسبة جديدة"
        subtitle="أربع خطوات: التفاصيل ← الباقة ← القالب ← الدفع. والمعاينة تتحدّث مع كل حرف."
      />
      <NewEventForm packages={packages ?? []} templates={templates ?? []} />
    </>
  );
}
