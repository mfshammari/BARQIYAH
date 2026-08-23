'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser, isAdminRole } from '@/lib/auth';

export interface ActionState { error?: string; notice?: string }

export async function updateTicket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!isAdminRole(user.profile.role)) return { error: 'لا تملك الصلاحية.' };

  const supabase = await createClient();
  const id = String(formData.get('ticket_id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
    return { error: 'حالة غير صالحة.' };
  }

  const { error } = await supabase
    .from('support_tickets')
    .update({
      status,
      assigned_to: status === 'in_progress' ? user.id : undefined,
      resolved_at: ['resolved', 'closed'].includes(status) ? new Date().toISOString() : null,
    })
    .eq('id', id);

  if (error) return { error: 'تعذّر تحديث التذكرة.' };

  await supabase.from('activity_logs').insert({
    actor_id: user.id, action: `ticket.${status}`, target_type: 'ticket', target_id: id,
  });

  revalidatePath('/admin/support');
  return { notice: 'حُدّثت التذكرة.' };
}
