'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { formatHijri, formatWeekday } from '@/lib/format';
import { hasTwoCelebrants, type OccasionType } from '@/lib/types';

export interface ActionState { error?: string; notice?: string }

const OCCASIONS: OccasionType[] = [
  'wedding', 'engagement', 'engagement_contract', 'graduation', 'newborn', 'official', 'other',
];

/**
 * إنشاء مناسبة. تبدأ بحالة «غير مدفوعة» — الدفع عبر البوابة يفعّلها
 * تلقائياً، وبدونه تنتظر تفعيلاً يدوياً من الفريق (SPEC §5).
 */
export async function createEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const supabase = await createClient();

  const occasion = String(formData.get('occasion_type') ?? 'wedding') as OccasionType;
  const eventDate = String(formData.get('event_date') ?? '').trim();
  const hostName = String(formData.get('host_name') ?? '').trim();
  const celebrant1 = String(formData.get('celebrant_primary') ?? '').trim();
  const celebrant2 = String(formData.get('celebrant_secondary') ?? '').trim() || null;
  const internalName = String(formData.get('internal_name') ?? '').trim() || null;
  const venue = String(formData.get('venue') ?? '').trim() || null;
  const eventTime = String(formData.get('event_time') ?? '').trim() || null;
  const packageId = String(formData.get('package_id') ?? '') || null;
  const templateId = String(formData.get('template_id') ?? '') || null;
  const imageUrl = String(formData.get('image_url') ?? '').trim() || null;

  if (!OCCASIONS.includes(occasion)) return { error: 'نوع المناسبة غير صالح.' };
  if (!eventDate) return { error: 'حدّد تاريخ المناسبة.' };
  if (!hostName) return { error: 'اكتب الجهة الداعية («الدعوة باسم»).' };
  if (!celebrant1) return { error: 'اكتب اسم صاحب المناسبة.' };
  if (hasTwoCelebrants(occasion) && !celebrant2) {
    // العروس اختيارية حسب المواصفة، فلا نمنع — نكمل
  }

  const { data, error } = await supabase
    .from('events')
    .insert({
      owner_id: user.id,
      package_id: packageId,
      occasion_type: occasion,
      event_date: eventDate,
      event_date_hijri: formatHijri(eventDate),
      event_weekday: formatWeekday(eventDate),
      event_time: eventTime,
      venue,
      internal_name: internalName || `${hostName} — ${eventDate}`,
      host_name: hostName,
      celebrant_primary: celebrant1,
      celebrant_secondary: hasTwoCelebrants(occasion) ? celebrant2 : null,
      buyer_name: user.profile.full_name,
      buyer_phone: user.profile.phone,
      template_id: templateId,
      image_url: imageUrl,
      seats_quota: 0,          // يُضبط عند التفعيل بعد الدفع
      status: 'unpaid',
    })
    .select('id')
    .single();

  if (error || !data) return { error: 'تعذّر إنشاء المناسبة. حاول مرة أخرى.' };

  // المالك أول داعٍ في مناسبته، بحسابه نفسه
  await supabase.from('inviters').insert({
    event_id: data.id,
    profile_id: user.id,
    name: user.profile.full_name || 'المالك',
    phone: user.profile.phone,
    role_label: 'المالك',
    seats_quota: 0,
  });

  await supabase.from('activity_logs').insert({
    actor_id: user.id,
    action: 'event.created',
    target_type: 'event',
    target_id: data.id,
    metadata: { occasion, host_name: hostName },
  });

  revalidatePath('/app');
  redirect(`/e/${data.id}/info`);
}
