'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/auth';
import { sendInvitations, sendReminders } from '@/lib/invitations';
import { formatNumber } from '@/lib/format';
import { normalizePhone, isValidPhone } from '@/lib/format';
import type { EventRow, Guest, OccasionType, Package, WhatsAppCategory } from '@/lib/types';
import { getPaymentProvider } from '@/lib/payments';
import { appUrl } from '@/lib/env';
import { redirect } from 'next/navigation';

export interface ActionState { error?: string; notice?: string }

/** يتحقق أن المستخدم يملك المناسبة (أو أدمن) ويعيد عميل Supabase. */
async function guardEvent(eventId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: event } = await supabase
    .from('events').select('*').eq('id', eventId).maybeSingle<EventRow>();
  if (!event) throw new Error('EVENT_NOT_FOUND');
  if (event.owner_id !== user.id && user.profile.role !== 'admin') throw new Error('FORBIDDEN');
  return { user, supabase, event };
}

function revalidateEvent(eventId: string) {
  revalidatePath(`/e/${eventId}`);
  revalidatePath(`/e/${eventId}/guests`);
  revalidatePath(`/e/${eventId}/inviters`);
}

/** يصوغ نتيجة الإرسال في رسالة عربية واحدة. */
function describeOutcomes(outcomes: { ok: boolean; name: string; reason?: string; missingSeats?: number }[]): ActionState {
  const sent = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.filter((o) => !o.ok);

  if (failed.length === 0) return { notice: `تم إرسال ${sent} دعوة بنجاح.` };

  const shortage = failed.filter((f) => f.missingSeats);
  const missingTotal = shortage.reduce((s, f) => s + (f.missingSeats ?? 0), 0);

  const parts: string[] = [];
  if (sent) parts.push(`تم إرسال ${sent} دعوة.`);
  if (shortage.length) {
    parts.push(
      `تعذّر إرسال ${shortage.length} دعوة لنقص الرصيد — ينقصك ${missingTotal} مقعداً. ` +
      'قلّل عدد المقاعد أو رقِّ الباقة.',
    );
  }
  const others = failed.filter((f) => !f.missingSeats);
  if (others.length) {
    const names = others.slice(0, 3).map((f) => f.name).filter(Boolean).join('، ');
    parts.push(`فشل إرسال ${others.length}: ${others[0].reason ?? ''}${names ? ` (${names})` : ''}`);
  }

  return sent ? { notice: parts.join(' ') } : { error: parts.join(' ') };
}

// ————————————————————— المدعوون —————————————————————
export async function addGuest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase } = await guardEvent(eventId);

  const name = String(formData.get('name') ?? '').trim();
  const rawPhone = String(formData.get('phone') ?? '').trim();
  const maxSeats = Number(formData.get('max_seats') ?? 1);
  const inviterId = String(formData.get('inviter_id') ?? '') || null;
  const sendNow = formData.get('send_now') === 'on';

  if (!name) return { error: 'اسم المدعو مطلوب.' };
  if (!isValidPhone(rawPhone)) return { error: 'رقم الجوال غير صالح. مثال: 0555123456' };
  if (!Number.isInteger(maxSeats) || maxSeats < 1 || maxSeats > 50) {
    return { error: 'عدد الأشخاص يجب أن يكون بين ١ و٥٠.' };
  }

  const phone = normalizePhone(rawPhone);
  const { data, error } = await supabase
    .from('guests')
    .insert({
      event_id: eventId, name, phone, max_seats: maxSeats,
      inviter_id: inviterId, status: 'draft',
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'هذا الرقم مضاف مسبقاً في هذه المناسبة.' };
    return { error: 'تعذّرت إضافة المدعو.' };
  }

  revalidateEvent(eventId);

  if (sendNow && data) {
    const outcomes = await sendInvitations(supabase, eventId, [data.id]);
    revalidateEvent(eventId);
    const res = describeOutcomes(outcomes);
    return res.error
      ? { error: `أُضيف المدعو، لكن ${res.error}` }
      : { notice: `تمت إضافة ${name} وإرسال الدعوة.` };
  }

  return { notice: `تمت إضافة ${name} كمسودة.` };
}

