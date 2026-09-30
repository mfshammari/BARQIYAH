'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin, requireAdminPermission } from '@/lib/auth';
import { parseFeatures, validateTiers, type TierLike } from '@/lib/packages';
import { UNIFIED_TEMPLATE_BODY, DEFAULT_META_TEMPLATE_NAME } from '@/lib/inviteVars';
import { fetchMetaTemplateStatus } from '@/lib/whatsapp/templates';
import type { PackageKind, TransactionType, WhatsAppCategory } from '@/lib/types';

export interface ActionState { error?: string; notice?: string }

// ————————————————————— الباقات —————————————————————
/** الباقات تنعكس فوراً على كل الشاشات التي تقرأها. */
function revalidatePackages() {
  revalidatePath('/admin/packages');
  revalidatePath('/');
  revalidatePath('/app/events/new');
  revalidatePath('/e/[id]/info', 'layout');
}

/**
 * حفظ باقة (إضافة أو تعديل بـ id مخفي). الثابتة: مقاعد وسعر.
 * المخصّصة: أقل كمية وشرائح تُتحقق هنا وفي القاعدة (TIERS_INVALID).
 */
export async function savePackage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const kind = (String(formData.get('kind') ?? 'fixed') === 'custom' ? 'custom' : 'fixed') as PackageKind;
  const description = String(formData.get('description') ?? '').trim() || null;
  const features = parseFeatures(String(formData.get('features') ?? ''));
  const isFeatured = formData.get('is_featured') === 'on';
  const sortOrder = Math.floor(Number(formData.get('sort_order') ?? 0)) || 0;
  const active = formData.get('active') === 'on';

  if (!name) return { error: 'اسم الباقة مطلوب.' };

  let seats = 0;
  let price = 0;
  let minQty: number | null = null;
  let tiers: TierLike[] = [];

  if (kind === 'fixed') {
    seats = Number(formData.get('seats') ?? 0);
    price = Number(formData.get('price') ?? 0);
    if (!Number.isInteger(seats) || seats <= 0) return { error: 'عدد المقاعد يجب أن يكون رقماً موجباً.' };
    if (!Number.isFinite(price) || price < 0) return { error: 'السعر غير صالح.' };
  } else {
    minQty = Math.floor(Number(formData.get('min_qty') ?? 0));
    try {
      const raw = JSON.parse(String(formData.get('tiers') ?? '[]')) as { min_qty: unknown; unit_price: unknown }[];
      tiers = (Array.isArray(raw) ? raw : []).map((t) => ({
        min_qty: Math.floor(Number(t.min_qty)), unit_price: Number(t.unit_price),
      }));
    } catch {
      return { error: 'الشرائح غير مقروءة.' };
    }
    const issue = validateTiers(tiers, minQty);
    if (issue) return { error: issue };
    seats = minQty;   // للمخصّصة: أقل كمية، والسعر من الشرائح
    price = 0;
  }

  // «مميّزة» واحدة فقط: تُلغى عن البقية قبل الحفظ
  if (isFeatured) {
    await supabase.from('packages').update({ is_featured: false }).eq('is_featured', true);
  }

  const payload = {
    name, kind, seats, price, active, description, features,
    is_featured: isFeatured, sort_order: sortOrder,
    // min_qty للمخصّصة يُضبط داخل set_package_tiers مع الشرائح (يتحقق دفعةً واحدة)
    ...(kind === 'fixed' ? { min_qty: null } : {}),
  };

  let packageId = id;
  if (id) {
    const { error } = await supabase.from('packages').update(payload).eq('id', id);
    if (error) return { error: describePackageError(error.message) };
  } else {
    const { data, error } = await supabase.from('packages').insert(payload).select('id').single();
    if (error || !data) return { error: describePackageError(error?.message ?? '') };
    packageId = data.id;
  }

  if (kind === 'custom') {
    const { error } = await supabase.rpc('set_package_tiers', {
      p_package_id: packageId, p_min_qty: minQty, p_tiers: tiers,
    });
    if (error) return { error: describePackageError(error.message) };
  } else if (id) {
    // تحوّلت من مخصّصة إلى ثابتة: تُحذف شرائحها
    await supabase.from('package_tiers').delete().eq('package_id', id);
  }

  revalidatePackages();
  return { notice: id ? 'تم تحديث الباقة — انعكست على الصفحة الرئيسية.' : 'تمت إضافة الباقة.' };
}

function describePackageError(message: string): string {
  if (message.includes('TIERS_INVALID')) return 'الشرائح غير صالحة: مرتّبة تصاعدياً بالكمية وتنازلياً بالسعر، وأولها من أقل كمية.';
  if (message.includes('packages_single_custom')) return 'توجد باقة مخصّصة واحدة بالفعل — عدّلها بدل إضافة ثانية.';
  if (message.includes('packages_single_featured')) return 'باقة مميّزة واحدة فقط.';
  return 'تعذّر حفظ الباقة.';
}

