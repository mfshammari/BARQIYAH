'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import type { TransactionType, WhatsAppCategory } from '@/lib/types';

export interface ActionState { error?: string; notice?: string }

// ————————————————————— الباقات —————————————————————
export async function savePackage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole('admin');
  const supabase = await createClient();

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const seats = Number(formData.get('seats') ?? 0);
  const price = Number(formData.get('price') ?? 0);
  const active = formData.get('active') === 'on';

  if (!name) return { error: 'اسم الباقة مطلوب.' };
  if (!Number.isInteger(seats) || seats <= 0) return { error: 'عدد المقاعد يجب أن يكون رقماً موجباً.' };
  if (price < 0) return { error: 'السعر غير صالح.' };

  const payload = { name, seats, price, active };
  const { error } = id
    ? await supabase.from('packages').update(payload).eq('id', id)
    : await supabase.from('packages').insert(payload);

  if (error) return { error: 'تعذّر حفظ الباقة.' };
  revalidatePath('/admin/packages');
  return { notice: id ? 'تم تحديث الباقة.' : 'تمت إضافة الباقة.' };
}

export async function togglePackage(formData: FormData) {
  await requireRole('admin');
  const supabase = await createClient();
  const id = String(formData.get('id') ?? '');
  const active = String(formData.get('active') ?? '') === 'true';
  await supabase.from('packages').update({ active: !active }).eq('id', id);
  revalidatePath('/admin/packages');
}

// ————————————————————— القوالب العامة —————————————————————
export async function saveGlobalTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole('admin');
  const supabase = await createClient();

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const body_text = String(formData.get('body_text') ?? '').trim();
  const image_url = String(formData.get('image_url') ?? '').trim() || null;
  const meta_template_name = String(formData.get('meta_template_name') ?? '').trim() || null;
  const whatsapp_category = String(formData.get('whatsapp_category') ?? 'utility') as WhatsAppCategory;
  const approved = formData.get('approved') === 'on';

  if (!name) return { error: 'اسم القالب مطلوب.' };
  if (!body_text) return { error: 'نص القالب مطلوب.' };

  const payload = {
    owner_id: null,
    name, body_text, image_url, meta_template_name, whatsapp_category,
    status: approved ? ('approved' as const) : ('draft' as const),
  };

  const { error } = id
    ? await supabase.from('templates').update(payload).eq('id', id)
    : await supabase.from('templates').insert(payload);

  if (error) return { error: 'تعذّر حفظ القالب.' };
  revalidatePath('/admin/templates');
  return { notice: id ? 'تم تحديث القالب.' : 'تمت إضافة القالب.' };
}

export async function deleteTemplate(formData: FormData) {
  await requireRole('admin');
  const supabase = await createClient();
  await supabase.from('templates').delete().eq('id', String(formData.get('id') ?? ''));
  revalidatePath('/admin/templates');
}

// ————————————————————— طلبات القوالب الخاصة —————————————————————
export async function reviewTemplateRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole('admin');
  const supabase = await createClient();

  const id = String(formData.get('id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const reason = String(formData.get('rejection_reason') ?? '').trim();
  const metaName = String(formData.get('meta_template_name') ?? '').trim() || null;

  if (!id) return { error: 'الطلب غير موجود.' };

  if (decision === 'approve') {
    const { error } = await supabase
      .from('templates')
      .update({ status: 'approved', rejection_reason: null, meta_template_name: metaName })
      .eq('id', id);
    if (error) return { error: 'تعذّر اعتماد القالب.' };
    revalidatePath('/admin/template-requests');
    return { notice: 'تم اعتماد القالب.' };
  }

  if (decision === 'reject') {
    if (!reason) return { error: 'اكتب سبب الرفض ليصل لصاحب المناسبة.' };
    const { error } = await supabase
      .from('templates')
      .update({ status: 'rejected', rejection_reason: reason })
      .eq('id', id);
    if (error) return { error: 'تعذّر رفض القالب.' };
    revalidatePath('/admin/template-requests');
    return { notice: 'تم رفض القالب مع إرسال السبب.' };
  }

  return { error: 'قرار غير معروف.' };
}

// ————————————————————— تفعيل المناسبات —————————————————————
export async function activateEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole('admin');
  const supabase = await createClient();

  const eventId = String(formData.get('event_id') ?? '');
  const packageId = String(formData.get('package_id') ?? '');
  const type = (String(formData.get('type') ?? 'manual_activation') || 'manual_activation') as TransactionType;
  const note = String(formData.get('note') ?? '').trim() || null;

  if (!eventId || !packageId) return { error: 'اختر الباقة أولاً.' };

  const { data, error } = await supabase.rpc('admin_activate_event', {
    p_event_id: eventId,
    p_package_id: packageId,
    p_type: type,
    p_note: note,
  });

  if (error) return { error: 'تعذّر تفعيل المناسبة.' };
  const res = data as { ok: boolean; reason?: string; seats_quota?: number };
  if (!res?.ok) return { error: 'تعذّر التفعيل: ' + (res?.reason ?? 'سبب غير معروف') };

  revalidatePath('/admin/events');
  revalidatePath(`/e/${eventId}`);
  return { notice: `تم التفعيل — الرصيد الآن ${res.seats_quota} مقعداً.` };
}

export async function setEventStatus(formData: FormData) {
  await requireRole('admin');
  const supabase = await createClient();
  const id = String(formData.get('event_id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!['pending', 'active', 'closed'].includes(status)) return;
  await supabase.from('events').update({ status }).eq('id', id);
  revalidatePath('/admin/events');
}

// ————————————————————— إعدادات Meta —————————————————————
export async function saveIntegration(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole('admin');
  const supabase = await createClient();

  const payload = {
    phone_number_id: String(formData.get('phone_number_id') ?? '').trim() || null,
    waba_id: String(formData.get('waba_id') ?? '').trim() || null,
    verify_token: String(formData.get('verify_token') ?? '').trim() || null,
    updated_at: new Date().toISOString(),
  };
  const token = String(formData.get('access_token') ?? '').trim();

  const { data: existing } = await supabase
    .from('integration_settings').select('id').limit(1).maybeSingle();

  const full = token ? { ...payload, access_token: token } : payload;

  const { error } = existing
    ? await supabase.from('integration_settings').update(full).eq('id', existing.id)
    : await supabase.from('integration_settings').insert(full);

  if (error) return { error: 'تعذّر حفظ الإعدادات.' };
  revalidatePath('/admin/integration');
  return { notice: 'تم حفظ إعدادات واتساب.' };
}