/** رفع ملف Excel/CSV: الأعمدة = الاسم | الجوال | عدد الأشخاص | الداعي */
export async function importGuests(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase } = await guardEvent(eventId);

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'اختر ملفاً أولاً.' };
  if (file.size > 5 * 1024 * 1024) return { error: 'حجم الملف أكبر من ٥ ميغابايت.' };

  const sendNow = formData.get('send_now') === 'on';

  const XLSX = await import('xlsx');
  let rows: Record<string, unknown>[];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return { error: 'الملف لا يحتوي على أي ورقة بيانات.' };
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  } catch {
    return { error: 'تعذّرت قراءة الملف. تأكد أنه بصيغة Excel أو CSV.' };
  }

  if (rows.length === 0) return { error: 'الملف فارغ.' };
  if (rows.length > 2000) return { error: 'الحد الأقصى ٢٠٠٠ صف في الرفعة الواحدة.' };

  const pick = (row: Record<string, unknown>, keys: string[]): string => {
    for (const key of Object.keys(row)) {
      const norm = key.trim().toLowerCase();
      if (keys.some((k) => norm === k || norm.includes(k))) {
        const v = row[key];
        if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
      }
    }
    return '';
  };

  const { data: inviters } = await supabase
    .from('inviters').select('id, name').eq('event_id', eventId);
  const inviterByName = new Map((inviters ?? []).map((i) => [i.name.trim(), i.id]));

  const valid: { event_id: string; name: string; phone: string; max_seats: number; inviter_id: string | null; status: 'draft' }[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const row of rows) {
    const name = pick(row, ['الاسم', 'اسم', 'name', 'guest']);
    const phoneRaw = pick(row, ['الجوال', 'جوال', 'الهاتف', 'phone', 'mobile', 'رقم']);
    const seatsRaw = pick(row, ['عدد', 'المقاعد', 'أشخاص', 'اشخاص', 'seats', 'count']);
    const inviterName = pick(row, ['الداعي', 'داعي', 'inviter']);

    if (!name || !isValidPhone(phoneRaw)) { skipped++; continue; }

    const phone = normalizePhone(phoneRaw);
    if (seen.has(phone)) { skipped++; continue; }
    seen.add(phone);

    const parsedSeats = Number(String(seatsRaw).replace(/[^\d]/g, ''));
    const maxSeats = Number.isFinite(parsedSeats) && parsedSeats >= 1 ? Math.min(parsedSeats, 50) : 1;

    valid.push({
      event_id: eventId, name, phone, max_seats: maxSeats,
      inviter_id: inviterName ? inviterByName.get(inviterName) ?? null : null,
      status: 'draft',
    });
  }

  if (valid.length === 0) {
    return { error: 'لم يُقرأ أي صف صالح. تأكد من وجود عمودَي «الاسم» و«الجوال».' };
  }

  const { data: inserted, error } = await supabase
    .from('guests')
    .upsert(valid, { onConflict: 'event_id,phone', ignoreDuplicates: true })
    .select('id');

  if (error) return { error: 'تعذّر حفظ المدعوين من الملف.' };

  const added = inserted?.length ?? 0;
  const duplicates = valid.length - added;
  revalidateEvent(eventId);

  let message = `تمت إضافة ${added} مدعواً.`;
  if (duplicates > 0) message += ` (${duplicates} مكرر تم تجاهله)`;
  if (skipped > 0) message += ` (${skipped} صفاً غير صالح تم تخطيه)`;

  if (sendNow && added > 0) {
    const outcomes = await sendInvitations(supabase, eventId, (inserted ?? []).map((g) => g.id));
    revalidateEvent(eventId);
    const res = describeOutcomes(outcomes);
    return { notice: `${message} ${res.notice ?? ''}`, error: res.error };
  }

  return { notice: message };
}

