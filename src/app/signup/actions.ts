'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { normalizePhone, isValidPhone } from '@/lib/format';

export interface SignupState { error?: string; notice?: string }

/**
 * إنشاء حساب عميل. الحساب دائم ويجمع كل مناسبات صاحبه عبر السنين
 * (SPEC §0) — لا حساب لكل مناسبة.
 */
export async function signUp(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const fullName = String(formData.get('full_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const rawPhone = String(formData.get('phone') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const consent = formData.get('consent') === 'on';

  if (!fullName) return { error: 'اكتب اسمك الكامل.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'أدخل بريداً إلكترونياً صحيحاً.' };
  if (!isValidPhone(rawPhone)) return { error: 'رقم الجوال غير صالح. مثال: 0555123456' };
  if (password.length < 8) return { error: 'كلمة المرور يجب أن تكون ٨ أحرف على الأقل.' };
  if (!consent) return { error: 'يلزم الموافقة على الشروط لإنشاء الحساب.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role: 'user', full_name: fullName, phone: normalizePhone(rawPhone) },
    },
  });

  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      return { error: 'هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك.' };
    }
    return { error: 'تعذّر إنشاء الحساب. حاول مرة أخرى.' };
  }

  // المشروع قد يشترط تأكيد البريد قبل تفعيل الجلسة
  if (!data.session) {
    return { notice: 'أُنشئ حسابك. تحقّق من بريدك لتأكيد التسجيل ثم سجّل الدخول.' };
  }

  revalidatePath('/', 'layout');
  redirect('/app');
}
