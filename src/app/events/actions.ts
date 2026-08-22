'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import type { OccasionType } from '@/lib/types';

export interface ActionState { error?: string; notice?: string }

const OCCASIONS: OccasionType[] = ['wedding', 'engagement', 'graduation', 'other'];

/** إنشاء مناسبة جديدة — تبدأ بحالة "بانتظار التفعيل" حتى يعتمدها الأدمن. */
export async function createEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(['owner', 'admin']);
  const supabase = await createClient();

  const host_name = String(formData.get('host_name') ?? '').trim();
  const event_date = String(formData.get('event_date') ?? '').trim();
  const occasion = String(formData.get('occasion_type') ?? 'wedding') as OccasionType;
  const package_id = String(formData.get('package_id') ?? '') || null;
  const template_id = String(formData.get('template_id') ?? '') || null;
  const image_url = String(formData.get('image_url') ?? '').trim() || null;
  const buyer_name = String(formData.get('buyer_name') ?? '').trim() || user.profile.full_name;
  const buyer_phone = String(formData.get('buyer_phone') ?? '').trim() || user.profile.phone;

  if (!host_name) return { error: 'اكتب اسم من ستكون الدعوة باسمه.' };
  if (!event_date) return { error: 'حدّد تاريخ المناسبة.' };
  if (!OCCASIONS.includes(occasion)) return { error: 'نوع المناسبة غير صالح.' };

  const { data, error } = await supabase
    .from('events')
    .insert({
      owner_id: user.id,
      package_id,
      occasion_type: occasion,
      event_date,
      host_name,
      buyer_name,
      buyer_phone,
      template_id,
      image_url,
      seats_quota: 0,          // يُضبط عند التفعيل من الأدمن
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !data) return { error: 'تعذّر إنشاء المناسبة. حاول مرة أخرى.' };

  // الداعي الأول = المالك نفسه
  await supabase.from('inviters').insert({
    event_id: data.id,
    name: buyer_name || 'المالك',
    role_label: 'المالك',
  });

  revalidatePath('/events');
  redirect(`/e/${data.id}`);
}