/** إرسال دعوات: مدعو واحد، أو مجموعة محددة، أو كل المسودّات. */
export async function sendGuestInvitations(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase } = await guardEvent(eventId);

  const scope = String(formData.get('scope') ?? 'selected');
  let guestIds: string[] = [];

  if (scope === 'all_drafts') {
    const { data } = await supabase
      .from('guests').select('id').eq('event_id', eventId).eq('status', 'draft')
      .returns<Pick<Guest, 'id'>[]>();
    guestIds = (data ?? []).map((g) => g.id);
  } else {
    guestIds = formData.getAll('guest_ids').map(String).filter(Boolean);
  }

  if (guestIds.length === 0) return { error: 'لا توجد دعوات مسودة للإرسال.' };
  if (guestIds.length > 500) return { error: 'الحد الأقصى ٥٠٠ دعوة في الدفعة الواحدة.' };

  const outcomes = await sendInvitations(supabase, eventId, guestIds);
  revalidateEvent(eventId);
  return describeOutcomes(outcomes);
}

export async function updateGuest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase } = await guardEvent(eventId);

  const guestId = String(formData.get('guest_id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const maxSeats = Number(formData.get('max_seats') ?? 1);
  const inviterId = String(formData.get('inviter_id') ?? '') || null;

  if (!guestId) return { error: 'المدعو غير موجود.' };
  if (!name) return { error: 'اسم المدعو مطلوب.' };
  if (!Number.isInteger(maxSeats) || maxSeats < 1 || maxSeats > 50) {
    return { error: 'عدد الأشخاص يجب أن يكون بين ١ و٥٠.' };
  }

  const { data: current } = await supabase
    .from('guests').select('status, max_seats, confirmed_seats')
    .eq('id', guestId).eq('event_id', eventId).maybeSingle<Guest>();
  if (!current) return { error: 'المدعو غير موجود.' };

  // دعوة مُرسلة تحجز max_seats — زيادته تستهلك رصيداً إضافياً، فنتحقق أولاً
  if (current.status === 'sent' && maxSeats > current.max_seats) {
    const { data: balance } = await supabase.rpc('event_balance', { p_event_id: eventId });
    const available = (Array.isArray(balance) ? balance[0] : balance)?.available ?? 0;
    const extra = maxSeats - current.max_seats;
    if (extra > available) {
      return {
        error: `الرصيد لا يكفي: زيادة ${extra} مقاعد تحتاج رصيداً متاحاً، والمتاح ${available} فقط.`,
      };
    }
  }

  // بعد التأكيد يصبح العدد الفعلي هو المرجع، فلا يجوز أن ينزل الحد الأقصى دونه
  if (current.confirmed_seats != null && maxSeats < current.confirmed_seats) {
    return {
      error: `المدعو أكّد ${current.confirmed_seats} مقاعد — لا يمكن جعل الحد الأقصى أقل منها.`,
    };
  }

  const { error } = await supabase
    .from('guests')
    .update({ name, max_seats: maxSeats, inviter_id: inviterId })
    .eq('id', guestId).eq('event_id', eventId);

  if (error) return { error: 'تعذّر تحديث بيانات المدعو.' };
  revalidateEvent(eventId);
  return { notice: 'تم تحديث بيانات المدعو.' };
}

export async function deleteGuest(formData: FormData) {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase } = await guardEvent(eventId);
  await supabase.from('guests').delete()
    .eq('id', String(formData.get('guest_id') ?? '')).eq('event_id', eventId);
  revalidateEvent(eventId);
}

// ————————————————————— الدعاة —————————————————————
/**
 * إضافة داعٍ: المالك يحدّد الاسم والجوال والصفة والحصة فقط.
 * النص والقالب والصورة يملكها الداعي وحده (SPEC §8.2).
 * إن كان الرقم لمستخدم قائم رُبط حسابه مباشرة، وإلا وصله رابط ينشئ به حسابه.
 */
