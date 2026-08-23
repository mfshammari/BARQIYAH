'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { normalizePhone, isValidPhone } from '@/lib/format';

export interface ActionState { error?: string; notice?: string }

export async function updateAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const supabase = await createClient();

  const fullName = String(formData.get('full_name') ?? '').trim();
  const rawPhone = String(formData.get('phone') ?? '').trim();

  if (!fullName) return { error: 'الاسم مطلوب.' };
  if (rawPhone && !isValidPhone(rawPhone)) return { error: 'رقم الجوال غير صالح.' };

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, phone: rawPhone ? normalizePhone(rawPhone) : null })
    .eq('id', user.id);

  if (error) return { error: 'تعذّر حفظ البيانات.' };
  revalidatePath('/app/settings');
  return { notice: 'حُفظت بيانات حسابك.' };
}
