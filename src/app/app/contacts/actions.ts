'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { normalizePhone, isValidPhone } from '@/lib/format';

export interface ActionState { error?: string; notice?: string }

export async function addContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const supabase = await createClient();

  const name = String(formData.get('name') ?? '').trim();
  const rawPhone = String(formData.get('phone') ?? '').trim();
  const group = String(formData.get('group_label') ?? '').trim() || null;
  const notes = String(formData.get('notes') ?? '').trim() || null;

  if (!name) return { error: 'اسم الجهة مطلوب.' };
  if (!isValidPhone(rawPhone)) return { error: 'رقم الجوال غير صالح.' };

  const { error } = await supabase.from('contacts').insert({
    owner_id: user.id, name, phone: normalizePhone(rawPhone), group_label: group, notes,
  });

  if (error) {
    if (error.code === '23505') return { error: 'هذا الرقم موجود في دفترك مسبقاً.' };
    return { error: 'تعذّرت الإضافة.' };
  }

  revalidatePath('/app/contacts');
  return { notice: `أُضيف ${name} إلى دفترك.` };
}

/** رفع Excel/CSV إلى الدفتر: الأعمدة = الاسم | الجوال | المجموعة */
export async function importContacts(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const supabase = await createClient();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'اختر ملفاً أولاً.' };
  if (file.size > 5 * 1024 * 1024) return { error: 'حجم الملف أكبر من ٥ ميغابايت.' };

  const XLSX = await import('xlsx');
  let rows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return { error: 'الملف لا يحتوي على ورقة بيانات.' };
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  } catch {
    return { error: 'تعذّرت قراءة الملف. تأكد أنه Excel أو CSV.' };
  }

  if (rows.length === 0) return { error: 'الملف فارغ.' };
  if (rows.length > 5000) return { error: 'الحد الأقصى ٥٠٠٠ صف في الرفعة.' };

  const pick = (row: Record<string, unknown>, keys: string[]): string => {
    for (const key of Object.keys(row)) {
      const norm = key.trim().toLowerCase();
      if (keys.some((k) => norm === k || norm.includes(k))) {
        const v = row[key];
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
    }
    return '';
  };

  const seen = new Set<string>();
  const valid: { owner_id: string; name: string; phone: string; group_label: string | null }[] = [];
  let skipped = 0;

  for (const row of rows) {
    const name = pick(row, ['الاسم', 'اسم', 'name']);
    const phoneRaw = pick(row, ['الجوال', 'جوال', 'الهاتف', 'phone', 'mobile', 'رقم']);
    const group = pick(row, ['المجموعة', 'مجموعة', 'group', 'التصنيف']) || null;

    if (!name || !isValidPhone(phoneRaw)) { skipped++; continue; }
    const phone = normalizePhone(phoneRaw);
    if (seen.has(phone)) { skipped++; continue; }
    seen.add(phone);
    valid.push({ owner_id: user.id, name, phone, group_label: group });
  }

  if (valid.length === 0) {
    return { error: 'لم يُقرأ أي صف صالح. تأكد من عمودَي «الاسم» و«الجوال».' };
  }

  const { data, error } = await supabase
    .from('contacts')
    .upsert(valid, { onConflict: 'owner_id,phone', ignoreDuplicates: true })
    .select('id');

  if (error) return { error: 'تعذّر حفظ الجهات.' };

  const added = data?.length ?? 0;
  let msg = `أُضيفت ${added} جهة.`;
  if (valid.length - added > 0) msg += ` (${valid.length - added} مكررة تم تجاهلها)`;
  if (skipped > 0) msg += ` (${skipped} صفاً غير صالح)`;

  revalidatePath('/app/contacts');
  return { notice: msg };
}

export async function deleteContact(formData: FormData) {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from('contacts').delete()
    .eq('id', String(formData.get('contact_id') ?? '')).eq('owner_id', user.id);
  revalidatePath('/app/contacts');
}

/** حذف الدفتر كاملاً — حق المحو في نظام حماية البيانات (SPEC §7). */
export async function deleteAllContacts(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const supabase = await createClient();

  if (String(formData.get('confirm') ?? '').trim() !== 'حذف') {
    return { error: 'اكتب كلمة «حذف» للتأكيد.' };
  }

  const { error } = await supabase.from('contacts').delete().eq('owner_id', user.id);
  if (error) return { error: 'تعذّر حذف الدفتر.' };

  await supabase.from('activity_logs').insert({
    actor_id: user.id, action: 'contacts.purged', target_type: 'profile', target_id: user.id,
  });

  revalidatePath('/app/contacts');
  return { notice: 'حُذف دفتر العناوين بالكامل.' };
}