export async function addInviter(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase, event } = await guardEvent(eventId);

  const name = String(formData.get('name') ?? '').trim();
  const rawPhone = String(formData.get('phone') ?? '').trim();
  const roleLabel = String(formData.get('role_label') ?? 'داعٍ').trim() || 'داعٍ';
  const sideLabel = String(formData.get('side_label') ?? '').trim() || null;
  const seatsQuota = Number(formData.get('seats_quota') ?? 0);

  if (!name) return { error: 'اسم الداعي مطلوب.' };
  if (!isValidPhone(rawPhone)) return { error: 'جوال الداعي مطلوب ليدخل ويكتب دعوته.' };
  if (!Number.isInteger(seatsQuota) || seatsQuota < 0) return { error: 'الحصة يجب أن تكون رقماً موجباً.' };

  const phone = normalizePhone(rawPhone);

  // ربط حساب قائم بنفس الرقم إن وُجد
  let profileId: string | null = null;
  if (adminClientAvailable) {
    try {
      const { data: existing } = await createAdminClient()
        .from('profiles').select('id').eq('phone', phone).limit(1).maybeSingle();
      profileId = existing?.id ?? null;
    } catch { /* الربط اختياري */ }
  }

  const { data, error } = await supabase
    .from('inviters')
    .insert({
      event_id: eventId, name, phone, role_label: roleLabel,
      side_label: sideLabel, seats_quota: seatsQuota, profile_id: profileId,
      joined_at: profileId ? new Date().toISOString() : null,
    })
    .select('invite_token')
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'هذا الرقم مضاف كداعٍ في هذه المناسبة.' };
    if (error.message.includes('QUOTA_EXCEEDS_EVENT_SEATS')) {
      const left = event.seats_quota;
      return { error: `الحصة تتجاوز المتاح للتوزيع من رصيد المناسبة (${left} مقعداً).` };
    }
    return { error: 'تعذّرت إضافة الداعي.' };
  }

  revalidateEvent(eventId);
  return {
    notice: profileId
      ? `أُضيف ${name} — المناسبة ظهرت في حسابه مباشرة.`
      : `أُضيف ${name} — شارك معه رابط الدخول ليكتب دعوته.`,
  };
}

/** تعديل حصة داعٍ — المالك وحده يوزّع (SPEC §8.2). */
export async function updateInviterQuota(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase } = await guardEvent(eventId);

  const inviterId = String(formData.get('inviter_id') ?? '');
  const seatsQuota = Number(formData.get('seats_quota') ?? 0);
  if (!Number.isInteger(seatsQuota) || seatsQuota < 0) return { error: 'حصة غير صالحة.' };

  const { error } = await supabase
    .from('inviters').update({ seats_quota: seatsQuota })
    .eq('id', inviterId).eq('event_id', eventId);

  if (error) {
    if (error.message.includes('QUOTA_EXCEEDS_EVENT_SEATS')) {
      return { error: 'مجموع الحصص يتجاوز رصيد المناسبة — قلّل الحصة أو رقِّ الباقة.' };
    }
    return { error: 'تعذّر تعديل الحصة.' };
  }

  revalidateEvent(eventId);
  return { notice: 'حُدّثت الحصة.' };
}

export async function deleteInviter(formData: FormData) {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase } = await guardEvent(eventId);
  await supabase.from('inviters').delete()
    .eq('id', String(formData.get('inviter_id') ?? '')).eq('event_id', eventId);
  revalidateEvent(eventId);
}