export async function togglePackage(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = String(formData.get('id') ?? '');
  const active = String(formData.get('active') ?? '') === 'true';
  await supabase.from('packages').update({ active: !active }).eq('id', id);
  revalidatePackages();
}

// ————————————————————— القالب الموحّد —————————————————————
/** الأدمن يحرّر اسم القالب في Meta وتصنيفه فقط — النصّ ثابت للمنصة كلها. */
export async function saveDefaultTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdminPermission('whatsapp_settings');
  const supabase = await createClient();

  const meta_template_name = String(formData.get('meta_template_name') ?? '').trim();
  const whatsapp_category = String(formData.get('whatsapp_category') ?? 'utility') as WhatsAppCategory;

  if (!/^[a-z0-9_]{2,512}$/.test(meta_template_name)) {
    return { error: 'اسم القالب في Meta: حروف إنجليزية صغيرة وأرقام وشرطة سفلية فقط.' };
  }
  if (!['utility', 'marketing'].includes(whatsapp_category)) return { error: 'تصنيف غير صالح.' };

  const { data: existing } = await supabase
    .from('templates').select('id').eq('is_default', true).maybeSingle();

  const { error } = existing
    ? await supabase.from('templates')
        .update({ meta_template_name, whatsapp_category }).eq('id', existing.id)
    : await supabase.from('templates').insert({
        owner_id: null, name: 'قالب برقية الموحّد', body_text: UNIFIED_TEMPLATE_BODY,
        status: 'approved', whatsapp_category, meta_template_name, is_default: true,
      });

  if (error) return { error: 'تعذّر حفظ إعدادات القالب.' };
  revalidatePath('/admin/templates');
  return { notice: 'حُفظت إعدادات القالب الموحّد.' };
}

/** يقرأ حالة القالب لدى Meta ويخزّنها في meta_status. */
export async function checkMetaTemplateStatus(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  await requireAdminPermission('whatsapp_settings');
  const supabase = await createClient();

  const { data: tpl } = await supabase
    .from('templates').select('id, meta_template_name').eq('is_default', true).maybeSingle();
  const name = tpl?.meta_template_name || DEFAULT_META_TEMPLATE_NAME;

  const res = await fetchMetaTemplateStatus(name);
  if (!res.ok) {
    if (res.error === 'MOCK_MODE') {
      return { notice: 'وضع المحاكاة — لا اتصال بـ Meta. اضبط مفاتيح واتساب أولاً.' };
    }
    return { error: `تعذّر القراءة من Meta: ${res.error ?? ''}` };
  }

  const status = res.status ?? 'NOT_FOUND';
  if (tpl) {
    await supabase.from('templates').update({ meta_status: status }).eq('id', tpl.id);
  }
  revalidatePath('/admin/templates');
  return {
    notice: res.status
      ? `حالة القالب «${name}» لدى Meta: ${res.status}${res.category ? ` · ${res.category}` : ''}`
      : `لم يُعثر على قالب باسم «${name}» لدى Meta.`,
  };
}

// ————————————————————— تفعيل المناسبات —————————————————————
export async function activateEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdminPermission('manual_activation');
  const supabase = await createClient();

  const eventId = String(formData.get('event_id') ?? '');
  const packageId = String(formData.get('package_id') ?? '');
  const type = (String(formData.get('type') ?? 'manual_activation') || 'manual_activation') as TransactionType;
  const note = String(formData.get('note') ?? '').trim() || null;
  const qtyRaw = Math.floor(Number(formData.get('qty') ?? 0));
  const qty = qtyRaw > 0 ? qtyRaw : null;

  if (!eventId || !packageId) return { error: 'اختر الباقة أولاً.' };

  const { data, error } = await supabase.rpc('admin_activate_event', {
    p_event_id: eventId,
    p_package_id: packageId,
    p_type: type,
    p_note: note,
    p_qty: qty,
  });

  if (error) return { error: 'تعذّر تفعيل المناسبة.' };
  const res = data as { ok: boolean; reason?: string; seats_quota?: number };
  if (!res?.ok) {
    const reasons: Record<string, string> = {
      QTY_REQUIRED: 'الباقة المخصّصة تحتاج عدد الدعوات.',
      PACKAGE_NOT_FOUND: 'الباقة غير موجودة.',
      EVENT_NOT_FOUND: 'المناسبة غير موجودة.',
    };
    return { error: 'تعذّر التفعيل: ' + (reasons[res?.reason ?? ''] ?? res?.reason ?? 'سبب غير معروف') };
  }

  revalidatePath('/admin/events');
  revalidatePath(`/e/${eventId}`);
  return { notice: `تم التفعيل — الرصيد الآن ${res.seats_quota} مقعداً.` };
}

export async function setEventStatus(formData: FormData) {
  await requireAdminPermission('manual_activation');
  const supabase = await createClient();
  const id = String(formData.get('event_id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!['pending', 'active', 'closed'].includes(status)) return;
  await supabase.from('events').update({ status }).eq('id', id);
  revalidatePath('/admin/events');
}

// ————————————————————— إعدادات Meta —————————————————————
export async function saveIntegration(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdminPermission('whatsapp_settings');
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
