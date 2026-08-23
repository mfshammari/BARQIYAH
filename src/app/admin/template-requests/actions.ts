'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

export interface ActionState { error?: string; notice?: string }

/** مراجعة جماعية للقوالب — مع تسجيل كل قرار باسم منفّذه. */
export async function bulkReviewTemplates(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user.profile.role, 'review_templates')) return { error: 'لا تملك صلاحية المراجعة.' };

  const ids = formData.getAll('template_ids').map(String).filter(Boolean);
  const decision = String(formData.get('decision') ?? '');
  const reason = String(formData.get('rejection_reason') ?? '').trim();

  if (ids.length === 0) return { error: 'لم تحدّد أي قالب.' };
  if (decision === 'reject' && !reason) {
    return { error: 'اكتب سبب الرفض — يصل لأصحاب القوالب.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('templates')
    .update(
      decision === 'approve'
        ? { status: 'approved', rejection_reason: null }
        : { status: 'rejected', rejection_reason: reason },
    )
    .in('id', ids);

  if (error) return { error: 'تعذّر تنفيذ الإجراء.' };

  await supabase.from('activity_logs').insert(
    ids.map((id) => ({
      actor_id: user.id,
      action: decision === 'approve' ? 'template.approved' : 'template.rejected',
      target_type: 'template',
      target_id: id,
      metadata: { reason: decision === 'reject' ? reason : null, bulk: ids.length > 1 },
    })),
  );

  revalidatePath('/admin/template-requests');
  return {
    notice: decision === 'approve'
      ? `اعتُمد ${ids.length} قالباً.`
      : `رُفض ${ids.length} قالباً مع إرسال السبب.`,
  };
}