// ————————————————————— القالب —————————————————————
export async function selectTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase } = await guardEvent(eventId);

  const templateId = String(formData.get('template_id') ?? '');
  if (!templateId) return { error: 'اختر قالباً.' };

  const { error } = await supabase
    .from('events').update({ template_id: templateId }).eq('id', eventId);
  if (error) return { error: 'تعذّر اختيار القالب.' };

  revalidatePath(`/e/${eventId}/template`);
  revalidatePath(`/e/${eventId}`);
  return { notice: 'تم اعتماد القالب لهذه المناسبة.' };
}

export async function requestCustomTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase, user } = await guardEvent(eventId);

  const name = String(formData.get('name') ?? '').trim();
  const bodyText = String(formData.get('body_text') ?? '').trim();
  const imageUrl = String(formData.get('image_url') ?? '').trim() || null;
  const category = String(formData.get('whatsapp_category') ?? 'utility') as WhatsAppCategory;

  if (!name) return { error: 'اسم القالب مطلوب.' };
  if (!bodyText) return { error: 'نص القالب مطلوب.' };

  const { error } = await supabase.from('templates').insert({
    owner_id: user.id, name, body_text: bodyText, image_url: imageUrl,
    whatsapp_category: category, status: 'under_review',
  });

  if (error) return { error: 'تعذّر تقديم الطلب.' };
  revalidatePath(`/e/${eventId}/template`);
  return { notice: 'أُرسل الطلب للمراجعة. سيصلك القرار بعد اعتماد القالب لدى Meta.' };
}

// ————————————————————— حسابات المسح —————————————————————
export async function createScannerAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase } = await guardEvent(eventId);

  if (!adminClientAvailable) {
    return { error: 'إنشاء الحسابات يتطلب ضبط SUPABASE_SERVICE_ROLE_KEY.' };
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const label = String(formData.get('label') ?? '').trim() || 'ماسح';

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'أدخل بريداً إلكترونياً صحيحاً.' };
  if (password.length < 8) return { error: 'كلمة المرور يجب أن تكون ٨ أحرف على الأقل.' };

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { role: 'scanner', full_name: label },
  });

  let profileId = created?.user?.id;

  if (createError) {
    // البريد مستخدم مسبقاً: نربط الحساب القائم إن كان دوره ماسحاً
    const { data: existingProfiles } = await admin
      .from('profiles').select('id, role').eq('role', 'scanner');
    const { data: usersList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const match = usersList?.users.find((u) => u.email?.toLowerCase() === email);
    const isScanner = match && existingProfiles?.some((p) => p.id === match.id);
    if (!match || !isScanner) {
      return { error: 'هذا البريد مستخدم في حساب آخر. اختر بريداً مختلفاً.' };
    }
    profileId = match.id;
  }

  if (!profileId) return { error: 'تعذّر إنشاء حساب الماسح.' };

  // ضمان الدور والاسم (الـ trigger قد يُنشئ الملف بدور افتراضي)
  await admin.from('profiles')
    .upsert({ id: profileId, role: 'scanner', full_name: label }, { onConflict: 'id' });

  const { error: linkError } = await supabase
    .from('scanners').insert({ event_id: eventId, profile_id: profileId, label });

  if (linkError) {
    if (linkError.code === '23505') return { error: 'هذا الحساب مرتبط بالمناسبة مسبقاً.' };
    return { error: 'تعذّر ربط الحساب بالمناسبة.' };
  }

  revalidatePath(`/e/${eventId}/scanners`);
  return { notice: `تم إنشاء حساب «${label}». شارك البريد وكلمة المرور مع الماسح.` };
}

export async function deleteScanner(formData: FormData) {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase } = await guardEvent(eventId);
  await supabase.from('scanners').delete()
    .eq('id', String(formData.get('scanner_id') ?? '')).eq('event_id', eventId);
  revalidatePath(`/e/${eventId}/scanners`);
}

