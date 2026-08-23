'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { can, type Permission } from '@/lib/permissions';
import type { UserRole } from '@/lib/types';

export interface ActionState { error?: string; notice?: string }

async function guard(permission: Permission) {
  const user = await requireUser();
  if (!can(user.profile.role, permission)) throw new Error('FORBIDDEN');
  return { user, supabase: await createClient() };
}

/** يسجّل كل إجراء إداري باسم منفّذه (SPEC §13). */
async function log(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string, action: string,
  targetType: string, targetId: string, metadata: Record<string, unknown> = {},
) {
  await supabase.from('activity_logs').insert({
    actor_id: actorId, action, target_type: targetType, target_id: targetId, metadata,
  });
}

/**
 * إيقاف إرسال عميل مؤقتاً — حماية الرقم المشترك (SPEC §6).
 * «الإيقاف الخاطئ قبل حفل بيوم يعطّل العميل بالكامل» فالتأكيد إلزامي.
 */
export async function toggleClientSending(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await guard('whatsapp_settings');

  const profileId = String(formData.get('profile_id') ?? '');
  const pause = String(formData.get('pause') ?? '') === 'true';
  const reason = String(formData.get('reason') ?? '').trim() || null;

  if (!profileId) return { error: 'العميل غير محدّد.' };
  if (pause && !reason) return { error: 'اكتب سبب الإيقاف — يظهر في سجل النشاط.' };

  const { error } = await supabase
    .from('profiles')
    .update({ sending_paused: pause, paused_reason: pause ? reason : null })
    .eq('id', profileId);

  if (error) return { error: 'تعذّر تنفيذ الإجراء.' };

  await log(supabase, user.id, pause ? 'client.sending_paused' : 'client.sending_resumed',
    'profile', profileId, { reason });

  revalidatePath('/admin/whatsapp');
  revalidatePath('/admin/clients');
  return { notice: pause ? 'أُوقف إرسال العميل.' : 'استُؤنف إرسال العميل.' };
}

/** تغيير دور عضو في الفريق — للمدير وحده. */
export async function setTeamRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await guard('manage_team');

  const profileId = String(formData.get('profile_id') ?? '');
  const role = String(formData.get('role') ?? '') as UserRole;
  const allowed: UserRole[] = ['admin_owner', 'admin_support', 'admin_reviewer', 'admin_finance', 'user'];

  if (!allowed.includes(role)) return { error: 'دور غير صالح.' };
  if (profileId === user.id) return { error: 'لا يمكنك تغيير دورك بنفسك — اطلب ذلك من مدير آخر.' };

  const { error } = await supabase.from('profiles').update({ role }).eq('id', profileId);
  if (error) return { error: 'تعذّر تغيير الدور.' };

  await log(supabase, user.id, 'team.role_changed', 'profile', profileId, { role });

  revalidatePath('/admin/team');
  return { notice: 'حُدّث دور العضو.' };
}