// ————————————————————— بيانات المناسبة —————————————————————
export async function updateEventInfo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase } = await guardEvent(eventId);

  const hostName = String(formData.get('host_name') ?? '').trim();
  const eventDate = String(formData.get('event_date') ?? '').trim();
  const occasion = String(formData.get('occasion_type') ?? 'wedding') as OccasionType;
  const buyerName = String(formData.get('buyer_name') ?? '').trim() || null;
  const buyerPhone = String(formData.get('buyer_phone') ?? '').trim() || null;
  const imageUrl = String(formData.get('image_url') ?? '').trim() || null;

  if (!hostName) return { error: 'اسم صاحب الدعوة مطلوب.' };
  if (!eventDate) return { error: 'تاريخ المناسبة مطلوب.' };

  const { error } = await supabase.from('events').update({
    host_name: hostName, event_date: eventDate, occasion_type: occasion,
    buyer_name: buyerName, buyer_phone: buyerPhone, image_url: imageUrl,
  }).eq('id', eventId);

  if (error) return { error: 'تعذّر حفظ بيانات المناسبة.' };
  revalidatePath(`/e/${eventId}/info`);
  revalidatePath(`/e/${eventId}`);
  return { notice: 'تم حفظ البيانات.' };
}

/**
 * شراء باقة أو ترقية.
 * مع بوابة مضبوطة: يُنشأ طلب دفع ويُحوَّل العميل للبوابة، والتفعيل
 * يتم تلقائياً عبر الـwebhook بعد السداد (SPEC §5).
 * بلا بوابة: يُسجَّل طلب معلّق ينفّذه الفريق يدوياً.
 */
export async function requestUpgrade(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase, event } = await guardEvent(eventId);

  const packageId = String(formData.get('package_id') ?? '');
  if (!packageId) return { error: 'اختر الباقة المطلوبة.' };

  const { data: pkg } = await supabase
    .from('packages').select('*').eq('id', packageId).maybeSingle<Package>();
  if (!pkg) return { error: 'الباقة غير متاحة.' };

  // عملية معلّقة يعود معرّفها في الـwebhook (أو في المحاكاة)
  const { data: txId, error: txError } = await supabase.rpc('create_pending_payment', {
    p_event_id: eventId,
    p_package_id: packageId,
  });
  if (txError || !txId) return { error: 'تعذّر بدء عملية الدفع.' };

  const provider = getPaymentProvider();
  const result = await provider.createCheckout({
    eventId,
    packageId,
    transactionId: String(txId),
    amount: Number(pkg.price),
    description: `برقية — ${pkg.name} لمناسبة ${event.host_name}`,
    callbackUrl: appUrl(`/e/${eventId}/info?paid=1`),
  });

  if (!result.ok || !result.redirectUrl) {
    await supabase.rpc('fail_payment', {
      p_transaction_id: txId, p_reason: result.error ?? 'تعذّر إنشاء طلب الدفع',
    });
    return { error: result.error ? `تعذّر بدء الدفع: ${result.error}` : 'تعذّر بدء الدفع.' };
  }

  redirect(result.redirectUrl);
}

/**
 * تذكير من لم يردّ — رسالة واحدة فقط لمن مضى على دعوته ٥ أيام
 * ولم يُذكَّر من قبل (SPEC §4.1). الشرطان محسومان في القاعدة،
 * فالضغط مرّتين لا يذكّر أحداً مرّتين.
 */
export async function remindPending(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get('event_id') ?? '');
  const { supabase } = await guardEvent(eventId);

  const result = await sendReminders(supabase, eventId);

  revalidatePath(`/e/${eventId}`);
  revalidatePath(`/e/${eventId}/guests`);

  if (result.none) return { notice: 'لا أحد مؤهّل للتذكير الآن.' };
  if (result.failed > 0) {
    return {
      notice: `ذُكِّر ${formatNumber(result.sent)}، وتعذّر إرسال ${formatNumber(result.failed)}.`,
    };
  }
  return { notice: `أُرسل التذكير إلى ${formatNumber(result.sent)} مدعواً — مرة واحدة فقط.` };
}
